import type { Report, Seed } from "../types.ts";
import { t } from "../i18n/index.ts";
import { $, formatTime } from "./dom.ts";
import { drawCandidates, videoBox } from "./overlay.ts";
import { choosableAthlete, multiPersonFrames } from "../core/track.ts";
/** Frames with more than one detected person, where the athlete can be chosen. */
export const multiFrames = (r: Report) => multiPersonFrames(r.samples);
export const canChoose = (r: Report) => choosableAthlete(r.samples);
/** Index of the currently analysed person among the frame's candidates (the tracker reuses the same array). */
export const currentCandidate = (s: Report["samples"][number]): number | null => { const k = s.candidates?.indexOf(s.landmarks) ?? -1; return s.landmarks.length && k >= 0 ? k : null; };
export function pickAthlete(r: Report, player: HTMLVideoElement, accent: string, auto = false): Promise<Seed | null> {
 const frames = multiFrames(r); if (!frames.length) return Promise.resolve(null);
 $("picker-text").textContent = t(auto ? "picker.textAuto" : "picker.text"); $("picker-cancel").textContent = t(auto ? "picker.keep" : "app.cancel");
 const dialog = $<HTMLDialogElement>("picker-dialog"), canvas = $<HTMLCanvasElement>("picker-canvas"), image = $<HTMLCanvasElement>("picker-frame");
 // Start where the analysed person is visible next to others, with them preselected.
 let pos = Math.max(0, frames.findIndex(i => currentCandidate(r.samples[i]) !== null)), chosen: number | null = currentCandidate(r.samples[frames[pos]]), hits: { x0: number; y0: number; x1: number; y1: number }[] = [];
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
  hits = drawCandidates(canvas, vw, vh, s.candidates ?? [], accent, selected, r.threshold);
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
