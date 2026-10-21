import type { Cycle, Finding, Scalar, Strike } from "../types.ts";
import type { Body } from "../core/body.ts";
import type { SportContext, SportResult } from "../core/findings.ts";
import { L } from "../core/landmarks.ts";
import { derivative, median, median3, percentile, smoothTime } from "../core/stats.ts";
import { wrap180 } from "../core/geometry.ts";
import { consistentStrength, rank, scalar, systematicFault } from "../core/findings.ts";
import { metricById, pairOf, span, windowValues } from "./common.ts";
import { fitnessScalars } from "./fitness.ts";
// Port of qwen36 boxing_metrics / boxing_findings thresholds (coach heuristics, not a rulebook).
const GUARD_DROP = -.30, GUARD_OK = -.25, STRAIGHT_LEG = 168, STRONG_ROT = 60, FAST_PUNCH = 400, FULL_EXT = 150, STANCE_NARROW = .8, STANCE_WIDE = 2;
// 24-25 fps sources (common for phones and broadcast) still resolve a strike extension over 3+ frames.
const MAX_ROT = 300, MIN_VELOCITY_FPS = 20;
type Ev = { peak: number; start: number };
/** Extension events: rise >= minRise within maxRise s to a peak >= minPeak, followed by a retraction (strike-like, not arm raising). */
export function extensionEvents(series: (number | null)[], times: number[], minRise = 35, minPeak = 120, maxRise = .5, minGap = .25): Ev[] {
 const v = median3(series), out: Ev[] = [];
 for (let i = 1; i < v.length - 1; i++) {
  const x = v[i]; if (x === null || x < minPeak) continue;
  if ((v[i - 1] !== null && v[i - 1]! > x) || (v[i + 1] !== null && v[i + 1]! > x)) continue;
  let lo = i, j = i; while (j > 0 && v[j - 1] !== null && times[i] - times[j - 1] <= maxRise) { j--; if (v[j]! < v[lo]!) lo = j; }
  if (x - v[lo]! < minRise) continue;
  let drop = false; for (let k = i + 1; k < v.length && times[k] - times[i] <= .7; k++) { if (v[k] === null) break; if (x - v[k]! >= 20) { drop = true; break; } }
  if (!drop && i < v.length - 2) continue;
  const prev = out[out.length - 1];
  if (prev && times[i] - times[prev.peak] < minGap) { if (x > v[prev.peak]!) out[out.length - 1] = { peak: i, start: lo }; continue; }
  out.push({ peak: i, start: lo });
 }
 return out;
}
/** qwen36 _rotation_extent_deg: net rotation range of a body line with deadband and glitch rejection. */
export function rotationExtent(angles: (number | null)[], times: number[], deadband = 15, glitch = 800): number | null {
 let cum = 0, lo = 0, hi = 0, n = 0;
 for (let i = 1; i < angles.length; i++) {
  const a = angles[i - 1], b = angles[i], dt = times[i] - times[i - 1]; if (a === null || b === null || !(dt > 0)) continue;
  n++; const d = wrap180(b - a), rate = Math.abs(d) / dt; if (rate < deadband || rate > glitch) continue;
  cum += d; lo = Math.min(lo, cum); hi = Math.max(hi, cum);
 }
 return n >= 2 ? hi - lo : null;
}
function lineAngle(b: Body, a: number, c: number) {
 return pairOf(b, p => { const A = p(a), C = p(c); if (!A || !C || !b.torso) return null; const dx = C.x - A.x, dy = C.y - A.y; return Math.hypot(dx, dy) < .25 * b.torso ? null : Math.atan2(dy, dx) * 180 / Math.PI; });
}
export function analyzeBoxing(c: SportContext): SportResult {
 const b = c.body, t = b.torso, times = b.times, fps = times.length > 1 ? (times.length - 1) / Math.max(.001, times[times.length - 1] - times[0]) : 0;
 const series = (id: string) => metricById(c.metrics, id)?.series ?? times.map(() => null);
 const wristGuard = (k: number) => pairOf(b, p => { const n = p(L.nose), w = p(k); return n && w && t ? (n.y - w.y) / t : null; });
 const guardL = wristGuard(L.lWrist), guardR = wristGuard(L.rWrist);
 const shoulders = lineAngle(b, L.lShoulder, L.rShoulder);
 const ankleY = (k: number) => b.pts.map(r => r[k]?.y ?? null);
 const strikes: Strike[] = [];
 const add = (side: "l" | "r", limb: "arm" | "leg", ev: Ev, src: (number | null)[]) => {
  const tp = times[ev.peak], [w0, w1] = span(times, tp - .1, tp + .1);
  const ext = windowValues(src, ...span(times, tp - (limb === "leg" ? .15 : .1), tp + (limb === "leg" ? .15 : .1)));
  const guardSrc = limb === "arm" ? [side === "l" ? guardR : guardL] : [guardL, guardR];
  const g = guardSrc.map(s => windowValues(s.obs, w0, w1)).filter(v => v.length);
  const guard = g.length === guardSrc.length ? Math.min(...g.flat()) : null;
  const [r0, r1] = span(times, tp - .6, tp + .2), rot = rotationExtent(shoulders.full.slice(r0, r1), times.slice(r0, r1));
  const sm = smoothTime(src, times, .04), dv = derivative(sm, times), vel = windowValues(dv, ev.start, ev.peak + 1);
  const otherKnee = side === "l" ? series("rightKnee") : series("leftKnee");
  const sk = limb === "leg" ? windowValues(otherKnee, w0, w1) : [];
  strikes.push({ index: 0, time: tp, side, limb, extension: ext.length ? Math.max(...ext) : null,
   velocity: fps >= MIN_VELOCITY_FPS && vel.length ? Math.max(...vel) : null, guard,
   rotation: rot !== null && rot <= MAX_ROT ? rot : null, standingKnee: sk.length ? median(sk) : null });
 };
 for (const side of ["l", "r"] as const) {
  const elbow = series(side === "l" ? "leftElbow" : "rightElbow");
  for (const ev of extensionEvents(elbow, times)) add(side, "arm", ev, elbow);
  const knee = series(side === "l" ? "leftKnee" : "rightKnee"), own = ankleY(side === "l" ? L.lAnkle : L.rAnkle), other = ankleY(side === "l" ? L.rAnkle : L.lAnkle);
  for (const ev of extensionEvents(knee, times, 35, 140)) {
   const raised = t && own[ev.peak] !== null && other[ev.peak] !== null && other[ev.peak]! - own[ev.peak]! > .5 * t;
   if (raised) add(side, "leg", ev, knee);
  }
 }
 strikes.sort((a, z) => a.time - z.time).forEach((s, i) => s.index = i + 1);
 const arm = strikes.filter(s => s.limb === "arm"), leg = strikes.filter(s => s.limb === "leg");
 const findings: (Finding | null)[] = [];
 const H = (list: Strike[], pick: (s: Strike) => number | null, test: (v: number) => boolean) => list.filter(s => pick(s) !== null && test(pick(s)!)).map(s => ({ time: s.time, value: pick(s)! }));
 const guarded = strikes.filter(s => s.guard !== null);
 if (guarded.length) {
  const dropped = H(guarded, s => s.guard, v => v < GUARD_DROP);
  findings.push(systematicFault("guard_drop", 3, dropped, guarded.length, { worst: Math.round(Math.min(0, ...dropped.map(h => h.value)) * 100) / 100 }) ?? consistentStrength("guard_held", H(guarded, s => s.guard, v => v >= GUARD_OK), guarded.length));
 } else {
  const g = metricById(c.metrics, "guard"), obs = g ? g.series : [];
  const vals = obs.filter((v): v is number => v !== null);
  if (g && g.value !== null && vals.length) {
   const low = vals.filter(v => v < GUARD_DROP).length / vals.length;
   let worst = 0; obs.forEach((v, i) => { const cur = obs[worst]; if (v !== null && (cur === null || v < cur)) worst = i; });
   if (low >= .3) findings.push({ code: "guard_low", tone: "attention", kind: "fault", severity: 3, count: 1, total: 1, time: times[worst], params: { share: Math.round(low * 100) } });
   else if (low <= .1) findings.push({ code: "guard_kept", tone: "good", kind: "strength", count: 1, total: 1 });
  }
 }
 const legsMeasured = leg.filter(s => s.standingKnee !== null);
 findings.push(systematicFault("straight_standing_leg", 2, H(legsMeasured, s => s.standingKnee, v => v > STRAIGHT_LEG), legsMeasured.length));
 if (c.exercise === "straight") { const m = arm.filter(s => s.extension !== null); findings.push(systematicFault("incomplete_extension", 2, H(m, s => s.extension, v => v < FULL_EXT), m.length)); }
 const strong = H(strikes, s => s.rotation, v => v >= STRONG_ROT);
 if (strong.length >= 2) findings.push({ code: "strong_rotation", tone: "good", kind: "strength", count: strong.length, total: strikes.filter(s => s.rotation !== null).length, times: strong.map(h => h.time), time: strong[0].time, params: { best: Math.round(Math.max(...strong.map(h => h.value))) } });
 const fast = arm.filter(s => s.extension !== null && s.velocity !== null && s.extension >= FULL_EXT && s.velocity >= FAST_PUNCH);
 if (fast.length >= 2) findings.push({ code: "fast_full_punches", tone: "good", kind: "strength", count: fast.length, total: arm.filter(s => s.velocity !== null).length, times: fast.map(s => s.time), time: fast[0].time, params: { best: Math.round(Math.max(...fast.map(s => s.velocity!))) } });
 const fs = fitnessScalars(b, c.metrics).values, stance = fs.stanceWidth;
 if (stance !== null && stance > STANCE_WIDE) findings.push({ code: "stance_too_wide", tone: "attention", kind: "fault", severity: 1, count: 1, total: 1, params: { ratio: Math.round(stance * 100) / 100 } });
 if (stance !== null && stance < STANCE_NARROW) findings.push({ code: "stance_too_narrow", tone: "attention", kind: "fault", severity: 1, count: 1, total: 1, params: { ratio: Math.round(stance * 100) / 100 } });
 const head = metricById(c.metrics, "headOffset"), headVals = (head?.series ?? []).filter((v): v is number => v !== null).map(Math.abs);
 const headMove = head && head.value !== null && headVals.length ? percentile(headVals, .98) : null;
 if (headMove !== null && c.exercise === "defense" && headMove < .1) findings.push({ code: "head_static", tone: "attention", kind: "info" });
 else if (headMove !== null && headMove >= .25) findings.push({ code: "head_moves", tone: "info", kind: "info", params: { value: Math.round(headMove * 100) / 100 } });
 if (strikes.length) findings.push({ code: "strikes", tone: "info", kind: "info", time: strikes[0].time, params: { count: strikes.length, arm: arm.length, leg: leg.length, left: strikes.filter(s => s.side === "l").length, right: strikes.filter(s => s.side === "r").length } });
 else findings.push({ code: "no_strikes", tone: "info", kind: "info" });
 if (fps && fps < MIN_VELOCITY_FPS && arm.length) findings.push({ code: "speed_needs_30fps", tone: "info", kind: "quality" });
 const med = (list: Strike[], pick: (s: Strike) => number | null) => { const v = list.map(pick).filter((x): x is number => x !== null); return v.length ? median(v) : null; };
 const best = (list: Strike[], pick: (s: Strike) => number | null) => { const v = list.map(pick).filter((x): x is number => x !== null); return v.length ? Math.max(...v) : null; };
 const g = metricById(c.metrics, "guard");
 const scalars: Scalar[] = [
  scalar("strikes", strikes.length, "count", 0), scalar("armStrikes", arm.length, "count", 0), scalar("legStrikes", leg.length, "count", 0),
  scalar("guardAtStrike", med(strikes, s => s.guard), "torso", 2), scalar("guardMedian", g?.value ?? null, "torso", 2), scalar("guardWorst", g?.min ?? null, "torso", 2),
  scalar("extension", med(arm, s => s.extension), "deg", 0), scalar("punchSpeed", best(arm, s => s.velocity), "dps", 0, fps && fps < MIN_VELOCITY_FPS ? { reason: "fps" } : {}),
  scalar("rotationBest", best(strikes, s => s.rotation), "deg", 0), scalar("stanceWidth", stance, "ratio", 2), scalar("headMovement", headMove, "torso", 2)
 ];
 const cycles: Cycle[] = strikes.map(s => ({ start: Math.max(0, s.time - .25), peak: s.time, end: s.time + .1, side: s.side }));
 return { scalars, findings: rank(findings), cycles, driver: null, strikes };
}
