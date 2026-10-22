import type { Report, Seed } from "../types.ts";
import { t } from "../i18n/index.ts";
import { $, formatTime } from "./dom.ts";
import { drawCandidates, videoBox } from "./overlay.ts";
import { choosableAthlete, multiPersonFrames, personGeometry } from "../core/track.ts";
/** Frames with more than one detected person, where the athlete can be chosen. */
export const multiFrames = (r: Report) => multiPersonFrames(r.samples);
export const canChoose = (r: Report) => choosableAthlete(r.samples);
/** Index of the currently analysed person among the frame's candidates (the tracker reuses the same array). */
export const currentCandidate = (s: Report["samples"][number]): number | null => { const k = s.candidates?.indexOf(s.landmarks) ?? -1; return s.landmarks.length && k >= 0 ? k : null; };
/** Frames to show for choosing, clearest first: people far apart (little box overlap), large, the analysed person
 * among them; neighbouring picks are at least 0.75 s apart so the list shows different moments. */
export function clearFrames(r: Report, limit = 24): number[] {
 const scored = multiPersonFrames(r.samples).map(i => {
  const s = r.samples[i], boxes = (s.candidates ?? []).map(c => personGeometry(c, s.width, s.height)).filter((g): g is NonNullable<typeof g> => !!g);
  if (boxes.length < 2) return { i, score: -1 };
  let overlap = 0;
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
   const A = boxes[a], B = boxes[b], ix = Math.max(0, Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX)), iy = Math.max(0, Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY));
   const small = Math.min((A.maxX - A.minX) * (A.maxY - A.minY), (B.maxX - B.minX) * (B.maxY - B.minY)); overlap = Math.max(overlap, small > 0 ? ix * iy / small : 1);
  }
  const size = Math.min(...boxes.map(g => g.height)) / s.height;
  // Real people persist: each box has a neighbour-frame box nearby. A one-frame phantom skeleton does not.
  const near = (j: number, g: (typeof boxes)[number]) => (r.samples[j]?.candidates ?? []).some(c => { const q = personGeometry(c, s.width, s.height); return !!q && Math.hypot(q.cx - g.cx, q.cy - g.cy) < .6 * g.scale; });
  const stable = boxes.every(g => near(i - 1, g) && near(i + 1, g));
  return { i, score: (1 - overlap) * 2 + Math.min(1, size / .4) + (currentCandidate(s) !== null ? .5 : 0) + (stable ? 1 : 0) };
 }).sort((a, z) => z.score - a.score);
 const out: number[] = [];
 for (const f of scored) { if (out.length >= limit) break; if (out.every(j => Math.abs(r.samples[j].time - r.samples[f.i].time) >= .75)) out.push(f.i); }
 return out;
}
export function pickAthlete(r: Report, player: HTMLVideoElement, auto = false): Promise<Seed | null> {
 const frames = clearFrames(r); if (!frames.length) return Promise.resolve(null);
 $("picker-text").textContent = t(auto ? "picker.textAuto" : "picker.text"); $("picker-cancel").textContent = t(auto ? "picker.keep" : "app.cancel");
 const dialog = $<HTMLDialogElement>("picker-dialog"), canvas = $<HTMLCanvasElement>("picker-canvas"), image = $<HTMLCanvasElement>("picker-frame");
 // Start where the analysed person is visible next to others, with them preselected.
 let pos = 0, chosen: number | null = currentCandidate(r.samples[frames[0]]), hits: { x0: number; y0: number; x1: number; y1: number }[] = [];
 const render = async () => {
  const idx = frames[pos], s = r.samples[idx];
  $("picker-time").textContent = t("picker.frame", { time: formatTime(s.time), n: pos + 1, total: frames.length });
  player.pause();
  if (Math.abs(player.currentTime - s.time) > .01) await new Promise<void>(resolve => { const done = () => { player.removeEventListener("seeked", done); resolve(); }; player.addEventListener("seeked", done); player.currentTime = s.time; setTimeout(done, 3000); });
  const vw = player.videoWidth || s.width, vh = player.videoHeight || s.height;
  const dpr = devicePixelRatio || 1; image.width = image.clientWidth * dpr; image.height = image.clientHeight * dpr;
  const ctx = image.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, image.clientWidth, image.clientHeight);
  const box = videoBox(image, vw, vh); try { ctx.drawImage(player, box.ox, box.oy, box.w, box.h); } catch { /* frame unavailable */ }
  const selected = chosen;
  hits = drawCandidates(canvas, vw, vh, s.candidates ?? [], selected, r.threshold, t("picker.selectedTag"));
  ($("picker-confirm") as HTMLButtonElement).disabled = chosen === null;
 };
 return new Promise(resolve => {
  const finish = (seed: Seed | null) => { dialog.close(); canvas.onclick = null; resolve(seed); };
  canvas.onclick = event => {
   const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
   const k = hits.findIndex(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1); if (k >= 0) { chosen = k; void render(); }
  };
  $("picker-prev").onclick = () => { pos = Math.max(0, pos - 1); chosen = currentCandidate(r.samples[frames[pos]]); void render(); };
  $("picker-next").onclick = () => { pos = Math.min(frames.length - 1, pos + 1); chosen = currentCandidate(r.samples[frames[pos]]); void render(); };
  $("picker-confirm").onclick = () => finish(chosen === null ? null : { index: frames[pos], candidate: chosen });
  $("picker-cancel").onclick = () => finish(null);
  dialog.oncancel = () => finish(null);
  dialog.showModal(); requestAnimationFrame(() => void render());
 });
}
