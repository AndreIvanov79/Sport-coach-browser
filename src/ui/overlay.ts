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
export function drawCandidates(canvas: HTMLCanvasElement, vw: number, vh: number, candidates: Landmark[][], accent: string, selected: number | null, threshold: number): { x0: number; y0: number; x1: number; y1: number }[] {
 const ctx = prepare(canvas); if (!ctx) return [];
 const box = videoBox(canvas, vw, vh), hits: { x0: number; y0: number; x1: number; y1: number }[] = [];
 candidates.forEach((lms, k) => {
  const g = personGeometry(lms, 1, 1); if (!g) { hits.push({ x0: 0, y0: 0, x1: 0, y1: 0 }); return; }
  const x0 = box.ox + g.minX * box.w - 8, y0 = box.oy + g.minY * box.h - 8, x1 = box.ox + g.maxX * box.w + 8, y1 = box.oy + g.maxY * box.h + 8;
  hits.push({ x0, y0, x1, y1 });
  const color = k === selected ? accent : "#ffffff";
  drawLandmarks(ctx, lms, box, { accent: color, threshold: Math.min(threshold, .5), dim: k !== selected }, { w: vw, h: vh });
  ctx.strokeStyle = color; ctx.setLineDash(k === selected ? [] : [6, 5]); ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x0 + 14, y0 + 14, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111"; ctx.font = "700 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(k + 1), x0 + 14, y0 + 15); ctx.textAlign = "start";
 });
 return hits;
}
/** Small stick figure for progress feedback. */
export function drawMini(canvas: HTMLCanvasElement, lms: Landmark[] | undefined, aspect: number, accent: string) {
 const ctx = prepare(canvas); if (!ctx || !lms?.length) return;
 const W = canvas.clientWidth, H = canvas.clientHeight, s = Math.min(W / aspect, H), w = s * aspect;
 drawLandmarks(ctx, lms, { ox: (W - w) / 2, oy: (H - s) / 2, w, h: s }, { accent, threshold: .5 }, { w: aspect, h: 1 });
}
