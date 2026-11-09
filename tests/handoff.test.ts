import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { makeReport } from "../src/core/report.ts";
import { coachSummary, isPhone, preferredOpen, readCoachContext, rememberOpen, reportCount, endCoachMode } from "../src/handoff/coach.ts";
import { decodeSummary, toSummary } from "../src/handoff/summary.ts";
import { analyzerUrl } from "../src/handoff/handoff.ts";
import { RETURN_TARGETS } from "../src/handoff/targets.ts";
import { cardCrop, cardFigures, cardFindings, cardSample } from "../src/ui/share-card.ts";
import type { Report } from "../src/types.ts";
import { pose, samples } from "./fixtures.ts";

const squat = (t: number) => 125 + 50 * Math.cos(2 * Math.PI * t / 2);
const fps = 15;
const report = makeReport({ sport: "fitness", exercise: "squat", fileName: "Иван_присед_IMG_0042.mp4", samples: samples(fps * 12, fps, (_, t) => pose({ knee: squat(t) })), fps, threshold: .65, elapsedMs: 1, duration: 12 });
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

test("only Coach Desk Lite can turn coach mode on", () => {
  assert.deepEqual(RETURN_TARGETS, ["coach_desk_lite_bot"]);
  const url = analyzerUrl("fitness", { athlete: "Ab12Cd34", name: "Анна", ret: { bot: "coach_desk_lite_bot" } });
  const store = memory();
  assert.deepEqual(readCoachContext(new URL(url).hash, store), { ret: { bot: "coach_desk_lite_bot" }, athlete: "Ab12Cd34", name: "Анна" });
  assert.equal(readCoachContext("#coach=1&ret=other_collector_bot&a=Ab12", memory()), null);
  assert.equal(readCoachContext("", memory()), null);
});

test("coach mode survives a reload of the tab, a tampered session does not", () => {
  const store = memory();
  readCoachContext("#coach=1&a=Ab12&n=Max&ret=coach_desk_lite_bot", store);
  assert.deepEqual(readCoachContext("", store), { ret: { bot: "coach_desk_lite_bot" }, athlete: "Ab12", name: "Max" });
  store.setItem("sport-coach-coach", JSON.stringify({ ret: { bot: "other_collector_bot" }, athlete: "Ab12" }));
  assert.equal(readCoachContext("", store), null);
  store.setItem("sport-coach-coach", "{broken");
  assert.equal(readCoachContext("", store), null);
  readCoachContext("#coach=1&ret=coach_desk_lite_bot", store); endCoachMode(store);
  assert.equal(readCoachContext("", store), null);
});

