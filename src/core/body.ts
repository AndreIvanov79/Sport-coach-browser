import type { Landmark, Sample } from '../types.ts';
import type { Point } from './geometry.ts';
import { dist, midpoint } from './geometry.ts';
import { CORE, L, LIMBS, N_LANDMARKS } from './landmarks.ts';
import { median } from './stats.ts';
export function observed(p: Landmark | undefined, threshold: number): p is Landmark {
 return !!p && [p.x, p.y, p.visibility, p.presence ?? 1].every(Number.isFinite)
  && p.visibility >= threshold && (p.presence ?? 1) >= threshold && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}
/** Short landmark dropouts up to this span (between surrounding observations) are bridged linearly. */
export const MAX_BRIDGE_S = .3;
export type Body = {
 times: number[]; w: number; h: number; threshold: number;
 /** Observed-only pixel coordinates. */ raw: (Point | null)[][];
 /** Observed + bridged short gaps. */ pts: (Point | null)[][];
 present: boolean[]; torso: number | null; bridged: number;
};
export function buildBody(samples: Sample[], threshold: number, maxGap = MAX_BRIDGE_S): Body {
 const first = samples.find(s => s.width > 0 && s.height > 0), w = first?.width ?? 1, h = first?.height ?? 1;
 const times = samples.map(s => s.time);
 const raw = samples.map(s => {
  const row: (Point | null)[] = new Array(N_LANDMARKS).fill(null);
  if (s.reason || !s.landmarks.length) return row;
  for (let k = 0; k < N_LANDMARKS; k++) { const p = s.landmarks[k]; if (observed(p, threshold)) row[k] = { x: p.x * (s.width || w), y: p.y * (s.height || h) }; }
  return row;
 });
 const pts = raw.map(r => r.slice());
 let bridged = 0;
 for (let k = 0; k < N_LANDMARKS; k++) {
  let last = -1;
  for (let i = 0; i < raw.length; i++) {
   if (!raw[i][k]) continue;
   if (last >= 0 && i - last > 1 && times[i] - times[last] <= maxGap + 1e-9) {
    const a = raw[last][k]!, b = raw[i][k]!;
    for (let j = last + 1; j < i; j++) { const f = (times[j] - times[last]) / (times[i] - times[last]); pts[j][k] = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; bridged++; }
   }
   last = i;
  }
 }
 const torsos: number[] = [];
 for (const r of raw) if (CORE.every(k => r[k])) torsos.push(dist(midpoint(r[L.lShoulder]!, r[L.rShoulder]!), midpoint(r[L.lHip]!, r[L.rHip]!)));
 const torso = torsos.length ? median(torsos) : null;
 return { times, w, h, threshold, raw, pts, present: samples.map(s => !s.reason && s.landmarks.length > 0), torso: torso && torso > 5 ? torso : null, bridged };
}
/** Share of frames where shoulders and hips are actually observed. */
export function bodyCoverage(b: Body): number {
 return b.raw.length ? b.raw.filter(r => CORE.every(k => r[k])).length / b.raw.length : 0;
}
/** Skeletal plausibility (qwen36 pose_reliability): limb projected length deviating >35% from its median. */
export function reliability(b: Body): { suspectShare: number; frames: number } {
 const lengths = LIMBS.map(([a, c]) => b.raw.map(r => r[a] && r[c] ? dist(r[a]!, r[c]!) : null));
 const medians = lengths.map(ls => { const v = ls.filter((x): x is number => x !== null); return v.length >= 4 ? median(v) : null; });
 let suspect = 0, frames = 0;
 for (let i = 0; i < b.raw.length; i++) {
  let any = false, bad = false;
  lengths.forEach((ls, j) => { const v = ls[i], m = medians[j]; if (v !== null && m && m > 1e-6) { any = true; if (Math.abs(v - m) / m > .35) bad = true; } });
  if (any) { frames++; if (bad) suspect++; }
 }
 return { suspectShare: frames ? suspect / frames : 0, frames };
}
