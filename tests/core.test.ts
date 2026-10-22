import test from "node:test";
import assert from "node:assert/strict";
import { angle } from "../src/core/geometry.ts";
import { buildBody, observed } from "../src/core/body.ts";
import { metricsFor, seriesOf } from "../src/core/series.ts";
import { detectCycles, inferInverted, pickDriver } from "../src/core/cycles.ts";
import { choosableAthlete, distinctPoses, trackAthlete } from "../src/core/track.ts";
import { lookDistance, sampleLooks } from "../src/core/appearance.ts";
import { classifyView } from "../src/core/view.ts";
import { makeReport, refreshReport } from "../src/core/report.ts";
import { hide, pose, samples } from "./fixtures.ts";
const squat = (t: number) => 125 + 50 * Math.cos(2 * Math.PI * t / 2);
test("angles handle degenerate joints", () => { assert.equal(angle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), null); assert.equal(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90); });
test("observation gate rejects low visibility, nonfinite and off-frame points", () => {
 for (const p of [{ visibility: .1 }, { x: NaN }, { x: 1.1 }, { presence: .2 }]) assert.equal(observed({ x: .5, y: .5, z: 0, visibility: .9, presence: .9, ...p }, .65), false);
});
test("aspect ratio is applied before measuring angles", () => {
 const lm = pose(); lm[11] = { x: 0, y: 0, z: 0, visibility: 1 }; lm[13] = { x: .5, y: 0, z: 0, visibility: 1 }; lm[15] = { x: 1, y: 1, z: 0, visibility: 1 };
 const b = buildBody([{ time: 0, width: 1920, height: 1080, landmarks: lm }], .65);
 assert.equal(seriesOf(b, "leftElbow").obs[0], angle({ x: 0, y: 0 }, { x: 960, y: 0 }, { x: 1920, y: 1080 }));
});
test("isolated dropouts are bridged: 6 squats stay 6 instead of collapsing", () => {
 const fps = 15, s = samples(fps * 12, fps, (i, t) => { const lm = pose({ knee: squat(t) }); return i % 10 === 5 ? hide(lm, 25, 26, 27, 28) : lm; });
 const r = makeReport({ sport: "fitness", exercise: "squat", fileName: "s.mp4", samples: s, fps, threshold: .65, elapsedMs: 1, duration: 12 });
 assert.equal(r.cycles.length, 6); assert.equal(r.driver?.endsWith("Knee"), true);
 assert.ok((r.metrics.find(m => m.id === "leftKnee")!.coverage) < .95, "coverage counts only observed frames");
});
test("long gaps are not bridged and reset the cycle", () => {
 const v = [170, 150, 90, null, null, null, null, 110, 170, 170];
 assert.equal(detectCycles(v, v.map((_, i) => i * .1)).length, 0);
});
test("inverted cycles need the return; baseline is inferred from the starting phase", () => {
 const v = [70, 80, 120, 170, 130, 80, 70, 70];
 assert.equal(detectCycles(v, v.map((_, i) => i * .1), true).length, 1);
 assert.equal(inferInverted([70, 72, 71, 120, 170, 120, 70]), true); assert.equal(inferInverted([170, 168, 120, 80, 120, 170]), false);
});
test("a coach in frame no longer removes frames: the athlete is tracked", () => {
 const fps = 15, s = samples(fps * 8, fps, (i, t) => [pose({ knee: squat(t), scale: .9 }), pose({ dx: -.3 + .05 * Math.sin(t), scale: .5, knee: 175 })]);
 const r = makeReport({ sport: "fitness", exercise: "squat", fileName: "two.mp4", samples: s, fps, threshold: .65, elapsedMs: 1, duration: 8 });
 assert.equal(r.athlete.people, 2); assert.equal(r.athlete.lostFrames, 0); assert.equal(r.cycles.length, 4);
 assert.ok(r.coverage > .95);
 const picked = makeReport({ sport: "fitness", exercise: "squat", fileName: "two.mp4", samples: s, fps, threshold: .65, elapsedMs: 1, duration: 8, seed: { index: 0, candidate: 1 } });
 assert.equal(picked.cycles.length, 0, "the selected (still) person has no cycles"); assert.equal(picked.athlete.selection, "user");
});
test("tracking follows identity even when the other person becomes larger", () => {
 const s = samples(20, 10, (i) => { const a = pose({ dx: .2, scale: .6 }), b = pose({ dx: -.25, scale: .5 + i * .02 }); return i % 2 ? [b, a] : [a, b]; });
 const { samples: out } = trackAthlete(s);
 assert.ok(out.every(x => x.landmarks.length && Math.abs(x.landmarks[0].x - .7) < .01));
});
test("driver selection prefers the joint with the largest range", () => {
 const s = samples(60, 15, (_, t) => pose({ elbow: 60 + 50 * (1 + Math.sin(t * 3)), knee: 175 }));
 const b = buildBody(trackAthlete(s).samples, .65), d = pickDriver(metricsFor(b, ["leftKnee", "rightKnee", "leftElbow", "rightElbow"]));
 assert.equal(d?.group, "elbow");
});
test("view classification: frontal synthetic athlete", () => { const b = buildBody(trackAthlete(samples(10, 10, () => pose())).samples, .65); assert.equal(classifyView(b).kind, "front"); });
test("reports abstain on empty input and old v1 reports refresh into v2", () => {
 const empty = makeReport({ sport: "fitness", exercise: "free", fileName: "e.mp4", samples: [{ time: 0, width: 100, height: 100, landmarks: [] }], fps: 15, threshold: .65, elapsedMs: 1, duration: 1 });
 assert.equal(empty.coverage, 0); assert.equal(empty.exercise, "auto"); assert.ok(empty.findings.some(f => f.code === "low_coverage"));
 const v1 = { version: 1, id: "x", sport: "rg", exercise: "shape", fileName: "old.mp4", createdAt: "2026-10-01T00:00:00Z", duration: 1, fps: 10, threshold: .65, model: "MediaPipe Pose Landmarker Lite / float16 / v1", samples: samples(10, 10, () => pose()).map(s => ({ ...s, landmarks: s.candidates![0], candidates: undefined })), metrics: [], findings: [], cycles: [], coverage: 1, driver: null, elapsedMs: 1, interrupted: false };
 const r = refreshReport(v1 as never);
 assert.equal(r.version, 2); assert.equal(r.id, "x"); assert.equal(r.createdAt, "2026-10-01T00:00:00Z"); assert.ok(r.metrics.some(m => m.id === "split"));
});
test("clothing colour is sampled per person and keeps identity when partners cross", () => {
 const W = 200, data = new Uint8ClampedArray(W * W * 4);
 for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; data[o] = x < W / 2 ? 220 : 20; data[o + 2] = x < W / 2 ? 20 : 220; data[o + 3] = 255; }
 const [left, right] = sampleLooks({ data, width: W, height: W }, [pose({ dx: -.25, scale: .4 }), pose({ dx: .25, scale: .4 })]);
 assert.ok(left && right && left.torso[0] > .8 && left.torso[2] < .2 && right.torso[2] > .8);
 assert.ok(lookDistance(left!, right!) > .9 && lookDistance(left!, left!) === 0);
 // Red athlete walks right, blue partner walks left; they overlap in the middle. Blue is listed first,
 // so position alone is a coin toss at the crossing; colour keeps the red athlete.
 const red = { torso: [.9, .1, .1], legs: [.1, .1, .1] }, blue = { torso: [.1, .1, .9], legs: [.1, .1, .1] };
 const s = samples(31, 15, i => [pose({ dx: .2 - i * .4 / 30, scale: .4 }), pose({ dx: -.2 + i * .4 / 30, scale: .4 })]).map(x => ({ ...x, looks: [blue, red] }));
 const { samples: out } = trackAthlete(s, { index: 0, candidate: 1 });
 assert.ok(Math.abs(out[30].landmarks[0].x - pose({ dx: .2, scale: .4 })[0].x) < .01);
});
test("a lone athlete is never dropped because the shirt looks different from the back", () => {
 const front = { torso: [.9, .9, .9], legs: [.1, .1, .1] }, back = { torso: [.8, .1, .1], legs: [.1, .1, .1] };
 const s = samples(30, 15, () => pose()).map((x, i) => ({ ...x, looks: [i < 15 ? front : back] }));
 assert.equal(trackAthlete(s).athlete.lostFrames, 0);
});
test("a ghost second person in a couple of frames does not count as several people", () => {
 const ghost = samples(100, 15, i => i === 40 || i === 41 ? [pose(), pose({ dx: .3, scale: .5 })] : [pose()]);
 assert.equal(choosableAthlete(ghost), false);
 const pair = samples(100, 15, i => i % 3 === 0 ? [pose({ dx: -.2, scale: .5 }), pose({ dx: .2, scale: .5 })] : [pose({ dx: -.2, scale: .5 })]);
 assert.equal(choosableAthlete(pair), true);
 const r = makeReport({ sport: "boxing", exercise: "auto", fileName: "g.mp4", samples: ghost, fps: 15, threshold: .65, elapsedMs: 1, duration: 100 / 15 });
 assert.ok(!r.findings.some(f => f.code === "athlete_auto"));
});
test("two skeletons on one person are merged, two people in a clinch are kept", () => {
 const a = pose({ scale: .6 }), twin = a.map(p => ({ ...p, x: p.x + .01, visibility: p.visibility * .9 }));
 assert.deepEqual(distinctPoses([a, twin], 1000, 1000), [0]);
 // Clinch: boxes overlap a lot, but heads and shoulders are apart.
 const b = pose({ scale: .6, dx: .12 });
 assert.deepEqual(distinctPoses([a, b], 1000, 1000), [0, 1]);
 const s = samples(30, 15, () => [a, twin]); assert.equal(trackAthlete(s).athlete.people, 1);
});
