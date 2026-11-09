// "Share report": a PNG card made on the device (frame with the skeleton, key figures, main findings) that the coach
// sends to the athlete through the system share sheet, or downloads where sharing files is not supported.
// The video picture is blurred by default (people in the frame); the skeleton stays sharp.
import type { Finding, Report, Sample, Scalar } from "../types.ts";
import { t } from "../i18n/index.ts";
import { profiles } from "../profiles.ts";
import { toSummary } from "../handoff/summary.ts";
import { reportCount } from "../handoff/coach.ts";
import { drawLandmarks } from "./overlay.ts";
import { findingTitle } from "./report-view.ts";
import { download, esc, formatTime, icon, toast, valueWithUnit } from "./dom.ts";

export const CARD = { w: 1080, h: 1350 };
const PAD = 64, IMAGE = { y: 300, h: 560 };
/** Dot colours by tone, fixed (not the sport accent) so a fault never looks like a strength. */
const TONE: Record<string, string> = { attention: "#efb184", good: "#a6d86e", info: "#9faeaa" };

/** The moment shown on the card: the focus finding, else the first rep/strike/element, else the middle; nearest pose. */
export function cardSample(r: Report): Sample | null {
  const timed = (f: Finding) => f.times?.[0] ?? f.time;
  const focus = r.findings.find(f => f.focus && timed(f) !== undefined);
  const target = (focus && timed(focus)) ?? r.cycles[0]?.peak ?? r.strikes?.[0]?.time ?? r.rg?.events[0]?.peak ?? r.duration / 2;
  let best: Sample | null = null;
  for (const s of r.samples) if (!s.reason && s.landmarks.length && (!best || Math.abs(s.time - target) < Math.abs(best.time - target))) best = s;
  return best;
}

/** Up to `max` technique figures in the report's priority order; counts are left to the subtitle. */
export function cardFigures(r: Report, max = 4): Scalar[] {
  return r.scalars.filter(s => s.value !== null && Number.isFinite(s.value) && s.unit !== "count").slice(0, max);
}

/**
 * Part of the frame to show (pixels): the athlete with room around, in the image area's proportions where the frame
 * allows, so a small figure in a wide or tall shot is not lost on the card.
 */
export function cardCrop(sample: Sample, fw: number, fh: number, aspect: number): { sx: number; sy: number; sw: number; sh: number } {
  const pts = sample.landmarks.filter(p => (p.visibility ?? 1) >= .5 && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 4) return { sx: 0, sy: 0, sw: fw, sh: fh };
  const xs = pts.map(p => Math.min(1, Math.max(0, p.x)) * fw), ys = pts.map(p => Math.min(1, Math.max(0, p.y)) * fh);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let sh = Math.max((y1 - y0) * 1.6, (x1 - x0) * 1.6 / aspect, fh * .3), sw = sh * aspect;
  if (sw > fw) { sw = fw; sh = Math.min(fh, Math.max(sh, sw / aspect)); }
  if (sh > fh) { sh = fh; sw = Math.min(fw, sh * aspect); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { sx: Math.min(fw - sw, Math.max(0, cx - sw / 2)), sy: Math.min(fh - sh, Math.max(0, cy - sh / 2)), sw, sh };
}

/** The same findings, in the same order, as the summary sent to Coach Desk Lite. */
export function cardFindings(r: Report): Finding[] {
  const { f } = toSummary({ id: "card", sport: r.sport, exercise: "auto", createdAt: 0, duration: 0, coverage: 0, count: null, scalars: [], findings: r.findings });
  return f.map(code => r.findings.find(x => x.code === code)!).filter(Boolean);
}

/** The movement for the title; null when it was left on "auto" and not recognised. */
export function movementName(r: Report): string | null {
  const detected = r.exerciseInfo?.detected;
  if (r.exercise === "auto") return detected ? t("exn." + detected) : null;
  return t("ex." + r.sport + "." + r.exercise);
}

function countLine(r: Report): string {
  const n = reportCount(r);
  const label = r.sport === "boxing" ? "sum.strikes" : r.sport === "rg" ? "sum.elements" : "sum.reps";
  return [formatTime(r.duration), n === null ? "" : t(label) + ": " + n, t("card.coverage", { pct: Math.round(r.coverage * 100) })].filter(Boolean).join(" · ");
}

function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > width) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

const seeked = (video: HTMLVideoElement) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); video.removeEventListener("seeked", done); video.removeEventListener("error", done); resolve(); };
  const timer = setTimeout(done, 3000);
  video.addEventListener("seeked", done); video.addEventListener("error", done);
});

