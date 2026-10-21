import type { Landmark, Sample } from "../src/types.ts";
export type PoseSpec = { knee?: number; kneeR?: number; elbow?: number; elbowR?: number; dx?: number; dy?: number; scale?: number; wristUp?: number; wristUpL?: number; wristUpR?: number };
const rad = (d: number) => d * Math.PI / 180;
/** Upright synthetic athlete in normalized coordinates (square frame). Angles in degrees at the joint. */
export function pose(spec: PoseSpec = {}): Landmark[] {
 const s = spec.scale ?? 1, ox = .5 + (spec.dx ?? 0), oy = spec.dy ?? 0;
 const P = (x: number, y: number): Landmark => ({ x: ox + (x - .5) * s, y: oy + .5 + (y - .5) * s, z: 0, visibility: .99, presence: .99 });
 const lm: Landmark[] = Array.from({ length: 33 }, () => P(.5, .5));
 lm[0] = P(.5, .16); lm[1] = P(.49, .15); lm[2] = P(.48, .15); lm[3] = P(.47, .15); lm[4] = P(.51, .15); lm[5] = P(.52, .15); lm[6] = P(.53, .15); lm[7] = P(.46, .16); lm[8] = P(.54, .16); lm[9] = P(.49, .18); lm[10] = P(.51, .18);
 lm[11] = P(.42, .25); lm[12] = P(.58, .25); lm[23] = P(.45, .5); lm[24] = P(.55, .5);
 const leg = (hip: number, knee: number, ankle: number, heel: number, foot: number, x: number, ang: number) => {
  lm[knee] = P(x, .68); const ax = x + .18 * Math.sin(rad(180 - ang)) * (x < .5 ? -1 : 1), ay = .68 + .18 * Math.cos(rad(180 - ang));
  lm[ankle] = P(ax, ay); lm[heel] = P(ax - .01, ay + .01); lm[foot] = P(ax + .02, ay + .01); void hip;
 };
 leg(23, 25, 27, 29, 31, .45, spec.knee ?? 175); leg(24, 26, 28, 30, 32, .55, spec.kneeR ?? spec.knee ?? 175);
 const arm = (sh: number, el: number, wr: number, x: number, ang: number) => {
  lm[el] = P(x, .25 + .13); const up = (x < .5 ? spec.wristUpL : spec.wristUpR) ?? spec.wristUp ?? 0;
  lm[wr] = P(x + .12 * Math.sin(rad(180 - ang)) * (x < .5 ? 1 : -1), .38 + .12 * Math.cos(rad(180 - ang)) - up); void sh;
 };
 arm(11, 13, 15, .42, spec.elbow ?? 170); arm(12, 14, 16, .58, spec.elbowR ?? spec.elbow ?? 170);
 for (const k of [17, 19, 21]) lm[k] = { ...lm[15] }; for (const k of [18, 20, 22]) lm[k] = { ...lm[16] };
 return lm;
}
export function samples(n: number, fps: number, at: (i: number, t: number) => Landmark[][] | Landmark[]): Sample[] {
 return Array.from({ length: n }, (_, i) => {
  const t = i / fps, v = at(i, t), cands = Array.isArray(v[0]) ? v as Landmark[][] : [v as Landmark[]];
  return { time: t, width: 1000, height: 1000, landmarks: [], candidates: cands };
 });
}
export const hide = (lm: Landmark[], ...idx: number[]) => { const c = lm.map(p => ({ ...p })); for (const k of idx) c[k].visibility = .05; return c; };
