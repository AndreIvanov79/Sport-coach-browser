import type { Athlete, Landmark, Sample, Seed } from '../types.ts';
import { L } from './landmarks.ts';
import { blendLook, lookDistance, type Look } from './appearance.ts';
// Athlete selection and identity continuity across frames (port of qwen36
// select_main_person / pose track ideas to MediaPipe multi-pose output).
// Frames are no longer discarded because a coach, a partner or a mirror
// reflection is visible: the selected person is followed by position and scale, and
// (when colour samples exist) by clothing colour, so crossing partners do not swap identity.
const GEO_THR = .3;
/** Weight of the clothing-colour distance against the normalised position distance; colour thresholds. */
const LOOK_W = 3, LOOK_NEUTRAL = .12, LOOK_REJECT = .35, LOOK_REACQUIRE = .2, LOOK_UPDATE = .2, LOOK_DISTINCT = .3, ANCHOR_FRAMES = 5;
export type Geo = { cx: number; cy: number; scale: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
export function personGeometry(lms: Landmark[], w: number, h: number): Geo | null {
 const pts = lms.map(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= GEO_THR ? { x: p.x * w, y: p.y * h } : null);
 const seen = pts.filter((p): p is { x: number; y: number } => !!p);
 if (seen.length < 4) return null;
 const xs = seen.map(p => p.x), ys = seen.map(p => p.y);
 const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
 const sh = [pts[L.lShoulder], pts[L.rShoulder]].filter(Boolean) as { x: number; y: number }[];
 const hp = [pts[L.lHip], pts[L.rHip]].filter(Boolean) as { x: number; y: number }[];
 const avg = (a: { x: number; y: number }[]) => ({ x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length });
 let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, scale = Math.max(1, (maxY - minY) * .3);
 if (sh.length && hp.length) { const s = avg(sh), p = avg(hp); cx = (s.x + p.x) / 2; cy = (s.y + p.y) / 2; scale = Math.max(scale * .5, Math.hypot(s.x - p.x, s.y - p.y)); }
 return { cx, cy, scale, height: maxY - minY, minX, maxX, minY, maxY };
}
function autoSeed(samples: Sample[]): Seed | null {
 for (let i = 0; i < samples.length; i++) {
  const c = samples[i].candidates ?? []; if (!c.length) continue;
  const geos = c.map(l => personGeometry(l, samples[i].width, samples[i].height));
  const heights = geos.map(g => g?.height ?? 0), best = Math.max(...heights);
  if (best <= 0) continue;
  // Largest visible person; near-ties go to the one closest to the frame centre.
  let pick = heights.indexOf(best), bestCentre = Infinity;
  geos.forEach((g, k) => { if (g && g.height >= best * .9) { const d = Math.abs(g.cx - samples[i].width / 2); if (d < bestCentre) { bestCentre = d; pick = k; } } });
  return { index: i, candidate: pick };
 }
 return null;
}
/** Frames where the model reported more than one person. */
export const multiPersonFrames = (samples: Sample[]): number[] => samples.map((s, i) => (s.candidates?.length ?? 0) > 1 ? i : -1).filter(i => i >= 0);
/** MediaPipe sometimes reports a ghost second person for a frame or two (a bag, a reflection); a choice is only
 * meaningful when several people were seen in at least 3 frames and 2% of the clip. */
export const choosableAthlete = (samples: Sample[]): boolean => multiPersonFrames(samples).length >= Math.max(3, Math.ceil(.02 * samples.length));
type Box = { x0: number; y0: number; x1: number; y1: number; h: number };
const iou = (a: Box, b: Box) => {
 const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), inter = ix * iy;
 const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter; return union > 0 ? inter / union : 0;
};
/** MediaPipe sometimes returns the same person twice (two skeletons on one boxer). Poses whose boxes overlap
 * strongly and whose joints mostly coincide are one person: the more visible one is kept. Two people in a clinch
 * overlap too, but their joints (heads, shoulders) are apart. Returns the kept indices in their original order. */
