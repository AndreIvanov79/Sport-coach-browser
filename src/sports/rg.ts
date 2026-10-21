import type { Finding, RgAction, RgEvent, RgScore, Scalar } from "../types.ts";
import type { Body } from "../core/body.ts";
import type { SportContext, SportResult } from "../core/findings.ts";
import type { Point } from "../core/geometry.ts";
import { DOWN, UP, angle, dist, sub, vecAngle } from "../core/geometry.ts";
import { L } from "../core/landmarks.ts";
import { median, percentile, rollingPercentile, runs } from "../core/stats.ts";
import { longestHold } from "../core/segments.ts";
import { scalar } from "../core/findings.ts";
import { metricById } from "./common.ts";
import { FAMILIES, FORMS, PROFILES, type Check } from "./rg-catalog.ts";
// Simplified port of qwen36 rg_spatial.py: synchronized per-frame body properties, support/flight/rotation
// states and evidence-localized events. All values are 2D projections from one camera.
export type RgFrames = {
 split: (number | null)[]; lean: (number | null)[]; freeLift: (number | null)[]; freeKnee: (number | null)[]; supportKnee: (number | null)[];
 headFoot: (number | null)[]; footAboveHead: (number | null)[]; headAboveHip: (number | null)[]; hipHeight: (number | null)[];
 supportCount: (number | null)[]; flight: boolean[]; supported: boolean[]; floorBody: boolean[]; rotating: boolean[]; still: boolean[];
 steps: { start: number; end: number }[]; state: string[];
};
const maxOf = (v: (number | null)[]) => { const f = v.filter((x): x is number => x !== null); return f.length ? Math.max(...f) : null; };
export function rgFrames(b: Body): RgFrames | null {
 const s = b.torso; if (!s) return null;
 const T = b.times.length, times = b.times, P = b.pts;
 const nul = () => new Array<number | null>(T).fill(null);
 const lowY = nul(), bodyLowY = nul(), nonfootY = nul(), hipY = nul(), shY = nul(), noseY = nul(), legReach = nul(), lowLeg = nul();
 const legLen = (r: (Point | null)[], sd: "l" | "r") => { const h = r[sd === "l" ? L.lHip : L.rHip], k = r[sd === "l" ? L.lKnee : L.rKnee], a = r[sd === "l" ? L.lAnkle : L.rAnkle]; return h && k && a ? dist(h, k) + dist(k, a) : null; };
 const soleOf = (r: (Point | null)[], side: "l" | "r") => {
  const a = r[side === "l" ? L.lAnkle : L.rAnkle]; if (!a) return null; const ys = [a.y];
  for (const k of side === "l" ? [L.lFoot, L.lHeel] : [L.rFoot, L.rHeel]) { const q = r[k]; if (q && dist(q, a) < .55 * s) ys.push(q.y); }
  return Math.max(...ys);
 };
 for (let i = 0; i < T; i++) {
  const r = P[i], sl = soleOf(r, "l"), sr = soleOf(r, "r"), soles = [sl, sr].filter((x): x is number => x !== null);
  lowY[i] = soles.length ? Math.max(...soles) : null;
  if (sl !== null || sr !== null) lowLeg[i] = legLen(r, sr === null || (sl !== null && sl >= sr) ? "l" : "r");
  nonfootY[i] = maxOf([L.nose, L.lShoulder, L.rShoulder, L.lElbow, L.rElbow, L.lWrist, L.rWrist, L.lHip, L.rHip, L.lKnee, L.rKnee].map(k => r[k]?.y ?? null));
  bodyLowY[i] = maxOf([lowY[i], nonfootY[i]]);
  hipY[i] = r[L.lHip] && r[L.rHip] ? (r[L.lHip]!.y + r[L.rHip]!.y) / 2 : null;
  shY[i] = r[L.lShoulder] && r[L.rShoulder] ? (r[L.lShoulder]!.y + r[L.rShoulder]!.y) / 2 : null;
  noseY[i] = r[L.nose]?.y ?? null;
  legReach[i] = maxOf([legLen(r, "l"), legLen(r, "r")]);
 }
 const ground = rollingPercentile(bodyLowY, times, .75, .95), hipBase = rollingPercentile(hipY, times, .75, .9);
 const d = (a: number | null, z: number | null) => a !== null && z !== null ? (a - z) / s : null;
 const clearance = lowY.map((v, i) => d(ground[i], v)), bodyClear = bodyLowY.map((v, i) => d(ground[i], v)), nonfootClear = nonfootY.map((v, i) => d(ground[i], v));
 const hipRise = hipY.map((v, i) => d(hipBase[i], v)), hipHeight = hipY.map((v, i) => d(ground[i], v)), headAboveHip = hipY.map((v, i) => d(v, noseY[i]));
 const feetBelowCore = lowY.map((v, i) => v !== null && hipY[i] !== null && shY[i] !== null ? (v - Math.max(hipY[i]!, shY[i]!)) / s : null);
 const feetValid = P.map(r => !!(r[L.lAnkle] && r[L.rAnkle])), core = hipY.map((v, i) => v !== null && shY[i] !== null);
 const supportCount: (number | null)[] = P.map((r, i) => {
  if (!feetValid[i] || ground[i] === null || hipY[i] === null) return null;
  let n = 0; for (const sd of ["l", "r"] as const) { const sole = soleOf(r, sd), a = r[sd === "l" ? L.lAnkle : L.rAnkle]!; if (sole !== null && (ground[i]! - sole) / s <= .18 && (a.y - hipY[i]!) / s > .45) n++; }
  return n;
 });
 const nonfootContact = nonfootClear.map((v, i) => core[i] && v !== null && v <= .2);
 const footLed = feetBelowCore.map(v => v !== null && v >= -.2);
 // The lowest sole must belong to a plausibly long leg: Lite collapses legs in extreme poses (ring, split
 // balances), which lifts the "lowest" foot to hip level and fakes a flight.
 const reachRef = median(legReach.filter((x): x is number => x !== null)) ?? null;
 const legOk = lowLeg.map(v => reachRef === null || (v !== null && v >= .5 * reachRef));
 const airborne = P.map((_, i) => feetValid[i] && core[i] && legOk[i] && footLed[i] && (clearance[i] ?? 0) > .2 && (bodyClear[i] ?? 0) > .2 && (hipRise[i] ?? 0) > .1 && (hipHeight[i] ?? 0) >= .65
  && ((lowY[i]! - hipY[i]!) < .82 * (legReach[i] ?? Infinity) || (hipRise[i] ?? 0) > .45));
 const flight = new Array<boolean>(T).fill(false);
 for (const [a, z] of runs(airborne)) {
  // A flight needs an observed take-off from foot support within 0.4 s and >= 0.12 s airborne.
  let takeoff = false;
  for (let j = a - 1; j >= 0 && times[a] - times[j] <= .4; j--) if ((supportCount[j] ?? 0) > 0 && (hipHeight[j] ?? 0) >= .65 && !nonfootContact[j]) { takeoff = true; break; }
  if (takeoff && times[Math.min(z, T - 1)] - times[a] >= .12 - 1e-9 && z - a >= 2) for (let j = a; j < z; j++) flight[j] = true;
 }
 const supported = supportCount.map((n, i) => (n ?? 0) > 0 && !flight[i]);
 const floorBody = hipHeight.map((h, i) => core[i] && h !== null && (h < .65 || (nonfootContact[i] && !footLed[i])));
 // Free leg = the higher foot (labels may swap during turns).
 const split = nul(), lean = nul(), freeLift = nul(), freeKnee = nul(), supportKnee = nul(), headFoot = nul(), footAboveHead = nul();
 for (let i = 0; i < T; i++) {
  const r = P[i], la = r[L.lAnkle], ra = r[L.rAnkle], lh = r[L.lHip], rh = r[L.rHip], n = r[L.nose];
  const sm = r[L.lShoulder] && r[L.rShoulder] ? { x: (r[L.lShoulder]!.x + r[L.rShoulder]!.x) / 2, y: shY[i]! } : null, hm = lh && rh ? { x: (lh.x + rh.x) / 2, y: hipY[i]! } : null;
  if (sm && hm) lean[i] = vecAngle(sub(sm, hm), UP);
  if (!la || !ra) continue;
  if (lh && rh) split[i] = vecAngle(sub(la, lh), sub(ra, rh));
  const freeLeft = la.y < ra.y, fs = freeLeft ? "l" : "r", ss = freeLeft ? "r" : "l";
  const H = (sd: string) => r[sd === "l" ? L.lHip : L.rHip], K = (sd: string) => r[sd === "l" ? L.lKnee : L.rKnee], A = (sd: string) => r[sd === "l" ? L.lAnkle : L.rAnkle];
  const fh = H(fs), fk = K(fs), fa = A(fs)!, sh = H(ss), sk = K(ss), sa = A(ss)!;
  if (fh) freeLift[i] = vecAngle(sub(fa, fh), DOWN);
  if (fh && fk) freeKnee[i] = angle(fh, fk, fa);
  if (sh && sk) supportKnee[i] = angle(sh, sk, sa);
  if (n) {
   const toe = r[freeLeft ? L.lFoot : L.rFoot];
   headFoot[i] = Math.min(dist(fa, n), toe ? dist(toe, n) : Infinity) / s;
   footAboveHead[i] = (n.y - fa.y) / s;
  }
 }
 // Vertical-axis half turns between successive profile passages of shoulders AND pelvis.
 const width = (a: number, z: number) => P.map(r => r[a] && r[z] ? Math.abs(r[z]!.x - r[a]!.x) / s : null);
 const norm = (v: (number | null)[]) => { const f = v.filter((x): x is number => x !== null), ref = f.length ? Math.max(.1, percentile(f, .85)) : 1; return v.map(x => x === null ? null : x / ref); };
 const sw = norm(width(L.lShoulder, L.rShoulder)), hw = norm(width(L.lHip, L.rHip));
 const prof0 = sw.map((v, i) => v === null && hw[i] === null ? null : Math.max(v ?? 0, hw[i] ?? 0));
 // A fast turn passes profile within ~1 frame at 15 fps, so smoothing is applied only at >= 20 fps.
 const gaps = times.slice(1).map((t, i) => t - times[i]).sort((x, y) => x - y), dense = gaps.length > 0 && gaps[gaps.length >> 1] < .05;
 const prof = !dense ? prof0 : prof0.map((v, i) => { if (v === null) return null; const w = [prof0[i - 1], v, prof0[i + 1]].filter((x): x is number => x !== null && x !== undefined); return w.reduce((a, z) => a + z, 0) / w.length; });
 const centres = runs(prof.map(v => v !== null && v < .35)).map(([a, z]) => { let m = a; for (let j = a; j < z; j++) if (prof[j]! < prof[m]!) m = j; return m; });
 // On releve the toes often sit above the estimated floor line, so a turn needs the body upright on its feet,
 // not a detected sole contact.
 const upright = hipHeight.map((h, i) => h !== null && h >= .65 && !floorBody[i]);
 const collapsedLeg = P.map(r => { const l = legLen(r, "l"), q = legLen(r, "r"); return reachRef !== null && l !== null && q !== null && Math.min(l, q) < .6 * reachRef; });
 const steps: { start: number; end: number }[] = [], rotating = new Array<boolean>(T).fill(false);
 for (let k = 1; k < centres.length; k++) {
  const a = centres[k - 1], z = centres[k], dt = times[z] - times[a]; if (dt < .12 || dt > 1.5) continue;
  let open = false, seen = 0, support = 0, floor = false, collapsed = 0, twoFeet = 0;
  for (let j = a; j <= z; j++) {
   if ((prof[j] ?? 0) > .6) open = true; if (sw[j] !== null && hw[j] !== null) seen++; if (supported[j] || flight[j] || upright[j]) support++; if (floorBody[j]) floor = true;
   if (collapsedLeg[j]) collapsed++; if (supportCount[j] === 2) twoFeet++;
  }
  // Widths are meaningless while the model folds a leg (ring and split balances held in profile flicker like
  // turns), and a pivot on two flat feet is a change of direction, not a rotation difficulty.
  const n = z - a + 1; if (!open || seen / n < .7 || support / n < .5 || floor || collapsed / n > 1 / 3 || twoFeet / n > .5) continue;
  steps.push({ start: times[a], end: times[z] }); for (let j = a; j <= z; j++) rotating[j] = true;
 }
 const still = new Array<boolean>(T).fill(false);
 const med3 = (x: (number | null)[]) => x.map((v, i) => { if (v === null) return null; const w = [x[i - 1], v, x[i + 1]].filter((q): q is number => q !== null && q !== undefined).sort((a, z) => a - z); return w[Math.floor(w.length / 2)]; });
 const shape = [med3(freeLift), med3(freeKnee), med3(lean)];
 for (let i = 1; i < T; i++) {
  const v = shape.map(x => x[i] !== null && x[i - 1] !== null ? x[i]! - x[i - 1]! : null);
  const dt = times[i] - times[i - 1]; if (v.some(x => x === null) || !(dt > 0)) continue;
  still[i] = Math.hypot(v[0]!, v[1]!, v[2]!) / dt < 90 && supported[i] && !rotating[i];
 }
 const state = P.map((_, i) => hipHeight[i] === null ? "unknown" : flight[i] ? "flight" : rotating[i] && supported[i] ? "rotation" : still[i] && supportCount[i] === 1 ? "balance" : floorBody[i] ? "floor" : "transition");
 return { split, lean, freeLift, freeKnee, supportKnee, headFoot, footAboveHead, headAboveHip, hipHeight, supportCount, flight, supported, floorBody, rotating, still, steps, state };
}
const PROP: Record<string, keyof RgFrames> = {
 split_deg: "split", free_leg_lift_deg: "freeLift", free_knee_deg: "freeKnee", support_knee_deg: "supportKnee", head_foot_norm: "headFoot",
 foot_above_head_norm: "footAboveHead", head_above_hips_norm: "headAboveHip", trunk_lean_deg: "lean", hip_height_norm: "hipHeight"
};
const PROPS = Object.keys(PROP);
function propsAt(f: RgFrames, idx: number[]): Record<string, number | null> {
 const out: Record<string, number | null> = {};
 for (const key of PROPS) { const s = f[PROP[key]] as (number | null)[], v = idx.map(i => s[i]).filter((x): x is number => x !== null); out[key] = v.length ? median(v) : null; }
 out.upright = out.trunk_lean_deg !== null && out.head_above_hips_norm !== null ? (out.trunk_lean_deg < 60 && out.head_above_hips_norm > .35 ? 1 : 0) : null;
 return out;
}
const test = (v: number | null, op: string, target: number | [number, number]) => v === null ? null :
 op === "between" ? v >= (target as number[])[0] && v <= (target as number[])[1] : op === ">=" ? v >= (target as number) : op === "<=" ? v <= (target as number) : op === ">" ? v > (target as number) : op === "<" ? v < (target as number) : v === target;
