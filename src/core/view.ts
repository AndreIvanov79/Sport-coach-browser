import type { View } from '../types.ts';
import type { Body } from './body.ts';
import { dist, midpoint } from './geometry.ts';
import { L } from './landmarks.ts';
import { median } from './stats.ts';
/**
 * Camera view from projected shoulder/hip width relative to torso length (qwen36 uses the same
 * collapse of the shoulder line, _STANCE_MIN_SHOULDER_W = 0.35, to detect a profile view).
 * Front and back views are not distinguished.
 */
export function classifyView(b: Body): View {
 const ratios: number[] = [];
 for (const r of b.raw) {
  const ls = r[L.lShoulder], rs = r[L.rShoulder], lh = r[L.lHip], rh = r[L.rHip];
  if (!ls || !rs || !lh || !rh) continue;
  const torso = dist(midpoint(ls, rs), midpoint(lh, rh)); if (torso < 5) continue;
  ratios.push(Math.max(dist(ls, rs), dist(lh, rh) * 1.15) / torso);
 }
 if (ratios.length < 5) return { kind: 'unknown', shoulderRatio: null, frontShare: 0, sideShare: 0 };
 const m = median(ratios), frontShare = ratios.filter(r => r >= .55).length / ratios.length, sideShare = ratios.filter(r => r <= .35).length / ratios.length;
 const kind = frontShare >= .6 ? 'front' : sideShare >= .6 ? 'side' : 'oblique';
 return { kind, shoulderRatio: m, frontShare, sideShare };
}