test("the summary carries numbers and codes only, and decodes back", async () => {
  const out = await coachSummary(report, { athlete: "Ab12Cd34", inbox: "x7Yq", ret: { bot: "coach_desk_lite_bot" } });
  assert.ok(out.param.length <= 512);
  assert.deepEqual(out.dropped, { k: [], f: [] });
  const back = await decodeSummary(new URL(out.links.tme).searchParams.get("startapp"));
  assert.deepEqual(back, out.summary);
  assert.equal(back?.id, report.id); assert.equal(back?.a, "Ab12Cd34"); assert.equal(back?.in, "x7Yq");
  assert.equal(back?.s, "f"); assert.equal(back?.e, "squat"); assert.equal(back?.n, 6); assert.equal(back?.d, 120);
  assert.deepEqual(Object.keys(back!.k), report.scalars.filter(s => s.value !== null).map(s => s.id).slice(0, Object.keys(back!.k).length));
  assert.doesNotMatch(JSON.stringify(back), /IMG_0042|Иван|mp4/);
  assert.match(out.links.web, /^https:\/\/web\.telegram\.org\/k\/#\?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3Dcoach_desk_lite_bot%26startapp%3Dr[01]_/);
});

test("counts match the history summary for every sport", () => {
  assert.equal(reportCount(report), report.cycles.length);
  assert.equal(reportCount({ ...report, sport: "boxing", strikes: [{}, {}] } as unknown as Report), 2);
  assert.equal(reportCount({ ...report, sport: "boxing", strikes: undefined } as unknown as Report), null);
  assert.equal(reportCount({ ...report, sport: "rg", rg: { events: [{}], score: {} } } as unknown as Report), 1);
});

test("phones get the direct t.me button, computers choose", () => {
  assert.ok(isPhone({ userAgent: "Mozilla/5.0 (Linux; Android 14; CPH2333) AppleWebKit/537.36 Chrome/142 Mobile Safari/537.36" }));
  assert.ok(isPhone({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" }));
  assert.ok(isPhone({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", maxTouchPoints: 5 }), "iPad");
  assert.ok(isPhone({ userAgent: "x", userAgentData: { mobile: true } }));
  assert.ok(!isPhone({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142 Safari/537.36", maxTouchPoints: 0 }));
  assert.ok(!isPhone({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", maxTouchPoints: 0 }));
  const store = memory();
  assert.equal(preferredOpen(store), "web", "web Telegram works without installing anything");
  rememberOpen("app", store); assert.equal(preferredOpen(store), "app");
});

test("the card shows the summary's findings, figures without the count, and a frame with a pose", () => {
  const r: Report = { ...report, findings: [
    { code: "coverage_ok", tone: "good", kind: "quality" }, { code: "tempo_varies", tone: "info", kind: "info" },
    { code: "hip_sag", tone: "attention", kind: "fault" }, { code: "depth_good", tone: "good", kind: "strength", focus: true, time: 7.03 }
  ] };
  assert.deepEqual(cardFindings(r).map(f => f.code), toSummary({ id: "x", sport: "fitness", exercise: "squat", createdAt: 0, duration: 1, coverage: 1, count: 1, scalars: [], findings: r.findings }).f);
  assert.deepEqual(cardFindings(r).map(f => f.code), ["depth_good", "hip_sag", "tempo_varies"]);
  const figures = cardFigures(r);
  assert.ok(figures.length > 0 && figures.length <= 4);
  assert.ok(figures.every(s => s.value !== null && s.unit !== "count"));
  const s = cardSample(r)!;
  assert.ok(Math.abs(s.time - 7.03) < 1 / fps, "the focus moment");
  assert.ok(s.landmarks.length);
});

// The hand-off files are copies from coach-lite/shared (…/Dev/python_projects/coach-lite next to …/Dev/sport-coach-browser,
// or COACH_LITE_DIR): they must stay byte-identical so both sides read the same format.
const roots = [process.env.COACH_LITE_DIR && pathToFileURL(process.env.COACH_LITE_DIR + "/").href, "../../python_projects/coach-lite/", "../../coach-lite/"];
const shared = roots.filter(Boolean).map(r => new URL("shared/", new URL(r as string, import.meta.url))).find(u => existsSync(new URL("summary.ts", u)));
test("hand-off files are the same as in coach-lite", { skip: !shared && "coach-lite not found (set COACH_LITE_DIR)" }, () => {
  for (const file of ["summary.ts", "handoff.ts"]) assert.equal(readFileSync(new URL("../src/handoff/" + file, import.meta.url), "utf8"), readFileSync(new URL(file, shared!), "utf8"), file);
});

test("the card zooms in on a small athlete and stays inside the frame", () => {
  const lms = Array.from({ length: 33 }, (_, i) => ({ x: .45 + (i % 5) * .02, y: .5 + Math.floor(i / 5) * .04, z: 0, visibility: .9 }));
  const s = { time: 0, width: 720, height: 1280, landmarks: lms };
  const c = cardCrop(s, 720, 1280, 952 / 560);
  assert.ok(c.sh < 1280 * .6, "zoomed in: " + c.sh);
  assert.ok(c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= 720 + 1e-6 && c.sy + c.sh <= 1280 + 1e-6);
  const xs = lms.map(p => p.x * 720), ys = lms.map(p => p.y * 1280);
  assert.ok(Math.min(...xs) >= c.sx && Math.max(...xs) <= c.sx + c.sw && Math.min(...ys) >= c.sy && Math.max(...ys) <= c.sy + c.sh, "the whole athlete is in");
  assert.deepEqual(cardCrop({ ...s, landmarks: lms.map(p => ({ ...p, visibility: .1 })) }, 720, 1280, 1.7), { sx: 0, sy: 0, sw: 720, sh: 1280 }, "no pose: the whole frame");
  const wide = cardCrop({ ...s, width: 1920, height: 1080 }, 1920, 1080, 952 / 560);
  assert.ok(Math.abs(wide.sw / wide.sh - 952 / 560) < 1e-6, "a wide frame fills the area");
});