/** Copies the frame at `time` from the player and puts the player back where it was. */
async function grabFrame(video: HTMLVideoElement | null, time: number): Promise<HTMLCanvasElement | null> {
  if (!video || !video.getAttribute("src") || video.readyState < 1 || !video.videoWidth) return null;
  const was = video.currentTime;
  video.pause();
  if (Math.abs(video.currentTime - time) > 1e-3) { const wait = seeked(video); video.currentTime = time; await wait; }
  let frame: HTMLCanvasElement | null = null;
  try {
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    frame = document.createElement("canvas");
    frame.width = Math.round(video.videoWidth * scale); frame.height = Math.round(video.videoHeight * scale);
    frame.getContext("2d")!.drawImage(video, 0, 0, frame.width, frame.height);
  } catch { frame = null; }
  if (Math.abs(video.currentTime - was) > 1e-3) { const wait = seeked(video); video.currentTime = was; await wait; }
  return frame;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export type CardOptions = { video: HTMLVideoElement | null; blur: boolean };

export async function renderCard(r: Report, opts: CardOptions): Promise<HTMLCanvasElement> {
  const accent = profiles[r.sport].accent, c = document.createElement("canvas");
  c.width = CARD.w; c.height = CARD.h;
  const ctx = c.getContext("2d")!, font = (weight: number, size: number) => weight + " " + size + "px Inter, ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const inner = CARD.w - 2 * PAD;
  ctx.fillStyle = "#121619"; ctx.fillRect(0, 0, CARD.w, CARD.h);
  ctx.textBaseline = "alphabetic";

  // Header: app icon, sport, date.
  const logo = await loadImage("./icons/icon-192.png");
  if (logo) { ctx.save(); roundRect(ctx, PAD, 60, 76, 76, 18); ctx.clip(); ctx.drawImage(logo, PAD, 60, 76, 76); ctx.restore(); }
  const textX = PAD + (logo ? 100 : 0);
  ctx.fillStyle = "#e9eeeb"; ctx.font = font(650, 38); ctx.fillText(fit(ctx, t("sport." + r.sport + ".name"), inner - 300), textX, 96);
  const date = new Date(r.createdAt).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = "#93a09e"; ctx.font = font(400, 26); ctx.fillText(fit(ctx, date, inner - 100), textX, 132);

  // Movement and counts.
  ctx.fillStyle = "#e9eeeb"; ctx.font = font(600, 54); ctx.fillText(fit(ctx, movementName(r) ?? t("card.title"), inner), PAD, 218);
  ctx.fillStyle = "#93a09e"; ctx.font = font(400, 28); ctx.fillText(fit(ctx, countLine(r), inner), PAD, 262);

  // Frame with the skeleton.
  const sample = cardSample(r), frame = sample ? await grabFrame(opts.video, sample.time) : null;
  ctx.save(); roundRect(ctx, PAD, IMAGE.y, inner, IMAGE.h, 28); ctx.clip();
  ctx.fillStyle = "#0b0f11"; ctx.fillRect(PAD, IMAGE.y, inner, IMAGE.h);
  // Landmarks are fractions of the analysed frame; the copied frame may be scaled down, the crop is in its pixels.
  const fw = frame?.width || sample?.width || 16, fh = frame?.height || sample?.height || 9;
  const crop = sample ? cardCrop(sample, fw, fh, inner / IMAGE.h) : { sx: 0, sy: 0, sw: fw, sh: fh };
  const scale = Math.min(inner / crop.sw, IMAGE.h / crop.sh), dw = crop.sw * scale, dh = crop.sh * scale;
  const dx = PAD + (inner - dw) / 2, dy = IMAGE.y + (IMAGE.h - dh) / 2;
  const box = { ox: dx - crop.sx * scale, oy: dy - crop.sy * scale, w: fw * scale, h: fh * scale };
  if (frame) {
    if (opts.blur) {
      // Down- and up-scaling blurs the same way in every browser (canvas filters are not everywhere).
      const small = document.createElement("canvas");
      small.width = Math.max(8, Math.round(crop.sw / 30)); small.height = Math.max(8, Math.round(crop.sh / 30));
      const sctx = small.getContext("2d")!; sctx.imageSmoothingQuality = "high"; sctx.drawImage(frame, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(small, dx, dy, dw, dh);
      ctx.fillStyle = "#0c1012a0"; ctx.fillRect(dx, dy, dw, dh);
    } else ctx.drawImage(frame, crop.sx, crop.sy, crop.sw, crop.sh, dx, dy, dw, dh);
  }
  if (sample) {
    const k = 2.4; // thicker lines and dots: the card is seen small in a chat
    ctx.save(); ctx.scale(k, k);
    drawLandmarks(ctx, sample.landmarks, { ox: box.ox / k, oy: box.oy / k, w: box.w / k, h: box.h / k }, { accent, threshold: r.threshold }, { w: sample.width || fw, h: sample.height || fh });
    ctx.restore();
  }
  ctx.restore();

  // Key figures.
  let y = IMAGE.y + IMAGE.h + 70;
  const figures = cardFigures(r), findings = cardFindings(r);
  for (const s of figures.slice(0, findings.length ? 4 : 5)) {
    const value = valueWithUnit(s.value, s.unit, s.digits ?? 1);
    ctx.font = font(650, 36); const vw = ctx.measureText(value).width;
    ctx.fillStyle = accent; ctx.textAlign = "right"; ctx.fillText(value, CARD.w - PAD, y); ctx.textAlign = "left";
    ctx.fillStyle = "#c9d2cd"; ctx.font = font(400, 30); ctx.fillText(fit(ctx, t("s." + s.id), inner - vw - 30), PAD, y);
    y += 54;
  }

  // Main findings.
  if (findings.length) {
    y += 14; ctx.strokeStyle = "#2c3437"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y - 36); ctx.lineTo(CARD.w - PAD, y - 36); ctx.stroke();
    for (const f of findings) {
      if (y > CARD.h - 90) break;
      ctx.fillStyle = TONE[f.tone] ?? TONE.info; ctx.beginPath(); ctx.arc(PAD + 9, y - 10, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e9eeeb"; ctx.font = font(f.focus ? 600 : 400, 30); ctx.fillText(fit(ctx, findingTitle(r, f), inner - 36), PAD + 34, y);
      y += 50;
    }
  }

  // Footer.
  ctx.fillStyle = "#6f7d79"; ctx.font = font(400, 22); ctx.fillText(fit(ctx, t("card.footer"), inner), PAD, CARD.h - 40);
  return c;
}

export const cardBlob = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error("toBlob")), "image/png"));

