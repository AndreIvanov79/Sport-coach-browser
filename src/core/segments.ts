import type { Segment } from '../types.ts';
import type { Body } from './body.ts';
import { dist } from './geometry.ts';
import { L } from './landmarks.ts';
import { percentile, runs, smoothTime } from './stats.ts';
const MOTION_POINTS = [L.lShoulder, L.rShoulder, L.lHip, L.rHip, L.lKnee, L.rKnee, L.lAnkle, L.rAnkle, L.lWrist, L.rWrist];
/** qwen36 motion_envelope as speed: mean displacement of 10 joints per second, in torso lengths. */
export function motionEnvelope(b: Body, points = MOTION_POINTS): (number | null)[] {
 return b.pts.map((row, i) => {
  if (i === 0 || !b.torso) return null; const prev = b.pts[i - 1], dt = b.times[i] - b.times[i - 1];
  if (!(dt > 0) || dt > .5) return null;
  let sum = 0, n = 0; for (const k of points) { const a = prev[k], c = row[k]; if (a && c) { sum += dist(a, c); n++; } }
  return n >= 3 ? sum / n / b.torso / dt : null;
 });
}
/** Active vs rest parts (sets, routine phases). Rest = low motion for at least `restMin` seconds. */
export function activitySegments(b: Body, restMin = 2): Segment[] {
 if (b.times.length < 3) return [];
 const raw = motionEnvelope(b), smooth = smoothTime(raw, b.times, .3);
 const vals = smooth.filter((v): v is number => v !== null);
 if (vals.length < 3) return [];
 const thr = Math.max(.12, .25 * percentile(vals, .9));
 const still = smooth.map(v => v === null || v < thr);
 // Rest runs shorter than restMin are part of the activity.
 const mask = still.slice();
 for (const [s, e] of runs(still)) if (b.times[Math.min(e, b.times.length - 1)] - b.times[s] < restMin) for (let i = s; i < e; i++) mask[i] = false;
 const out: Segment[] = [];
 for (const [s, e] of runs(mask.map(v => !v))) {
  const start = b.times[s], end = b.times[Math.min(e, b.times.length - 1)];
  if (end - start >= .6) out.push({ start, end, kind: 'active' });
 }
 return out;
}
/** Longest interval where the core joints barely move (qwen36 hold_duration_metric, per-second threshold). */
export function longestHold(b: Body, from = 0, to = b.times.length, speedThr = .35): { value: number; start: number; end: number } | null {
 const core = [L.lShoulder, L.rShoulder, L.lHip, L.rHip, L.lKnee, L.rKnee];
 const env = motionEnvelope(b, core);
 let best: { value: number; start: number; end: number } | null = null, runStart = -1;
 for (let i = Math.max(1, from); i <= to; i++) {
  const ok = i < to && env[i] !== null && env[i]! < speedThr;
  if (ok && runStart < 0) runStart = i - 1;
  if (!ok && runStart >= 0) { const v = b.times[i - 1] - b.times[runStart]; if (!best || v > best.value) best = { value: v, start: b.times[runStart], end: b.times[i - 1] }; runStart = -1; }
 }
 return best;
}
