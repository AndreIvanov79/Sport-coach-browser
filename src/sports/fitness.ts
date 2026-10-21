import type { ExerciseInfo, Finding, Metric, Rep, Scalar } from "../types.ts";
import type { Body } from "../core/body.ts";
import type { Hit, SportContext, SportResult } from "../core/findings.ts";
import { L } from "../core/landmarks.ts";
import { dist, vecAngle, sub, UP } from "../core/geometry.ts";
import { median, percentile } from "../core/stats.ts";
import { seriesOf } from "../core/series.ts";
import { DRIVER_GROUPS, detectCycles, groupOf, inferInverted, pickDriver } from "../core/cycles.ts";
import { longestHold } from "../core/segments.ts";
import { consistentStrength, rank, scalar, systematicFault } from "../core/findings.ts";
import { ARM_ROM, ASYMMETRIC, EXPECTATIONS, FALLBACK_EXCLUDED, PRONE, SIDE_VIEW, type Pred } from "./fitness-catalog.ts";
import { assessable, checkOp, coverage, hipMid, metricById, nearThreshold, pairOf, shoulderMid, span, windowValues, type Pair } from "./common.ts";
const HORIZONTAL = 60, PRONE_WRIST_BELOW = .35, GROUNDED_DY = .8, MIN_SHOULDER_W = .35, MAX_STANCE = 3, PAUSE_TOL = 10;
type FitScalars = Record<string, number | null>;
/** Signed hip deviation from the shoulder-ankle line, + = sagging toward the floor (qwen36 hip_sag_ratio). */
function hipSagPair(b: Body, trunk: Pair): Pair {
 const t = b.torso;
 return pairOf(b, (p, i) => {
  const s = shoulderMid(p), h = hipMid(p), la = p(L.lAnkle), ra = p(L.rAnkle);
  if (!t || !s || !h || !la || !ra || (trunk.full[i] ?? 0) <= HORIZONTAL) return null;
  const an = { x: (la.x + ra.x) / 2, y: (la.y + ra.y) / 2 }, a = sub(an, s), len = Math.hypot(a.x, a.y);
  if (len < 1e-6) return null;
  let nx = -a.y / len, ny = a.x / len; if (ny < 0) { nx = -nx; ny = -ny; }
  return ((h.x - s.x) * nx + (h.y - s.y) * ny) / t;
 });
}
export function fitnessScalars(b: Body, metrics: Metric[]): { values: FitScalars; sag: Pair; trunk: Pair } {
 const t = b.torso, out: FitScalars = {};
 const trunk = pairOf(b, p => { const s = shoulderMid(p), h = hipMid(p); return s && h ? vecAngle(sub(s, h), UP) : null; });
 const tm = metricById(metrics, "trunk");
 out.trunkLean = assessable(tm) ? tm.max : null;
 out.trunkRange = assessable(tm) ? tm.max - tm.min : null;
 const tObs = trunk.obs.filter((v): v is number => v !== null);
 out.bodyHorizontal = coverage(trunk.obs) >= .6 && tObs.length ? tObs.filter(v => v > HORIZONTAL).length / tObs.length : null;
 // Prone support: wrists clearly below shoulders while horizontal.
 let horiz = 0, propped = 0, measured = 0;
 b.raw.forEach((r, i) => {
  if ((trunk.full[i] ?? 0) <= HORIZONTAL || !t) return; horiz++;
  const s = shoulderMid(k => r[k]), w = [r[L.lWrist], r[L.rWrist]].filter(Boolean) as { x: number; y: number }[];
  if (!s || !w.length) return; measured++;
  if ((w.reduce((a, q) => a + q.y, 0) / w.length - s.y) / t > PRONE_WRIST_BELOW) propped++;
 });
 out.proneSupport = horiz && measured / horiz >= .6 ? propped / measured : null;
 const travels: number[] = [];
 for (const k of [L.lWrist, L.rWrist]) {
  const pts = b.raw.map(r => r[k]).filter(Boolean) as { x: number; y: number }[];
  if (pts.length >= 5 && t) { const xs = pts.map(q => q.x), ys = pts.map(q => q.y); travels.push(Math.hypot(percentile(xs, .95) - percentile(xs, .05), percentile(ys, .95) - percentile(ys, .05)) / t); }
 }
 out.wristTravel = travels.length ? Math.min(...travels) : null;
 const sag = hipSagPair(b, trunk), sagObs = sag.obs.filter((v): v is number => v !== null);
 out.hipSag = sagObs.length >= 4 ? percentile(sagObs, .98) : null;
 const depth = metricById(metrics, "hipDepth"); out.hipDepth = assessable(depth) ? depth.max : null;
 const hands = pairOf(b, p => { const n = p(L.nose); if (!n || !t) return null; const v = [p(L.lWrist), p(L.rWrist)].filter(Boolean).map(w => (n.y - w!.y) / t); return v.length ? Math.max(...v) : null; });
 const handsObs = hands.obs.filter((v): v is number => v !== null);
 out.handsOverhead = coverage(hands.obs) >= .6 ? percentile(handsObs, .98) : null;
 // Stance width and horizontal foot split over frames with both feet grounded (qwen36 stance/foot_split).
 const stance: number[] = [], split: number[] = [];
 let legsSeen = 0, standing = 0;
 for (const r of b.raw) {
  const la = r[L.lAnkle], ra = r[L.rAnkle], lh = r[L.lHip], rh = r[L.rHip]; if (!t || !la || !ra || !lh || !rh) continue;
  const hy = (lh.y + rh.y) / 2; legsSeen++;
  if (la.y - hy <= GROUNDED_DY * t || ra.y - hy <= GROUNDED_DY * t) continue;
  standing++;
  split.push(Math.abs(la.x - ra.x) / t);
  const ls = r[L.lShoulder], rs = r[L.rShoulder];
  if (ls && rs) { const sw = dist(ls, rs); if (sw > MIN_SHOULDER_W * t) stance.push(dist(la, ra) / sw); }
 }
 const n = b.raw.length || 1;
 out.standing = legsSeen / n >= .5 ? standing / legsSeen : null;
 out.stanceWidth = stance.length / n >= .3 && median(stance) <= MAX_STANCE ? median(stance) : null;
 out.footSplit = split.length / n >= .3 && median(split) <= MAX_STANCE ? median(split) : null;
 const lh = metricById(metrics, "leftHip"), rh = metricById(metrics, "rightHip");
 out.hipAsymmetry = assessable(lh) && assessable(rh) ? Math.abs(lh.min - rh.min) : null;
 const hold = longestHold(b); out.hold = hold ? hold.value : null; out.holdStart = hold ? hold.start : null; out.holdEnd = hold ? hold.end : null;
 return { values: out, sag, trunk };
}
type EvalCtx = { metrics: Metric[]; s: FitScalars; driverGroup: string | null };
function resolve(ctx: EvalCtx, p: Pred): number | string | null {
 if (p.src === "sig") return ctx.driverGroup;
 if (p.src === "scalar") { if (p.metric === "trunkLean" && p.field === "range") return ctx.s.trunkRange; return ctx.s[p.metric] ?? null; }
 const sides = DRIVER_GROUPS[p.group].map(id => metricById(ctx.metrics, id)).filter(assessable);
 if (p.agg === "both" && sides.length < 2) return null;
 if (!sides.length) return null;
 const vals = sides.map(m => p.field === "min" ? m.min : p.field === "max" ? m.max : m.max - m.min);
 if (p.agg === "both") return p.field === "min" ? Math.max(...vals) : Math.min(...vals);
 return p.field === "min" ? Math.min(...vals) : Math.max(...vals);
}
export const predLabel = (p: Pred) => p.src === "sig" ? "driver " + p.op + " " + [p.value].flat().join("|") : p.src === "scalar" ? p.metric + (p.field === "range" ? ".range" : "") + " " + p.op + " " + [p.value].flat().join("..") : p.group + "." + p.field + " " + p.op + " " + [p.value].flat().join("..");
export function evaluate(ctx: EvalCtx, element: string) {
 const preds = EXPECTATIONS[element] ?? [], checks: ExerciseInfo["checks"] = [];
 let sat = 0, vio = 0, unv = 0;
 for (const p of preds) {
  const v = resolve(ctx, p), label = predLabel(p);
  if (v === null) { unv++; checks.push({ check: label, result: "unverified" }); continue; }
  const measured = typeof v === "number" ? Math.round(v * 100) / 100 : v;
  if (checkOp(v, p.op, p.value as never)) { sat++; checks.push({ check: label, result: "ok", measured }); }
  else if (typeof v === "number" && p.src !== "sig" && nearThreshold(v, p.op, p.value as number | [number, number])) { unv++; checks.push({ check: label, result: "borderline", measured }); }
  else { vio++; checks.push({ check: label, result: "violated", measured }); }
 }
 return { element, sat, vio, unv, n: preds.length, checks, status: !preds.length ? "unverified" : vio ? "conflict" : sat ? "agree" : "unverified" };
}
const predKey = (p: Pred) => JSON.stringify(p);
/** qwen36 _metrics_only_fallback: only fully satisfied, non-dominated catalog entries; ambiguity returns candidates. */
export function metricsOnly(ctx: EvalCtx, pool = Object.keys(EXPECTATIONS)): { element: string | null; candidates: string[] } | null {
 const matches = pool.filter(el => !FALLBACK_EXCLUDED.has(el) && EXPECTATIONS[el]).map(el => ({ el, r: evaluate(ctx, el) }))
  .filter(x => x.r.vio === 0 && x.r.unv === 0 && x.r.sat === x.r.n).map(x => ({ el: x.el, keys: new Set(EXPECTATIONS[x.el].map(predKey)) }));
 if (!matches.length) return null;
 const subset = (a: Set<string>, b: Set<string>) => a.size < b.size && [...a].every(k => b.has(k));
 const maximal = matches.filter(m => !matches.some(o => o !== m && subset(m.keys, o.keys)));
 return maximal.length === 1 ? { element: maximal[0].el, candidates: [maximal[0].el] } : { element: null, candidates: maximal.map(m => m.el).sort() };
}
const ARM_GROUPS = new Set(["pull", "pullup", "press", "pushup", "curl", "extension"]);
function recognise(ctx: EvalCtx, selected: string, candidates: string[] | undefined): ExerciseInfo {
 if (!candidates) {
  const m = metricsOnly(ctx);
  const detected = m?.element ?? null;
  return { selected, detected, candidates: m?.candidates ?? [], status: "auto", checks: detected ? evaluate(ctx, detected).checks : [] };
 }
 const results = candidates.map(el => evaluate(ctx, el)), agree = results.filter(r => r.status === "agree").sort((a, b) => b.sat - a.sat);
 if (agree.length) return { selected, detected: agree[0].element, candidates: agree.map(r => r.element), status: "agree", checks: agree[0].checks };
 const best = [...results].sort((a, b) => a.vio - b.vio || b.sat - a.sat)[0];
 if (results.every(r => r.status === "conflict")) {
  const m = metricsOnly(ctx);
  return { selected, detected: m?.element ?? null, candidates: m?.candidates ?? [], status: "conflict", checks: best?.checks ?? [] };
 }
 return { selected, detected: null, candidates: [], status: "unverified", checks: best?.checks ?? [] };
}
export function analyzeFitness(c: SportContext): SportResult {
 const b = c.body, times = b.times, ex = c.profile.exercises.find(e => e.id === c.exercise) ?? c.profile.exercises[0];
 const { values: s, sag, trunk } = fitnessScalars(b, c.metrics);
 const auto = pickDriver(c.metrics), chosen = ex.driver ? pickDriver(c.metrics, [ex.driver]) : auto;
 const info = recognise({ metrics: c.metrics, s, driverGroup: auto?.group ?? null }, ex.id, ex.candidates);
 const exercise = info.detected;
 const inverted = chosen ? ex.inverted ?? inferInverted(chosen.metric.series) : false;
 const cycles = chosen ? detectCycles(chosen.metric.series, times, inverted) : [];
 const group = chosen ? groupOf(chosen.metric.id) : null;
 const obsCache = new Map<string, (number | null)[]>();
 const obsOf = (id: string) => { if (!obsCache.has(id)) obsCache.set(id, seriesOf(b, id).obs); return obsCache.get(id)!; };
 // Per-repetition facts (each complete observed cycle is one assessable unit).
 const reps: Rep[] = cycles.map((cy, index) => {
  const [i0, i1] = span(times, cy.start, cy.end), drv = chosen!.metric.series;
  let ext = -1; for (let i = i0; i < i1; i++) { const v = drv[i]; if (v !== null && (ext < 0 || (inverted ? v > drv[ext]! : v < drv[ext]!))) ext = i; }
  let a = ext, z = ext;
  if (ext >= 0) { const e = drv[ext]!; while (a > i0 && drv[a - 1] !== null && Math.abs(drv[a - 1]! - e) <= PAUSE_TOL) a--; while (z < i1 - 1 && drv[z + 1] !== null && Math.abs(drv[z + 1]! - e) <= PAUSE_TOL) z++; }
  const obsSides = group ? DRIVER_GROUPS[group].map(id => windowValues(obsOf(id), i0, i1)) : [];
  const full = obsSides.length === 2 && obsSides.every(v => v.length >= .6 * (i1 - i0));
  const extremeOf = (v: number[]) => inverted ? Math.max(...v) : Math.min(...v);
  const elbows = ["leftElbow", "rightElbow"].map(id => windowValues(obsOf(id), i0, i1)).filter(v => v.length >= .6 * (i1 - i0));
  const horizontalShare = windowValues(trunk.full, i0, i1).filter(v => v > HORIZONTAL).length / Math.max(1, i1 - i0);
  const sagW = windowValues(sag.obs, i0, i1), trunkW = windowValues(trunk.obs, i0, i1), drvW = windowValues(drv, i0, i1);
  return {
   index: index + 1, start: cy.start, end: cy.end, peak: cy.peak, duration: cy.end - cy.start,
   toward: ext >= 0 ? times[a] - cy.start : null, pause: ext >= 0 ? times[z] - times[a] : null, away: ext >= 0 ? cy.end - times[z] : null,
   driverMin: drvW.length ? Math.min(...drvW) : null, driverMax: drvW.length ? Math.max(...drvW) : null,
   asymmetry: full ? Math.abs(extremeOf(obsSides[0]) - extremeOf(obsSides[1])) : null,
   hipSag: horizontalShare >= .5 && sagW.length >= 2 ? percentile(sagW, .98) : null,
   elbowMin: elbows.length ? Math.min(...elbows.flat()) : null, elbowMax: elbows.length ? Math.max(...elbows.flat()) : null,
   trunkMax: trunkW.length ? Math.max(...trunkW) : null
  };
 });
 const findings: (Finding | null)[] = [];
 const hits = (pick: (r: Rep) => number | null, test: (v: number) => boolean): Hit[] => reps.filter(r => pick(r) !== null && test(pick(r)!)).map(r => ({ time: r.peak, value: pick(r)! }));
 const measured = (pick: (r: Rep) => number | null) => reps.filter(r => pick(r) !== null).length;
 const prone = exercise ? PRONE.has(exercise) : (s.bodyHorizontal ?? 0) > .5 && (s.proneSupport ?? 0) > .5;
 if (prone && reps.length) {
  const bad = hits(r => r.hipSag, v => v > .15), total = measured(r => r.hipSag);
  findings.push(systematicFault("hip_sag", 3, bad, total, { worst: Math.round(Math.max(0, ...bad.map(h => h.value)) * 100) / 100 }) ?? consistentStrength("body_line_held", hits(r => r.hipSag, v => Math.abs(v) <= .08), total));
 } else if (prone && (s.hold ?? 0) >= 2 && s.holdStart !== null) {
  const [i0, i1] = span(times, s.holdStart!, s.holdEnd!), w = windowValues(sag.obs, i0, i1);
  if (w.length >= 4) {
   const share = w.filter(v => v > .15).length / w.length, ok = w.filter(v => Math.abs(v) <= .08).length / w.length;
   if (share >= .3) findings.push({ code: "hip_sag_hold", tone: "attention", kind: "fault", severity: 3, count: 1, total: 1, time: s.holdStart!, params: { share: Math.round(share * 100) } });
   else if (ok >= .7) findings.push({ code: "body_line_held_hold", tone: "good", kind: "strength", count: 1, total: 1, time: s.holdStart! });
  }
 }
 if (!(exercise && ASYMMETRIC.has(exercise)) && c.view.kind !== "side" && reps.length) {
  const total = measured(r => r.asymmetry), bad = hits(r => r.asymmetry, v => v > 20);
  findings.push(systematicFault("asymmetry", 2, bad, total, { worst: Math.round(Math.max(0, ...bad.map(h => h.value))) }) ?? consistentStrength("symmetric", hits(r => r.asymmetry, v => v <= 10), total));
 }
 const armExercise = exercise ? ARM_ROM.has(exercise) : ARM_GROUPS.has(ex.id);
 if (armExercise && reps.length && (group === "elbow" || group === "shoulder")) {
  const total = reps.filter(r => r.elbowMax !== null && r.elbowMin !== null).length;
  const partial = hits(r => r.elbowMax, v => v <= 135);
  findings.push(systematicFault("incomplete_elbow_rom", 2, partial, total, { typical: Math.round(median(partial.map(h => h.value).concat(partial.length ? [] : [0]))) }) ??
   consistentStrength("full_elbow_rom", reps.filter(r => r.elbowMin !== null && r.elbowMax !== null && r.elbowMin < 70 && r.elbowMax > 150).map(r => ({ time: r.peak, value: r.elbowMax! })), total));
 }
 // Exercise identification (deterministic predicates; never a guess when ambiguous).
 if (info.status === "agree" && exercise) findings.push({ code: "exercise_confirmed", tone: "good", kind: "info", params: { exercise } });
 else if (info.status === "conflict") findings.push({ code: "exercise_conflict", tone: "attention", kind: "info", params: { selected: ex.id, detected: exercise ?? "", candidates: info.candidates.join(", ") } });
 else if (exercise) findings.push({ code: "exercise_detected", tone: "info", kind: "info", params: { exercise } });
 else if (info.candidates.length > 1) findings.push({ code: "exercise_ambiguous", tone: "info", kind: "info", params: { candidates: info.candidates.join(", ") } });
 if (chosen && cycles.length) {
  findings.push({ code: "cycles", tone: "info", kind: "info", time: cycles[0].peak, params: { count: cycles.length, metric: chosen.metric.id, median: Math.round(median(cycles.map(x => x.end - x.start)) * 100) / 100 } });
  if (cycles.length >= 3) { const d = cycles.map(x => x.end - x.start); if (percentile(d, .9) / Math.max(.1, percentile(d, .1)) > 1.5) findings.push({ code: "tempo_varies", tone: "attention", kind: "info", time: cycles[cycles.length - 1].peak }); }
 } else if (ex.driver || auto) findings.push({ code: "no_cycles", tone: "info", kind: "info" });
 if ((s.hold ?? 0) >= 2 && !reps.length) findings.push({ code: "hold", tone: "info", kind: "info", time: s.holdStart ?? undefined, params: { seconds: Math.round(s.hold! * 10) / 10 } });
 if (exercise && SIDE_VIEW.has(exercise) && c.view.kind === "front") findings.push({ code: "view_side_needed", tone: "attention", kind: "quality", params: { exercise } });
 if (c.view.kind === "side" && reps.length && !(exercise && ASYMMETRIC.has(exercise))) findings.push({ code: "view_front_for_symmetry", tone: "info", kind: "quality" });
 const sets = c.segments.filter(sg => sg.kind === "active").map(sg => ({ ...sg, reps: cycles.filter(cy => cy.start >= sg.start - .2 && cy.end <= sg.end + .2).length }));
 if (sets.length >= 2) findings.push({ code: "sets", tone: "info", kind: "info", time: sets[0].start, params: { count: sets.length, reps: sets.map(x => x.reps).join(" / ") } });
 const med = (pick: (r: Rep) => number | null) => { const v = reps.map(pick).filter((x): x is number => x !== null); return v.length ? median(v) : null; };
 const scalars: Scalar[] = [
  scalar("reps", cycles.length, "count", 0, chosen ? {} : { value: null, reason: "no_driver" }),
  scalar("cycleTime", med(r => r.duration), "s", 2), scalar("towardTime", med(r => r.toward), "s", 2), scalar("pauseTime", med(r => r.pause), "s", 2), scalar("awayTime", med(r => r.away), "s", 2),
  scalar("hold", (s.hold ?? 0) >= 1 ? s.hold : null, "s", 1), scalar("trunkLean", s.trunkLean, "deg", 0), scalar("trunkRange", s.trunkRange, "deg", 0),
  scalar("hipDepth", s.hipDepth, "torso", 2), scalar("hipSag", s.hipSag, "torso", 2),
  scalar("lrAsymmetry", reps.length ? med(r => r.asymmetry) : null, "deg", 0), scalar("hipAsymmetry", s.hipAsymmetry, "deg", 0),
  scalar("stanceWidth", s.stanceWidth, "ratio", 2), scalar("footSplit", s.footSplit, "torso", 2), scalar("handsOverhead", s.handsOverhead, "torso", 2),
  scalar("bodyHorizontal", s.bodyHorizontal === null ? null : s.bodyHorizontal * 100, "pct", 0), scalar("proneSupport", s.proneSupport === null ? null : s.proneSupport * 100, "pct", 0), scalar("wristTravel", s.wristTravel, "torso", 2)
 ];
 return { scalars, findings: rank(findings), cycles, driver: chosen?.metric.id ?? null, exerciseInfo: info, reps, segments: sets };
}
