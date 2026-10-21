import type { Landmark } from "../types.ts";
import { L } from "./landmarks.ts";
// Clothing colour signature of each detected person: mean RGB of the torso and of the thighs, sampled from a
// small downscaled copy of the analysed frame. It only helps keep the athlete's identity when people cross or
// swap places (pad work, sparring, a coach walking through the frame). Never stored with reports.
export type Look = { torso: number[]; legs: number[] | null };
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
type P = { x: number; y: number };
const VIS = .5;
/** Longest side of the downscaled frame used for colour sampling. */
export const LOOK_SIZE = 256;
function patch(px: Pixels, c: P, r: number): number[] | null {
 const x0 = Math.max(0, Math.round(c.x - r)), x1 = Math.min(px.width - 1, Math.round(c.x + r));
 const y0 = Math.max(0, Math.round(c.y - r)), y1 = Math.min(px.height - 1, Math.round(c.y + r));
 if (x1 < x0 || y1 < y0) return null;
 let R = 0, G = 0, B = 0, n = 0;
 for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const o = (y * px.width + x) * 4; R += px.data[o]; G += px.data[o + 1]; B += px.data[o + 2]; n++; }
 return n ? [R / n / 255, G / n / 255, B / n / 255] : null;
}
// Channel-wise median of several small patches: robust to a glove or forearm covering part of the torso.
const median = (v: (number[] | null)[]) => { const f = v.filter((x): x is number[] => !!x); if (!f.length) return null; return [0, 1, 2].map(c => { const s = f.map(x => x[c]).sort((a, z) => a - z), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }); };
const at = (a: P, b: P, f: number): P => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
export function sampleLooks(px: Pixels, poses: Landmark[][]): (Look | null)[] {
 return poses.map(lms => {
  const p = (k: number): P | null => { const q = lms[k]; return q && (q.visibility ?? 0) >= VIS && Number.isFinite(q.x) && Number.isFinite(q.y) ? { x: q.x * px.width, y: q.y * px.height } : null; };
  const ls = p(L.lShoulder), rs = p(L.rShoulder), lh = p(L.lHip), rh = p(L.rHip);
  if (!ls || !rs || !lh || !rh) return null;
  const sm = at(ls, rs, .5), hm = at(lh, rh, .5), torso = Math.hypot(sm.x - hm.x, sm.y - hm.y);
  if (torso < 4) return null; // the person is too small in the sampled frame
  const r = Math.max(1, torso * .08), left = at(ls, lh, .5), right = at(rs, rh, .5);
  const body = median([.3, .5, .7].map(f => patch(px, at(sm, hm, f), r)).concat([.35, .65].map(f => patch(px, at(at(left, right, .5), left, f), r)), [.35, .65].map(f => patch(px, at(at(left, right, .5), right, f), r))));
  if (!body) return null;
  const legs = median([[lh, p(L.lKnee)], [rh, p(L.rKnee)]].flatMap(([h, k]) => k ? [.3, .6].map(f => patch(px, at(h!, k, f), r)) : []));
  return { torso: body, legs };
 });
}
const d3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** 0 = identical colours; ~0.05-0.1 frame-to-frame noise; > 0.3 clearly different clothing. The torso weighs more:
 * legs are often similar (dark tights, shorts) and are occluded more often. */
export function lookDistance(a: Look, b: Look): number {
 return a.legs && b.legs ? .7 * d3(a.torso, b.torso) + .3 * d3(a.legs, b.legs) : d3(a.torso, b.torso);
}
export function blendLook(ref: Look, cur: Look, w: number): Look {
 const mix = (a: number[], b: number[]) => a.map((v, i) => v * (1 - w) + b[i] * w);
 return { torso: mix(ref.torso, cur.torso), legs: ref.legs && cur.legs ? mix(ref.legs, cur.legs) : ref.legs ?? cur.legs };
}
/** Draws `source` into a reusable small canvas and returns its pixels (null if the canvas cannot be read). */
export function lookPixels(canvas: HTMLCanvasElement | OffscreenCanvas, source: CanvasImageSource, w: number, h: number): Pixels | null {
 const k = Math.min(1, LOOK_SIZE / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
 if (canvas.width !== cw) canvas.width = cw; if (canvas.height !== ch) canvas.height = ch;
 const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
 if (!ctx) return null;
 try { ctx.drawImage(source, 0, 0, cw, ch); const img = ctx.getImageData(0, 0, cw, ch); return { data: img.data, width: cw, height: ch }; } catch { return null; }
}
