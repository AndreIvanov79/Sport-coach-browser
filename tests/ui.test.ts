import test from "node:test";
import assert from "node:assert/strict";
import { chartSvg } from "../src/ui/chart.ts";
import { drawLandmarks } from "../src/ui/overlay.ts";
import { pose } from "./fixtures.ts";
test("fractional series use a readable vertical scale", () => {
 const svg = chartSvg([.1, .2, .3], [0, .1, .2], "Head", "#fff");
 assert.ok(svg.includes(">0.1</text>") || svg.includes(">0,1</text>")); assert.ok(!svg.includes(">10</text>"));
});
test("charts never connect across gaps and show bands", () => {
 const svg = chartSvg([1, 2, null, 3, 4], [0, 1, 2, 3, 4], "x", "#fff", { bands: [{ start: 1, end: 2 }] });
 assert.equal((svg.match(/M/g) ?? []).length >= 2, true); assert.ok(svg.includes("<rect"));
});
test("overlay draws the face, excludes uncertain points and labels angles", () => {
 const lms = pose({ knee: 90 }), arcs: number[][] = [], texts: string[] = [];
 const ctx = { globalAlpha: 1, lineWidth: 1, strokeStyle: "", fillStyle: "", font: "", textBaseline: "", beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {}, measureText: (s: string) => ({ width: s.length * 7 }), fillText: (s: string) => texts.push(s), arc: (...a: number[]) => arcs.push(a) };
 drawLandmarks(ctx as unknown as CanvasRenderingContext2D, lms, { ox: 0, oy: 0, w: 1000, h: 1000 }, { accent: "#fff", threshold: .65, angles: [[23, 25, 27]] }, { w: 1000, h: 1000 });
 assert.equal(arcs.length, 33); assert.ok(texts.includes("90°"));
 arcs.length = 0; lms[0].visibility = .1; drawLandmarks(ctx as unknown as CanvasRenderingContext2D, lms, { ox: 0, oy: 0, w: 1000, h: 1000 }, { accent: "#fff", threshold: .65 }, { w: 1000, h: 1000 });
 assert.equal(arcs.length, 32);
});
test("imported reports cannot smuggle markup through the id or file name", async () => {
 const { makeReport } = await import("../src/core/report.ts");
 const { validateImport } = await import("../src/ui/history-view.ts");
 const { samples } = await import("./fixtures.ts");
 const r = makeReport({ sport: "fitness", exercise: "squat", fileName: "s.mp4", samples: samples(30, 15, () => pose()), fps: 15, threshold: .65, elapsedMs: 1, duration: 2 });
 const ok = validateImport(JSON.parse(JSON.stringify(r)), "fitness");
 assert.equal(ok.id, r.id); assert.equal(ok.fileName, "s.mp4");
 const bad = validateImport({ ...JSON.parse(JSON.stringify(r)), id: "\"><img src=x>", createdAt: "<b>", fileName: 7 }, "fitness");
 assert.match(bad.id, /^[\w-]+$/); assert.ok(!Number.isNaN(Date.parse(bad.createdAt))); assert.equal(bad.fileName, "report.json");
});