export function distinctPoses(poses: Landmark[][], w: number, h: number): number[] {
 const boxes = poses.map(p => { const g = personGeometry(p, w, h); return g ? { x0: g.minX, y0: g.minY, x1: g.maxX, y1: g.maxY, h: g.height } : null; });
 const vis = poses.map(p => p.reduce((s, q) => s + (q?.visibility ?? 0), 0)), kept: number[] = [];
 for (const i of poses.map((_, k) => k).sort((a, z) => vis[z] - vis[a])) {
  const same = kept.some(j => {
   const a = boxes[i], b = boxes[j]; if (!a || !b) return false;
   const o = iou(a, b); if (o < .5) return false;
   const d: number[] = [];
   for (let k = 0; k < 33; k++) { const p = poses[i][k], q = poses[j][k]; if (p && q && (p.visibility ?? 0) >= .5 && (q.visibility ?? 0) >= .5) d.push(Math.hypot((p.x - q.x) * w, (p.y - q.y) * h)); }
   if (d.length < 5) return o > .7;
   d.sort((x, y) => x - y); return d[d.length >> 1] < .2 * Math.max(a.h, b.h);
  });
  if (!same) kept.push(i);
 }
 return kept.sort((a, z) => a - z);
}
const withoutDuplicates = (s: Sample): Sample => {
 if (!s.candidates || s.candidates.length < 2) return s;
 const keep = distinctPoses(s.candidates, s.width, s.height); if (keep.length === s.candidates.length) return s;
 return { ...s, candidates: keep.map(k => s.candidates![k]), looks: s.looks ? keep.map(k => s.looks![k]) : s.looks };
};
export function trackAthlete(raw: Sample[], seed?: Seed): { samples: Sample[]; athlete: Athlete } {
 const input = raw.map(withoutDuplicates);
 const people = Math.max(0, ...input.map(s => s.candidates?.length ?? (s.landmarks.length ? 1 : 0)));
 const hasCandidates = input.some(s => s.candidates);
 if (!hasCandidates) {
  return { samples: input, athlete: { people: Math.max(people, input.some(s => s.reason === 'multiple-people') ? 2 : 0), selection: 'single', lostFrames: 0, reacquired: 0 } };
 }
 const out: Sample[] = input.map(s => ({ ...s, landmarks: [], reason: (s.candidates?.length ? 'lost' : 'no-pose') as Sample['reason'], people: s.candidates?.length ?? 0 }));
 const start = seed && input[seed.index]?.candidates?.[seed.candidate] ? seed : autoSeed(input);
 if (!start) return { samples: out, athlete: { people, selection: people > 1 ? 'auto' : 'single', lostFrames: 0, reacquired: 0 } };
 let reacquired = 0;
 // Clothing colour is used only when several people share the video AND they dress clearly differently (sparring
 // partners, coach with pads). Team-mates in the same black leotards, or a lone athlete whose shirt looks different
 // from the back, are tracked by position alone: colour would then only add errors.
 const pairGap: number[] = [];
 for (const s of input) {
  const q = (s.looks ?? []).filter((x): x is Look => !!x); if (q.length < 2) continue;
  let m = Infinity; for (let a = 0; a < q.length; a++) for (let b = a + 1; b < q.length; b++) m = Math.min(m, lookDistance(q[a], q[b]));
  pairGap.push(m);
 }
 pairGap.sort((a, z) => a - z);
 const distinct = pairGap.length >= 3 && pairGap[pairGap.length >> 1] >= LOOK_DISTINCT;
 const assign = (i: number, k: number) => { out[i].landmarks = input[i].candidates![k]; out[i].reason = undefined; };
 const seedGeo = personGeometry(input[start.index].candidates![start.candidate], input[start.index].width, input[start.index].height)!;
 assign(start.index, start.candidate);
 for (const dir of [1, -1]) {
  // `ref` follows slow lighting changes; `anchor` (first confident frames) stops it drifting onto another person.
  let state = { ...seedGeo }, seen = input[start.index].time, ref: Look | null = input[start.index].looks?.[start.candidate] ?? null, confirmed = 0;
  let anchor: Look | null = ref; const anchorSet: Look[] = ref ? [ref] : [];
  for (let i = start.index + dir; i >= 0 && i < input.length; i += dir) {
   const s = input[i], c = s.candidates ?? []; if (!c.length) continue;
   const dt = Math.abs(s.time - seen), looks = distinct ? s.looks : undefined;
   const ld = (k: number) => { const q = looks?.[k]; if (!q || !ref) return null; return anchor ? Math.min(lookDistance(ref, q), lookDistance(anchor, q)) : lookDistance(ref, q); };
   const opts: { k: number; cost: number; d: number; l: number | null }[] = [];
   c.forEach((lms, k) => {
    const g = personGeometry(lms, s.width, s.height); if (!g) return;
    const d = Math.hypot(g.cx - state.cx, g.cy - state.cy) / state.scale, ratio = Math.max(g.scale / state.scale, state.scale / g.scale);
    const allowed = Math.min(2.5, .6 + 6 * dt), l = ld(k);
    // A clearly different outfit is another person once the athlete's colours are confirmed; after a gap
    // (occlusion, the athlete left the frame) the returning person must match closely.
    const limit = dt > .25 ? LOOK_REACQUIRE : LOOK_REJECT;
    if (d <= allowed && ratio <= 1.7 && !(confirmed >= 3 && l !== null && l > limit)) opts.push({ k, cost: d + LOOK_W * (l ?? LOOK_NEUTRAL), d, l });
   });
   opts.sort((a, z) => a.cost - z.cost);
   let best = opts.length ? opts[0].k : -1;
   // Colours are learned only from confident continuations: one plausible person, close to the last position.
   const clear = opts.length > 0 && (opts.length === 1 || opts[1].cost - opts[0].cost >= .3) && opts[0].d <= 1 && (opts[0].l === null || opts[0].l <= LOOK_UPDATE);
   if (best < 0 && dt > 1) {
    // Long loss: re-acquire an unambiguous person of similar size (colour decides when several are visible).
    const similar = c.map((lms, k) => ({ k, g: personGeometry(lms, s.width, s.height), l: ld(k) }))
     .filter(x => x.g && Math.max(x.g.scale / state.scale, state.scale / x.g.scale) <= 1.7);
    const byLook = similar.filter(x => x.l !== null).sort((a, z) => a.l! - z.l!);
    if (byLook.length && byLook[0].l! <= LOOK_REACQUIRE && (byLook.length === 1 || byLook[1].l! - byLook[0].l! >= .1)) { best = byLook[0].k; reacquired++; }
    else if (similar.length === 1 && !(confirmed >= 3 && similar[0].l !== null && similar[0].l > LOOK_REACQUIRE)) { best = similar[0].k; reacquired++; }
   }
   if (best < 0) continue;
   const g = personGeometry(c[best], s.width, s.height)!, look = looks?.[best] ?? null;
   if (look && clear && best === opts[0].k) {
    ref = ref ? blendLook(ref, look, .1) : look; confirmed++;
    if (anchorSet.length < ANCHOR_FRAMES) { anchorSet.push(look); anchor = anchorSet.reduce((a, q, n) => blendLook(a, q, 1 / (n + 1))); }
   }
   state = { ...g, scale: state.scale * .7 + g.scale * .3 }; seen = s.time; assign(i, best);
  }
 }
 const lostFrames = out.filter(s => s.reason === 'lost').length;
 return { samples: out, athlete: { people, selection: seed ? 'user' : people > 1 ? 'auto' : 'single', seed: start, seedTime: input[start.index].time, lostFrames, reacquired } };
}
