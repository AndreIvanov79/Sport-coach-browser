import { test } from "node:test";
import assert from "node:assert/strict";
import { androidResult, androidWorkout } from "../src/handoff/android-workout.ts";
import type { Report, Sample } from "../src/types.ts";
const token = "abcd0123".repeat(4);
const ctx = { nonce: token };
function frame(time: number, standing: boolean, front = false): Sample {
 const landmarks = Array.from({length: 33}, () => ({x: .4, y: .2, z: 0, visibility: 1}));
 for (const side of [0, 1]) {
  const x = .4 + side * (front ? .25 : .01);
  for (const [i, y] of [[11,.1], [23,.4], [25,.6], [27,standing ? .8 : .6]])
   landmarks[i+side] = {x: x + (!standing && i === 27 ? .2 : 0), y, z: 0, visibility: 1};
 }
 return {time, width: 640, height: 640, landmarks};
}
const report = {sport: "fitness", exercise: "squat", fileName: "private-video",
 samples: [frame(0,true),frame(.4,false),frame(.7,true)]} as Report;
test("android launch requires fitness and a valid token; ordinary and Telegram links keep their modes", () => {
 assert.equal(androidWorkout("", "fitness"), null);
 assert.equal(androidWorkout("#coach=1&ret=coach_desk_lite_bot", "fitness"), null);
 assert.equal(androidWorkout("#workout=bad", "fitness"), null);
 assert.equal(androidWorkout("#workout=" + token, "boxing"), null);
 assert.deepEqual(androidWorkout("#workout=" + token + "&lang=ro", "fitness"), {nonce:token,lang:"ro"});
});
test("returns only observed measurements to the fixed Android package", () => {
 const link = androidResult(report,ctx)!;
 assert.ok(link.startsWith("intent://pose/return?"));
 assert.ok(link.endsWith("#Intent;scheme=sportcoach;package=dev.sportcoach.app;end"));
 const p = new URL(link).searchParams;
 assert.deepEqual(Object.fromEntries(p),{v:"1",token,skipped:"0",reps:"90,400,300"});
 assert.equal(androidResult({...report,exercise:"lunge"},ctx),null);
 const params = (samples: Sample[]) => new URL(androidResult({...report,samples},ctx)!).searchParams;
 assert.equal(params([frame(0,true,true),frame(.4,false,true),frame(.7,true,true)]).get("reps"),"");
 assert.equal(params(report.samples.slice(0,2)).get("skipped"),"1");
 assert.equal(params([frame(0,true),frame(.4,false),frame(2,true)]).get("reps"),"");
});