export function cardFileName(r: Report): string { return r.sport + "-report-" + r.createdAt.slice(0, 10) + "-" + r.id.slice(0, 6) + ".png"; }

/** Opens the preview dialog with a blur switch, "Share" (where files can be shared) and "Download". */
export function openShareDialog(r: Report, video: HTMLVideoElement | null): void {
  document.getElementById("share-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "share-dialog"; dialog.className = "share-dialog";
  const hasVideo = !!video?.getAttribute("src");
  dialog.innerHTML = "<button class=\"dialog-close\" data-close aria-label=\"" + esc(t("app.close")) + "\">" + icon("close") + "</button>" +
    "<div class=\"eyebrow\">" + esc(t("share.eyebrow")) + "</div><h2>" + esc(t("share.title")) + "</h2><p class=\"muted mini\">" + esc(t("share.text")) + "</p>" +
    "<div class=\"share-preview\"><img alt=\"\" hidden><span class=\"mini muted\">" + esc(t("share.making")) + "</span></div>" +
    (hasVideo ? "<label class=\"toggle\"><input type=\"checkbox\" data-blur checked> <span>" + esc(t("share.blur")) + "</span></label>" : "<p class=\"mini muted\">" + esc(t("share.noVideo")) + "</p>") +
    "<div class=\"share-buttons\"><button class=\"primary\" data-share disabled>" + icon("arrow", 17) + " <span>" + esc(t("share.share")) + "</span></button><button class=\"small-button\" data-download disabled>" + icon("download", 16) + " <span>" + esc(t("share.download")) + "</span></button></div>" +
    "<p class=\"mini muted\" data-note hidden>" + esc(t("share.unsupported")) + "</p>";
  document.body.append(dialog);
  const img = dialog.querySelector("img")!, wait = dialog.querySelector(".share-preview span") as HTMLElement;
  const shareBtn = dialog.querySelector<HTMLButtonElement>("[data-share]")!, downloadBtn = dialog.querySelector<HTMLButtonElement>("[data-download]")!;
  const blur = dialog.querySelector<HTMLInputElement>("[data-blur]");
  let file: File | null = null, url = "", run = 0;
  const canShareFiles = (f: File) => { try { return !!navigator.canShare?.({ files: [f] }); } catch { return false; } };
  const make = async () => {
    const mine = ++run; shareBtn.disabled = downloadBtn.disabled = true; wait.hidden = false;
    try {
      const canvas = await renderCard(r, { video: hasVideo ? video : null, blur: blur ? blur.checked : true });
      const blob = await cardBlob(canvas);
      if (mine !== run) return;
      file = new File([blob], cardFileName(r), { type: "image/png" });
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob); img.src = url; img.hidden = false; wait.hidden = true;
      const sharable = canShareFiles(file);
      shareBtn.hidden = !sharable; (dialog.querySelector("[data-note]") as HTMLElement).hidden = sharable;
      shareBtn.disabled = downloadBtn.disabled = false;
    } catch (error) {
      console.warn("[sport-coach] share card", error); wait.textContent = t("share.failed");
    }
  };
  if (blur) blur.onchange = () => void make();
  shareBtn.onclick = async () => {
    if (!file) return;
    try { await navigator.share({ files: [file], title: t("share.title") }); }
    catch (error) { if ((error as Error).name !== "AbortError") { console.warn("[sport-coach] share", error); toast(t("share.unsupported")); } }
  };
  downloadBtn.onclick = () => { if (file) { download(file, file.name); toast(t("share.downloaded")); } };
  const close = () => dialog.close();
  dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
  dialog.addEventListener("close", () => { if (url) URL.revokeObjectURL(url); dialog.remove(); });
  dialog.showModal();
  void make();
}
