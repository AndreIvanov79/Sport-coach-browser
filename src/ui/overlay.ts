import type { Landmark, Sample } from "../types.ts";
import { observed } from "../core/body.ts";
import { angle } from "../core/geometry.ts";
import { LINKS } from "../core/landmarks.ts";
import { personGeometry } from "../core/track.ts";
export type Box = { ox: number; oy: number; w: number; h: number };
export function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
 const width = canvas.clientWidth, height = canvas.clientHeight, dpr = devicePixelRatio || 1;
 if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
 const ctx = canvas.getContext("2d"); if (!ctx) return null;
 ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); return ctx;
}
/** Letterboxed video area inside the element (object-fit: contain). */
export function videoBox(canvas: HTMLCanvasElement, vw: number, vh: number): Box {
 const width = canvas.clientWidth, height = canvas.clientHeight, scale = Math.min(width / vw, height / vh), w = vw * scale, h = vh * scale;
 return { ox: (width - w) / 2, oy: (height - h) / 2, w, h };
}
export type PoseStyle = { accent: string; threshold: number; skeleton?: boolean; angles?: [number, number, number][]; mirror?: boolean; dim?: boolean };
export function drawLandmarks(ctx: CanvasRenderingContext2D, lms: Landmark[], box: Box, style: PoseStyle, aspect: { w: number; h: number }) {
 const px = (i: number) => ({ x: box.ox + (style.mirror ? 1 - lms[i].x : lms[i].x) * box.w, y: box.oy + lms[i].y * box.h });
 const ok = (i: number) => observed(lms[i], style.threshold);
 ctx.globalAlpha = style.dim ? .55 : 1; ctx.lineWidth = 2.5; ctx.strokeStyle = style.accent;
 for (const [a, b] of LINKS) if (ok(a) && ok(b)) { ctx.beginPath(); ctx.moveTo(px(a).x, px(a).y); ctx.lineTo(px(b).x, px(b).y); ctx.stroke(); }
 for (let i = 0; i < Math.min(33, lms.length); i++) if (ok(i)) { const p = px(i); ctx.beginPath(); ctx.arc(p.x, p.y, i < 11 ? 2.5 : 3.5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = style.accent; ctx.stroke(); }
 if (style.angles) {
  ctx.font = "600 12px ui-monospace, monospace"; ctx.textBaseline = "middle";
  for (const [a, b, c] of style.angles) {
   if (!ok(a) || !ok(b) || !ok(c)) continue;
   const v = angle({ x: lms[a].x * aspect.w, y: lms[a].y * aspect.h }, { x: lms[b].x * aspect.w, y: lms[b].y * aspect.h }, { x: lms[c].x * aspect.w, y: lms[c].y * aspect.h });
   if (v === null) continue;
   const p = px(b), text = Math.round(v) + "°", wd = ctx.measureText(text).width + 8;
   // Labels go outward (away from the body midline) so left/right joints do not overlap.
   const mids = [11, 12, 23, 24].filter(ok).map(i => px(i).x), cx = mids.length ? mids.reduce((x, y) => x + y, 0) / mids.length : p.x;
   const x0 = p.x < cx ? p.x - 7 - wd : p.x + 7;
   ctx.fillStyle = "#0c161bdd"; ctx.fillRect(x0, p.y - 9, wd, 18); ctx.fillStyle = style.accent; ctx.fillText(text, x0 + 4, p.y);
  }
 }
 ctx.globalAlpha = 1;
}
export function drawPose(canvas: HTMLCanvasElement, video: HTMLVideoElement, sample: Sample | undefined, style: PoseStyle): void {
 const ctx = prepare(canvas); if (!ctx || !sample || sample.reason || !sample.landmarks.length || !video.videoWidth || !video.videoHeight) return;
 drawLandmarks(ctx, sample.landmarks, videoBox(canvas, video.videoWidth, video.videoHeight), style, { w: sample.width || video.videoWidth, h: sample.height || video.videoHeight });
}
/** All detected people with numbered boxes (athlete picker). Returns hit boxes in canvas CSS pixels. */
/** High-contrast colours for telling people apart (cyan, yellow, magenta), the same in the picker and the player. */
export const PEOPLE = ["#00e5ff", "#ffe600", "#ff3edb"];
/** All detected people with numbered boxes (athlete picker). Returns hit boxes in canvas CSS pixels. */
export function drawCandidates(canvas: HTMLCanvasElement, vw: number, vh: number, candidates: Landmark[][], selected: number | null, threshold: number, selectedLabel: string): { x0: number; y0: number; x1: number; y1: number }[] {
 const ctx = prepare(canvas); if (!ctx) return [];
 const box = videoBox(canvas, vw, vh), hits: { x0: number; y0: number; x1: number; y1: number }[] = [];
 // Unselected first, so the chosen person's box and skeleton are drawn on top.
 const order = candidates.map((_, k) => k).sort((a, z) => (a === selected ? 1 : 0) - (z === selected ? 1 : 0));
 candidates.forEach(lms => { const g = personGeometry(lms, 1, 1); hits.push(g ? { x0: box.ox + g.minX * box.w - 8, y0: box.oy + g.minY * box.h - 8, x1: box.ox + g.maxX * box.w + 8, y1: box.oy + g.maxY * box.h + 8 } : { x0: 0, y0: 0, x1: 0, y1: 0 }); });
 for (const k of order) {
  const h = hits[k]; if (h.x1 === 0) continue;
  const color = PEOPLE[k % PEOPLE.length], on = k === selected;
  if (on) { ctx.fillStyle = color + "26"; ctx.fillRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); }
  drawLandmarks(ctx, candidates[k], box, { accent: color, threshold: Math.min(threshold, .5), dim: !on && selected !== null }, { w: vw, h: vh });
  ctx.strokeStyle = color; ctx.lineWidth = on ? 4 : 2.5; ctx.setLineDash(on ? [] : [8, 6]);
  ctx.shadowColor = "#000"; ctx.shadowBlur = 6; ctx.strokeRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); ctx.setLineDash([]);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(h.x0 + 16, h.y0 + 16, 15, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#000"; ctx.font = "800 16px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(k + 1), h.x0 + 16, h.y0 + 17); ctx.textAlign = "start";
  if (on && selectedLabel) {
   ctx.font = "700 12px system-ui"; const w = ctx.measureText(selectedLabel).width + 12;
   ctx.fillStyle = color; ctx.fillRect(h.x0 + 36, h.y0 + 6, w, 20); ctx.fillStyle = "#000"; ctx.fillText(selectedLabel, h.x0 + 42, h.y0 + 17);
  }
 }
 return hits;
}
/** Small stick figure for progress feedback. */
export function drawMini(canvas: HTMLCanvasElement, lms: Landmark[] | undefined, aspect: number, accent: string) {
 const ctx = prepare(canvas); if (!ctx || !lms?.length) return;
 const W = canvas.clientWidth, H = canvas.clientHeight, s = Math.min(W / aspect, H), w = s * aspect;
 drawLandmarks(ctx, lms, { ox: (W - w) / 2, oy: (H - s) / 2, w, h: s }, { accent, threshold: .5 }, { w: aspect, h: 1 });
}
