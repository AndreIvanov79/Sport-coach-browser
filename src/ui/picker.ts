import type { Report, Seed } from "../types.ts";
import { t } from "../i18n/index.ts";
import { $, formatTime } from "./dom.ts";
import { drawCandidates, videoBox } from "./overlay.ts";
/** Frames with more than one detected person, where the athlete can be chosen. */
export const multiFrames = (r: Report) => r.samples.map((s, i) => (s.candidates?.length ?? 0) > 1 ? i : -1).filter(i => i >= 0);
export function pickAthlete(r: Report, player: HTMLVideoElement, accent: string): Promise<Seed | null> {
 const frames = multiFrames(r); if (!frames.length) return Promise.resolve(null);
 const dialog = $<HTMLDialogElement>("picker-dialog"), canvas = $<HTMLCanvasElement>("picker-canvas"), image = $<HTMLCanvasElement>("picker-frame");
 let pos = Math.max(0, frames.indexOf(r.athlete.seed?.index ?? frames[0])), chosen: number | null = null, hits: { x0: number; y0: number; x1: number; y1: number }[] = [];
 const render = async () => {
  const idx = frames[pos], s = r.samples[idx];
  $("picker-time").textContent = t("picker.frame", { time: formatTime(s.time), n: pos + 1, total: frames.length });
  player.pause();
  if (Math.abs(player.currentTime - s.time) > .01) await new Promise<void>(resolve => { const done = () => { player.removeEventListener("seeked", done); resolve(); }; player.addEventListener("seeked", done); player.currentTime = s.time; setTimeout(done, 3000); });
  const vw = player.videoWidth || s.width, vh = player.videoHeight || s.height;
  const dpr = devicePixelRatio || 1; image.width = image.clientWidth * dpr; image.height = image.clientHeight * dpr;
  const ctx = image.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, image.clientWidth, image.clientHeight);
  const box = videoBox(image, vw, vh); try { ctx.drawImage(player, box.ox, box.oy, box.w, box.h); } catch { /* frame unavailable */ }
  const selected = chosen ?? (r.athlete.seed && r.athlete.seed.index === idx ? r.athlete.seed.candidate : null);
  hits = drawCandidates(canvas, vw, vh, s.candidates ?? [], accent, selected, r.threshold);
  ($("picker-confirm") as HTMLButtonElement).disabled = chosen === null;
 };
 return new Promise(resolve => {
  const finish = (seed: Seed | null) => { dialog.close(); canvas.onclick = null; resolve(seed); };
  canvas.onclick = event => {
   const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
   const k = hits.findIndex(h => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1); if (k >= 0) { chosen = k; void render(); }
  };
  $("picker-prev").onclick = () => { pos = Math.max(0, pos - 1); chosen = null; void render(); };
  $("picker-next").onclick = () => { pos = Math.min(frames.length - 1, pos + 1); chosen = null; void render(); };
  $("picker-confirm").onclick = () => finish(chosen === null ? null : { index: frames[pos], candidate: chosen });
  $("picker-cancel").onclick = () => finish(null);
  dialog.oncancel = () => finish(null);
  dialog.showModal(); requestAnimationFrame(() => void render());
 });
}