/** Free-leg bend/extension cycles (qwen36 element_properties._cycles), used for fouette. */
function legSwings(f: RgFrames, a: number, z: number): number {
 let state = "", count = 0;
 for (let i = a; i < z; i++) { const k = f.freeKnee[i], lift = f.freeLift[i]; if (k === null || lift === null) continue; if (k < 125) state = "bent"; else if (k > 155 && lift >= 50) { if (state === "bent") count++; state = "extended"; } }
 return count;
}
export function recognise(action: RgAction, props: Record<string, number | null>, turns: number, swings: number) {
 let best: { element: string; checks: RgEvent["checks"]; n: number } | null = null;
 const generic = action === "leap" ? "jump" : action === "flexibility" ? "backbend" : action;
 for (const [name, p] of Object.entries(PROFILES)) {
  if (p.action !== action || !p.family && name !== generic) continue;
  const checks: Check[] = [...(FORMS[p.form] ?? []), ...(p.additional ?? [])];
  const res: RgEvent["checks"] = checks.map(([k, op, v]) => { const m = props[k] ?? null, ok = test(m, op, v); return { check: k + " " + op + " " + [v].flat().join(".."), result: ok === null ? "unverified" : ok ? "ok" : "violated", measured: m === null ? null : Math.round(m * 100) / 100 }; });
  const mods = p.modifiers ?? {};
  if (mods.rotation_min !== undefined) res.push({ check: "rotation >= " + mods.rotation_min, result: turns * 360 >= mods.rotation_min ? "ok" : "violated", measured: turns * 360 });
  if (mods.leg_switch_min !== undefined) res.push({ check: "leg_switch >= 1", result: "unverified" });
  if (mods.leg_swing_min !== undefined) res.push({ check: "leg_swing >= " + mods.leg_swing_min, result: swings >= mods.leg_swing_min ? "ok" : "violated", measured: swings });
  if (mods.leg_swing_max !== undefined) res.push({ check: "leg_swing <= " + mods.leg_swing_max, result: swings <= mods.leg_swing_max ? "ok" : "violated", measured: swings });
  if (p.rotation_axis === "in_plane") res.push({ check: "in_plane_rotation", result: "unverified" });
  const matched = res.every(c => c.result === "ok");
  if (name === generic) { if (!best) best = { element: name, checks: res, n: -1 }; continue; }
  if (matched && (!best || res.length > best.n)) best = { element: name, checks: res, n: res.length };
 }
 return best ?? { element: generic, checks: [], n: -1 };
}
const familyOf = (element: string) => { const p = PROFILES[element]; if (!p?.family) return null; const key = p.family[0] + "." + p.family[1]; const f = FAMILIES[key]; return f ? { key, title: f.title, value: Math.min(...f.values.map(v => v[1])) } : null; };
/** FIG 2.5 shape deviation bands for leaps: small <= 10 deg, medium 11-20, large > 20 (qwen36 _split_shape_deduction). */
export function splitDeduction(split: number | null): { value: number; band: string; deviation: number } | null {
 if (split === null || split >= 180) return null; const dev = 180 - split;
 return dev <= 10 ? { value: .1, band: "small", deviation: dev } : dev <= 20 ? { value: .3, band: "medium", deviation: dev } : { value: .5, band: "large", deviation: dev };
}
function buildEvents(b: Body, f: RgFrames): RgEvent[] {
 const times = b.times, T = times.length, events: RgEvent[] = [];
 const push = (action: RgAction, a: number, z: number, peak: number, idx: number[]) => {
  const turnsSteps = f.steps.filter(st => st.end >= times[a] - .05 && st.start <= times[Math.max(a, z - 1)] + .05).length;
  const turns = action === "rotation" || action === "leap" ? turnsSteps * .5 : 0, swings = action === "rotation" ? legSwings(f, a, z) : 0;
  const props = propsAt(f, idx), rec = recognise(action, props, turns, swings), fam = familyOf(rec.element);
  const start = times[a], end = times[Math.min(z, T) - 1];
  const bounded = a > 0 && z < T && f.hipHeight[a - 1] !== null && f.hipHeight[Math.min(z, T - 1)] !== null;
  events.push({ id: 0, action, start, end, peak: times[peak], element: rec.element, family: fam?.key ?? null, familyTitle: fam?.title ?? null, baseValue: fam?.value ?? null,
   props, turns: action === "rotation" || turns ? turns : null, hold: action === "balance" ? end - start : null, holdBounded: action === "balance" && bounded, checks: rec.checks, deductions: [] });
 };
 const merged = (state: string, gap: number) => {
  const mask = f.state.map(s => s === state);
  const r = runs(mask), out: [number, number][] = [];
  for (const [a, z] of r) { const last = out[out.length - 1]; if (last && times[a] - times[last[1] - 1] <= gap) last[1] = z; else out.push([a, z]); }
  return out;
 };
 const steps = [...f.steps].sort((x, y) => x.start - y.start), groups: { start: number; end: number; n: number }[] = [];
 for (const st of steps) { const g = groups[groups.length - 1]; if (g && st.start <= g.end + .35) { g.end = Math.max(g.end, st.end); g.n++; } else groups.push({ ...st, n: 1 }); }
 for (const [a, z] of merged("flight", .08)) {
  let peak = a; for (let i = a; i < z; i++) if ((f.split[i] ?? -1) > (f.split[peak] ?? -1)) peak = i;
  // A short, low "flight" in the middle of an ongoing turn sequence is a releve rise (fouette, pirouette),
  // not a jump: 2D landmarks cannot separate a raised heel from a small hop there.
  const start = times[a], end = times[Math.min(z, T) - 1];
  if (end - start <= .5 && (f.split[peak] ?? 0) < 90 && groups.some(g => g.n >= 2 && g.start <= start - .25 && g.end >= start)) continue;
  const w = [peak - 1, peak, peak + 1].filter(i => i >= a && i < z); push("leap", a, z, peak, w);
 }
 for (const [a, z] of merged("balance", .2)) { if (times[z - 1] - times[a] < .3) continue; const idx = Array.from({ length: z - a }, (_, k) => a + k); push("balance", a, z, Math.floor((a + z) / 2), idx); }
 for (const g of groups) {
  if (g.n < 2) continue; // a single half turn is a direction change, not a rotation difficulty
  const a = times.findIndex(t => t >= g.start - 1e-9), z = times.findIndex(t => t > g.end + 1e-9);
  if (events.some(e => e.action === "leap" && e.start <= g.end && e.end >= g.start)) continue;
  const end = z < 0 ? T : z, idx = Array.from({ length: end - a }, (_, k) => a + k); push("rotation", a, end, Math.floor((a + end) / 2), idx);
 }
 const back = f.lean.map((v, i) => v !== null && v >= 100 && (f.headAboveHip[i] ?? 1) <= 0 && (f.hipHeight[i] ?? 9) <= 1.1);
 for (const [a, z] of runs(back)) if (times[z - 1] - times[a] >= .4) push("flexibility", a, z, Math.floor((a + z) / 2), Array.from({ length: z - a }, (_, k) => a + k));
 return events.sort((x, y) => x.start - y.start).map((e, i) => ({ ...e, id: i + 1 }));
}
const SPLIT_FORMS = new Set(["split_leap", "ring_leap", "turning_split_leap", "switch_split_leap", "turning_switch_split_leap"]);
export const NOT_ASSESSED = ["artistry", "apparatus_difficulty", "apparatus_technique", "loss_of_balance", "leg_switch", "cell_variant", "dynamic_balance"];
export function scoreRoutine(events: RgEvent[], mode: "routine" | "element", staticLongest: number | null): RgScore {
 const seen = new Set<string>(), items: RgScore["d"]["items"] = [];
 for (const e of events) if (e.family && e.baseValue !== null && e.element && !seen.has(e.family)) { seen.add(e.family); items.push({ event: e.id, element: e.element, family: e.family, value: e.baseValue }); }
 const groups = new Set(items.map(i => i.family.split(".")[0]));
 const missingGroups = mode === "routine" ? ["1", "2", "3"].filter(g => !groups.has(g)) : [];
 const penalty = missingGroups.length * .3;
 const deductions: RgScore["e"]["deductions"] = [];
 for (const e of events) {
  for (const dd of e.deductions) deductions.push({ event: e.id, code: dd.code, value: dd.value, time: e.peak, status: dd.status, params: dd.params });
 }
 if (mode === "routine" && staticLongest !== null && staticLongest >= 4) deductions.push({ code: "static", value: .3, status: "estimated", params: { seconds: Math.round(staticLongest * 10) / 10 } });
 const total = Math.round(deductions.filter(d => d.status === "estimated").reduce((a, d) => a + d.value, 0) * 100) / 100;
 const review = Math.round(deductions.filter(d => d.status === "review").reduce((a, d) => a + d.value, 0) * 100) / 100;
 const d = Math.round((items.reduce((a, i) => a + i.value, 0)) * 100) / 100;
 return { mode, d: { value: d, items, missingGroups, penalty }, e: { total, upper: Math.round((10 - total) * 100) / 100, review, deductions }, notAssessed: NOT_ASSESSED };
}
export function analyzeRg(c: SportContext): SportResult {
 const b = c.body, f = rgFrames(b), findings: Finding[] = [];
 const mode: "routine" | "element" = c.exercise === "routine" || (c.exercise !== "element" && c.duration >= 45) ? "routine" : "element";
 const events = f ? buildEvents(b, f) : [];
 for (const e of events) {
  if (e.action === "leap" && e.element && SPLIT_FORMS.has(e.element)) {
   const dd = splitDeduction(e.props.split_deg ?? null);
   // Projected split angles are review candidates, not certified execution faults (camera plane unknown).
   if (dd) e.deductions.push({ code: "split_" + dd.band, value: dd.value, status: "review", params: { deviation: Math.round(dd.deviation), split: Math.round(e.props.split_deg!) } });
  }
  if (e.action === "balance" && e.family && e.hold !== null && e.holdBounded && e.hold < 1) e.deductions.push({ code: "balance_short", value: .3, status: "estimated", params: { seconds: Math.round(e.hold * 100) / 100 } });
 }
 const env = longestHold(b, 0, b.times.length, .12);
 const score = scoreRoutine(events, mode, env ? env.value : null);
 const count = (a: string) => events.filter(e => e.action === a).length;
 if (!f) findings.push({ code: "rg_no_body", tone: "attention", kind: "quality" });
 else findings.push({ code: "rg_events", tone: events.length ? "info" : "attention", kind: "info", time: events[0]?.peak, params: { leaps: count("leap"), balances: count("balance"), rotations: count("rotation"), flex: count("flexibility") } });
 for (const e of events) {
  for (const dd of e.deductions) findings.push({ code: "rg_" + dd.code, tone: "attention", kind: dd.status === "review" ? "info" : "fault", severity: dd.value >= .5 ? 3 : dd.value >= .3 ? 2 : 1, count: 1, total: 1, time: e.peak, params: { element: e.element ?? "", value: dd.value, ...(dd.params ?? {}) } });
  if (e.action === "balance" && e.family && e.hold !== null && e.hold >= 1) findings.push({ code: "rg_balance_held", tone: "good", kind: "strength", count: 1, total: 1, time: e.peak, params: { element: e.element ?? "", seconds: Math.round(e.hold * 10) / 10 } });
  if (e.action === "rotation" && e.turns) findings.push({ code: "rg_rotation", tone: "info", kind: "info", time: e.peak, params: { element: e.element ?? "", turns: e.turns } });
 }
 for (const dd of score.e.deductions) if (dd.code === "static") findings.push({ code: "rg_static", tone: "attention", kind: "fault", severity: 2, count: 1, total: 1, params: { seconds: dd.params?.seconds ?? 0 } });
 for (const g of score.d.missingGroups) findings.push({ code: "rg_missing_group", tone: "attention", kind: "fault", severity: 2, count: 1, total: 1, params: { group: g } });
 const split = metricById(c.metrics, "split");
 if (split && split.max !== null) { let idx = 0; split.series.forEach((v, i) => { if ((v ?? -1) > (split.series[idx] ?? -1)) idx = i; }); findings.push({ code: "rg_max_split", tone: "info", kind: "info", time: b.times[idx], params: { value: Math.round(split.max) } }); }
 const balances = events.filter(e => e.action === "balance" && e.hold !== null);
 const turns = events.filter(e => e.action === "rotation").reduce((a, e) => a + (e.turns ?? 0), 0);
 const lift = metricById(c.metrics, "legLift"), trunk = metricById(c.metrics, "trunk");
 const scalars: Scalar[] = [
  scalar("elements", events.length, "count", 0), scalar("leaps", count("leap"), "count", 0), scalar("balances", count("balance"), "count", 0), scalar("rotationTurns", turns, "turns", 1),
  scalar("maxSplit", split?.max ?? null, "deg", 0), scalar("maxLegLift", lift?.max ?? null, "deg", 0), scalar("maxTrunk", trunk?.max ?? null, "deg", 0),
  scalar("longestBalance", balances.length ? Math.max(...balances.map(e => e.hold!)) : null, "s", 1),
  scalar("dBody", score.d.value, "points", 2), scalar("eDeductions", score.e.total, "points", 2)
 ];
 const cycles = events.map(e => ({ start: e.start, peak: e.peak, end: e.end }));
 const severityOrder = (x: Finding) => x.kind === "fault" ? 0 : x.kind === "strength" ? 1 : 2;
 return { scalars, findings: findings.sort((a, z) => severityOrder(a) - severityOrder(z) || (z.severity ?? 0) - (a.severity ?? 0)), cycles, driver: null, rg: { events, score } };
}
