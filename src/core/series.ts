import type { Metric } from '../types.ts';
import type { Body } from './body.ts';
import type { Point } from './geometry.ts';
import { DOWN, UP, angle, dist, midpoint, sub, vecAngle } from './geometry.ts';
import { L } from './landmarks.ts';
import { percentile } from './stats.ts';
export type Get = (k: number) => Point | null;
export type SeriesDef = { unit: 'deg' | 'torso'; fn: (p: Get, torso: number | null) => number | null };
const joint = (a: number, b: number, c: number): SeriesDef => ({ unit: 'deg', fn: p => { const A = p(a), B = p(b), C = p(c); return A && B && C ? angle(A, B, C) : null; } });
const mid = (p: Get, a: number, b: number) => { const A = p(a), B = p(b); return A && B ? midpoint(A, B) : null; };
export const SERIES: Record<string, SeriesDef> = {
 leftKnee: joint(L.lHip, L.lKnee, L.lAnkle), rightKnee: joint(L.rHip, L.rKnee, L.rAnkle),
 leftElbow: joint(L.lShoulder, L.lElbow, L.lWrist), rightElbow: joint(L.rShoulder, L.rElbow, L.rWrist),
 leftHip: joint(L.lShoulder, L.lHip, L.lKnee), rightHip: joint(L.rShoulder, L.rHip, L.rKnee),
 leftShoulder: joint(L.lElbow, L.lShoulder, L.lHip), rightShoulder: joint(L.rElbow, L.rShoulder, L.rHip),
 // Trunk inclination from image vertical: 0 upright, 90 horizontal, 180 inverted.
 trunk: { unit: 'deg', fn: p => { const s = mid(p, L.lShoulder, L.rShoulder), h = mid(p, L.lHip, L.rHip); return s && h ? vecAngle(sub(s, h), UP) : null; } },
 headTilt: { unit: 'deg', fn: p => {
  const a = p(L.lEye), b = p(L.rEye); if (!a || !b) return null; let dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 3) return null; if (dx < 0) { dx = -dx; dy = -dy; } return Math.atan2(dy, dx) * 180 / Math.PI; } },
 headShift: { unit: 'torso', fn: (p, t) => { const n = p(L.nose), s = mid(p, L.lShoulder, L.rShoulder); return n && s && t ? (n.x - s.x) / t : null; } },
 headHeight: { unit: 'torso', fn: (p, t) => { const n = p(L.nose), s = mid(p, L.lShoulder, L.rShoulder); return n && s && t ? (s.y - n.y) / t : null; } },
 // qwen36 split_angle_series: angle between the two hip->ankle vectors.
 split: { unit: 'deg', fn: p => { const lh = p(L.lHip), la = p(L.lAnkle), rh = p(L.rHip), ra = p(L.rAnkle); return lh && la && rh && ra ? vecAngle(sub(la, lh), sub(ra, rh)) : null; } },
 // qwen36 leg_lift_series: highest hip->ankle elevation from the image down-vector.
 legLift: { unit: 'deg', fn: p => {
  let best: number | null = null;
  for (const [h, a] of [[L.lHip, L.lAnkle], [L.rHip, L.rAnkle]]) { const H = p(h), A = p(a); if (H && A) { const v = vecAngle(sub(A, H), DOWN); if (v !== null && (best === null || v > best)) best = v; } }
  return best; } },
 // qwen36 guard_drop_ratio: (nose.y - wrist.y)/torso, the lower of both hands; + above nose, - below.
 guard: { unit: 'torso', fn: (p, t) => { const n = p(L.nose), a = p(L.lWrist), b = p(L.rWrist); return n && a && b && t ? Math.min(n.y - a.y, n.y - b.y) / t : null; } },
 // qwen36 _hip_drop_series: hip centre vs the higher (less deep) knee, image projection only.
 hipDepth: { unit: 'torso', fn: (p, t) => { const h = mid(p, L.lHip, L.rHip), a = p(L.lKnee), b = p(L.rKnee); return h && a && b && t ? (h.y - Math.max(a.y, b.y)) / t : null; } },
 headOffset: { unit: 'torso', fn: (p, t) => { const n = p(L.nose), h = mid(p, L.lHip, L.rHip); return n && h && t ? (n.x - h.x) / t : null; } },
 headFoot: { unit: 'torso', fn: (p, t) => {
  const n = p(L.nose); if (!n || !t) return null; let best: number | null = null;
  for (const k of [L.lAnkle, L.rAnkle, L.lFoot, L.rFoot]) { const f = p(k); if (f) { const d = dist(f, n) / t; if (best === null || d < best) best = d; } }
  return best; } }
};
export type SeriesPair = { full: (number | null)[]; obs: (number | null)[] };
export function seriesOf(b: Body, id: string): SeriesPair {
 const def = SERIES[id];
 const run = (src: (Point | null)[][]) => src.map(row => { const v = def.fn(k => row[k], b.torso); return v !== null && Number.isFinite(v) ? v : null; });
 return { full: run(b.pts), obs: run(b.raw) };
}
export const MIN_COVERAGE = .6, MIN_VALUES = 4;
export function summarize(id: string, pair: SeriesPair, unit: string): Metric {
 const vals = pair.obs.filter((v): v is number => v !== null);
 const coverage = pair.obs.length ? vals.length / pair.obs.length : 0, ok = coverage >= MIN_COVERAGE && vals.length >= MIN_VALUES;
 return { id, unit, series: pair.full, coverage, value: ok ? percentile(vals, .5) : null, min: ok ? percentile(vals, .02) : null, max: ok ? percentile(vals, .98) : null };
}
export function metricsFor(b: Body, ids: string[]): Metric[] {
 return ids.filter(id => SERIES[id]).map(id => summarize(id, seriesOf(b, id), SERIES[id].unit));
}
