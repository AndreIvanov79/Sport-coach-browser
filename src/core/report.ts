import { normalizeExercise, profiles } from "../profiles.ts";
import type { Finding, ModelId, Report, Sample, Seed, Sport } from "../types.ts";
import { bodyCoverage, buildBody, reliability } from "./body.ts";
import { metricsFor } from "./series.ts";
import { activitySegments } from "./segments.ts";
import { classifyView } from "./view.ts";
import { choosableAthlete, trackAthlete } from "./track.ts";
import type { SportContext, SportResult } from "./findings.ts";
import { analyzeFitness } from "../sports/fitness.ts";
import { analyzeBoxing } from "../sports/boxing.ts";
import { analyzeRg } from "../sports/rg.ts";
export const MODEL_NAMES: Record<ModelId, string> = { lite: "MediaPipe Pose Landmarker Lite / float16 / v1", full: "MediaPipe Pose Landmarker Full / float16 / v1", heavy: "MediaPipe Pose Landmarker Heavy / float16 / v1" };
export type ReportInput = {
 sport: Sport; exercise: string; fileName: string; samples: Sample[]; fps: number; threshold: number; elapsedMs: number; duration: number;
 interrupted?: boolean; modelId?: ModelId; source?: Report["source"]; seed?: Seed; decode?: string; fileSize?: number; fileModified?: number;
 id?: string; createdAt?: string; processedDuration?: number;
};
const analyzers: Record<Sport, (c: SportContext) => SportResult> = { fitness: analyzeFitness, boxing: analyzeBoxing, rg: analyzeRg };
export function makeReport(input: ReportInput): Report {
 const profile = profiles[input.sport], exercise = normalizeExercise(input.sport, input.exercise);
 const { samples, athlete } = trackAthlete(input.samples, input.seed);
 const body = buildBody(samples, input.threshold);
 const metrics = metricsFor(body, profile.metrics);
 const view = classifyView(body), segments = activitySegments(body);
 const duration = input.duration;
 const result = analyzers[input.sport]({ body, metrics, exercise, profile, view, segments, duration, samples });
 const coverage = bodyCoverage(body), rel = reliability(body), findings: Finding[] = [];
 if (input.interrupted) findings.push({ code: "interrupted", tone: "attention", kind: "quality", params: { seconds: Math.round((input.processedDuration ?? samples[samples.length - 1]?.time ?? 0) * 10) / 10, total: Math.round(duration * 10) / 10 } });
 if (coverage < .6) findings.push({ code: "low_coverage", tone: "attention", kind: "quality", params: { pct: Math.round(coverage * 100) } });
 else findings.push({ code: "coverage_ok", tone: "good", kind: "quality", params: { pct: Math.round(coverage * 100) } });
 const severalPeople = athlete.people > 1 && (!samples.some(s => s.candidates) || choosableAthlete(samples) || athlete.selection === "user");
 if (severalPeople) findings.push({ code: athlete.selection === "user" ? "athlete_user" : "athlete_auto", tone: "info", kind: "quality", time: athlete.seedTime, params: { people: athlete.people, lost: athlete.lostFrames } });
 if (body.bridged) findings.push({ code: "bridged", tone: "info", kind: "quality", params: { count: body.bridged } });
 if (rel.frames && rel.suspectShare > .15) findings.push({ code: "suspect_geometry", tone: "attention", kind: "quality", params: { pct: Math.round(rel.suspectShare * 100) } });
 const weak = metrics.filter(m => m.coverage < .6 && profile.tableMetrics.includes(m.id));
 if (weak.length && coverage >= .6) findings.push({ code: "metrics_unavailable", tone: "attention", kind: "quality", params: { ids: weak.map(m => m.id).join(",") } });
 if (view.kind !== "unknown") findings.push({ code: "view_" + view.kind, tone: "info", kind: "quality" });
 return {
  version: 2, id: input.id ?? crypto.randomUUID(), createdAt: input.createdAt ?? new Date().toISOString(), sport: input.sport, exercise,
  fileName: input.fileName, fileSize: input.fileSize, fileModified: input.fileModified, duration, fps: input.fps, threshold: input.threshold,
  modelId: input.modelId ?? "lite", model: MODEL_NAMES[input.modelId ?? "lite"], source: input.source ?? "file", decode: input.decode,
  samples, metrics, scalars: result.scalars, findings: [...result.findings, ...findings], cycles: result.cycles, segments: result.segments ?? segments,
  coverage, driver: result.driver, view, athlete, exerciseInfo: result.exerciseInfo, reps: result.reps, strikes: result.strikes, rg: result.rg,
  reliability: rel, elapsedMs: input.elapsedMs, interrupted: !!input.interrupted, processedDuration: input.processedDuration
 };
}
/** Re-derive all measurements from stored landmarks (code/threshold updates); identity and source are kept. */
export function refreshReport(report: Report | (Partial<Report> & { samples: Sample[]; sport: Sport })): Report {
 const r = report as Report;
 const modelId: ModelId = r.modelId ?? (/heavy/i.test(r.model ?? "") ? "heavy" : /full/i.test(r.model ?? "") ? "full" : "lite");
 return makeReport({ sport: r.sport, exercise: r.exercise ?? "auto", fileName: r.fileName ?? "", samples: r.samples, fps: r.fps, threshold: r.threshold ?? .65,
  elapsedMs: r.elapsedMs ?? 0, duration: r.duration, interrupted: r.interrupted, modelId, source: r.source ?? "file", decode: r.decode,
  fileSize: r.fileSize, fileModified: r.fileModified, id: r.id, createdAt: r.createdAt, processedDuration: r.processedDuration });
}
