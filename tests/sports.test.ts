import test from "node:test";
import assert from "node:assert/strict";
import { makeReport } from "../src/core/report.ts";
import { rank } from "../src/core/findings.ts";
import { evaluate, metricsOnly } from "../src/sports/fitness.ts";
import { extensionEvents, rotationExtent } from "../src/sports/boxing.ts";
import { recognise, rgFrames, scoreRoutine, splitDeduction } from "../src/sports/rg.ts";
import { buildBody } from "../src/core/body.ts";
import { trackAthlete } from "../src/core/track.ts";
import type { Landmark, Metric, RgEvent } from "../src/types.ts";
import { pose, samples } from "./fixtures.ts";
const m = (id: string, min: number, max: number): Metric => ({ id, unit: "deg", value: (min + max) / 2, min, max, coverage: 1, series: [] });
test("exercise predicates: a squat geometry matches squat only", () => {
 const metrics = [m("leftKnee", 70, 175), m("rightKnee", 72, 176), m("leftHip", 80, 175), m("rightHip", 85, 176), m("leftElbow", 150, 170), m("rightElbow", 150, 170), m("leftShoulder", 10, 30), m("rightShoulder", 10, 30)];
 const s = { standing: 1, trunkLean: 25, trunkRange: 20, bodyHorizontal: 0, hipAsymmetry: 5, footSplit: .3, hold: .5, handsOverhead: -.5, proneSupport: null, wristTravel: .8 };
 const ctx = { metrics, s, driverGroup: "knee" };
 assert.equal(evaluate(ctx, "squat").status, "agree"); assert.equal(evaluate(ctx, "lunge").status, "conflict");
 assert.deepEqual(metricsOnly(ctx)?.element, "squat");
});
test("ambiguous geometry yields candidates instead of a guess (lunge vs split squat)", () => {
 const metrics = [m("leftKnee", 85, 175), m("rightKnee", 88, 175), m("leftHip", 80, 175), m("rightHip", 150, 176)];
 const r = metricsOnly({ metrics, s: { hipAsymmetry: 70, footSplit: 1.2, bodyHorizontal: 0 }, driverGroup: "knee" });
 assert.equal(r?.element, null); assert.deepEqual(r?.candidates, ["lunge", "split_squat"]);
});
test("strike detection needs extension and retraction", () => {
 const t = Array.from({ length: 60 }, (_, i) => i / 30);
 const punch = t.map(x => { const ph = x % .5; return ph < .15 ? 70 + ph / .15 * 100 : ph < .3 ? 170 - (ph - .15) / .15 * 100 : 70; });
 assert.equal(extensionEvents(punch, t).length, 4);
 const raise = t.map(x => Math.min(170, 70 + x * 200));
 assert.equal(extensionEvents(raise, t).length, 0, "arm raised and kept is not a strike");
});
test("rotation extent ignores jitter and glitches", () => {
 const t = Array.from({ length: 31 }, (_, i) => i / 30);
 assert.ok(Math.abs(rotationExtent(t.map(x => x * 90), t)! - 90) < 1e-6);
 assert.equal(rotationExtent(t.map((_, i) => (i % 2) * .3), t), 0);
 assert.equal(rotationExtent(t.map((_, i) => i === 10 ? 180 : 0), t), 0);
});
test("boxing: dropped rear hand on most strikes is the focus fault", () => {
 const fps = 30, s = samples(fps * 4, fps, (_, x) => { const ph = x % .8, e = ph < .15 ? 70 + ph / .15 * 100 : ph < .3 ? 170 - (ph - .15) / .15 * 100 : 70; return pose({ elbow: e, elbowR: 40 }); });
 const r = makeReport({ sport: "boxing", exercise: "auto", fileName: "b.mp4", samples: s, fps, threshold: .65, elapsedMs: 1, duration: 4 });
 assert.ok((r.strikes?.length ?? 0) >= 4); const focus = r.findings.find(f => f.focus);
 assert.equal(focus?.code, "guard_drop");
 const held = makeReport({ ...{ sport: "boxing" as const, exercise: "auto", fileName: "b.mp4", fps, threshold: .65, elapsedMs: 1, duration: 4 }, samples: samples(fps * 4, fps, (_, x) => { const ph = x % .8, e = ph < .15 ? 70 + ph / .15 * 100 : ph < .3 ? 170 - (ph - .15) / .15 * 100 : 70; return pose({ elbow: e, elbowR: 40, wristUpR: .25 }); }) });
 assert.ok(held.findings.some(f => f.code === "guard_held"));
});
test("FIG 2.5 split bands and balance profiles", () => {
 assert.equal(splitDeduction(180), null); assert.equal(splitDeduction(172)?.value, .1); assert.equal(splitDeduction(165)?.value, .3); assert.equal(splitDeduction(150)?.value, .5);
 assert.equal(recognise("leap", { split_deg: 175, free_leg_lift_deg: 100, free_knee_deg: 170 }, 0, 0).element, "split_leap");
 assert.equal(recognise("balance", { free_leg_lift_deg: 100, free_knee_deg: 170, foot_above_head_norm: -1 }, 0, 0).element, "arabesque");
 assert.equal(recognise("leap", { split_deg: 60 }, 0, 0).element, "jump");
});
test("partial D/E: unique families, missing groups in routine mode, review deductions kept apart", () => {
 const ev = (id: number, family: string, value: number, deductions: RgEvent["deductions"] = []): RgEvent => ({ id, action: "leap", start: id, end: id + .3, peak: id + .1, element: "split_leap", family, familyTitle: "", baseValue: value, props: {}, turns: null, hold: null, holdBounded: false, checks: [], deductions });
 const s = scoreRoutine([ev(1, "1.210", .3, [{ code: "split_small", value: .1, status: "review" }]), ev(2, "1.210", .3), ev(3, "2.90", .2, [{ code: "balance_short", value: .3, status: "estimated" }])], "routine", 5);
 assert.equal(s.d.value, .5); assert.deepEqual(s.d.missingGroups, ["3"]); assert.equal(s.d.penalty, .3);
 assert.equal(s.e.total, .6); assert.equal(s.e.review, .1); assert.equal(s.e.upper, 9.4);
});
test("findings: max three faults, top fault is the focus", () => {
 const f = (code: string, severity: number, count: number) => ({ code, tone: "attention" as const, kind: "fault" as const, severity, count, total: 10 });
 const r = rank([f("a", 1, 9), f("b", 3, 3), f("c", 2, 5), f("d", 2, 8), null]);
 assert.deepEqual(r.map(x => x.code), ["b", "d", "c"]); assert.equal(r[0].focus, true);
});
test("rg flight: a real jump is a leap, a collapsed-leg artefact is not", () => {
 const run = (air: (lm: Landmark[]) => Landmark[], dy: number) => {
  const s = samples(45, 30, (_, t) => { const inAir = t >= .8 && t < 1.1, lm = pose({ dy: inAir ? dy : 0 }); return inAir ? air(lm) : lm; });
  return rgFrames(buildBody(trackAthlete(s).samples, .65))!.flight.some(Boolean);
 };
 assert.equal(run(lm => lm, -.12), true);
 // Lite-style collapse: the "support" leg folds to a stub under the hip while the other leg is lifted.
 const collapsed = (lm: Landmark[]) => { const c = lm.map(p => ({ ...p })), hy = c[23].y;
  c[25] = { ...c[25], y: hy + .05 }; for (const k of [27, 29, 31]) c[k] = { ...c[k], x: c[23].x, y: hy + .08 };
  c[26] = { ...c[26], x: c[24].x + .15, y: hy - .02 }; for (const k of [28, 30, 32]) c[k] = { ...c[k], x: c[24].x + .32, y: hy - .05 };
  return c; };
 assert.equal(run(collapsed, -.04), false);
});
test("rg rotation: fast turns are counted at 15 fps", () => {
 // Two turns per second on one leg (free knee bent): shoulder and hip widths pass through profile every 0.25 s.
 const turning = (spec: Parameters<typeof pose>[0]) => samples(45, 15, (_, t) => {
  const lm = pose(spec), w = Math.abs(Math.cos(2 * Math.PI * 2 * t + .3)), cx = .5;
  for (const k of [11, 12, 23, 24, 13, 14, 15, 16]) lm[k] = { ...lm[k], x: cx + (lm[k].x - cx) * w };
  return lm;
 });
 const steps = (spec: Parameters<typeof pose>[0]) => rgFrames(buildBody(trackAthlete(turning(spec)).samples, .65))!.steps.length;
 assert.ok(steps({ knee: 60, kneeR: 175 }) >= 6, "half turns on one leg");
 assert.equal(steps({}), 0, "a pivot on two flat feet is not a rotation");
});
