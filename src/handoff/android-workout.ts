import type { Lang, Report, Sample } from "../types.ts";

export type AndroidWorkout = { nonce: string; lang?: Lang };

export function androidWorkout(hash: string, sport: string): AndroidWorkout | null {
 const params = new URLSearchParams(hash.replace(/^#/, ""));
 const nonce = params.get("workout") ?? "";
 if (sport !== "fitness" || !/^[a-f0-9]{32}$/.test(nonce)) return null;
 const lang = params.get("lang");
 return { nonce, lang: lang === "en" || lang === "ru" || lang === "ro" ? lang : undefined };
}

type Point = { x: number; y: number; confidence: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function leg(sample: Sample, side: number) {
 return [11, 23, 25, 27].map(index => {
  const p = sample.landmarks[index + side];
  const visible = p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  return { x: (p?.x ?? 0) * sample.width, y: (p?.y ?? 0) * sample.height,
   confidence: visible ? Math.min(p.visibility, p.presence ?? 1) : 0 };
 });
}

/** Same standing-to-standing measurement as the Android diary's SquatTracker. */
function measureSquats(samples: Sample[]) {
 const rows: string[] = [];
 let skipped = 0, previous = -1, side: number | null = null, standing = 0;
 let start = 0, bottom = 0, minimum = 180, moving = false;
 const interrupt = () => {
  if (moving) skipped++;
  moving = false; standing = 0; side = null;
 };
 for (const sample of samples) {
  const ms = Math.round(sample.time * 1000);
  if (ms <= previous) continue;
  if (previous >= 0 && ms - previous > 650) interrupt();
  previous = ms;
  const legs = [leg(sample, 0), leg(sample, 1)];
  const confidence = legs.map(points => Math.min(...points.map(p => p.confidence)));
  const use: number = side ?? (confidence[0] >= confidence[1] ? 0 : 1);
  const [shoulder, hip, knee, ankle] = legs[use];
  const torso = distance(shoulder, hip), thigh = distance(hip, knee), shin = distance(ankle, knee);
  const bothVisible = legs.every(points => points[0].confidence >= .6 && points[1].confidence >= .6);
  const span = distance(legs[0][0], legs[1][0]) + distance(legs[0][1], legs[1][1]);
  if (confidence[use] < .6 || torso < 1e-5 || (bothVisible && span > 1.16 * torso) || Math.min(thigh, shin) < .22 * torso) {
   interrupt(); continue;
  }
  const cosine = ((hip.x - knee.x) * (ankle.x - knee.x) + (hip.y - knee.y) * (ankle.y - knee.y)) / (thigh * shin);
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  if (!Number.isFinite(angle)) { interrupt(); continue; }
  if (!moving) {
   if (angle >= 153) { standing = Math.max(standing, angle); start = ms; side = use; }
   else if (standing > 0 && angle <= 146) { moving = true; bottom = ms; minimum = angle; }
  } else {
   if (angle < minimum) { minimum = angle; bottom = ms; }
   if (angle >= 153) {
    const bend = Math.round(standing - minimum), down = bottom - start, up = ms - bottom;
    if (bend >= 24 && down >= 140 && up >= 140 && down <= 600000 && up <= 600000) rows.push([bend, down, up].join(","));
    else skipped++;
    moving = false; standing = angle; start = ms; side = null;
   }
  }
 }
 interrupt();
 return { rows, skipped };
}

/** Only measured knee excursion and phase times leave the browser when the athlete taps the link. */
export function androidResult(report: Report, context: AndroidWorkout): string | null {
 if (report.sport !== "fitness" || !(report.exercise === "squat" ||
     report.exercise === "auto" && report.exerciseInfo?.detected === "squat")) return null;
 const { rows, skipped } = measureSquats(report.samples);
 if (rows.length > 999 || skipped > 9999) return null;
 const params = new URLSearchParams({ v: "1", token: context.nonce, skipped: String(skipped), reps: rows.join(";") });
 return "intent://pose/return?" + params + "#Intent;scheme=sportcoach;package=dev.sportcoach.app;end";
}
