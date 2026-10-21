import type { Body } from './body.ts';
import type { Finding, Metric, Profile, Sample, Scalar, Segment, View, Cycle, ExerciseInfo, Rep, Strike, RgEvent, RgScore } from '../types.ts';
// qwen36 *_findings.py selection rules: a fault is reported only when it is systematic
// (>= MIN_COUNT occurrences AND >= MIN_SHARE of the assessable ones); ranked by severity,
// then share; at most 3 faults and 3 strengths; the focus is the top fault.
export const MIN_COUNT = 2, MIN_SHARE = .3, STRENGTH_SHARE = .7;
export type SportContext = { body: Body; metrics: Metric[]; exercise: string; profile: Profile; view: View; segments: Segment[]; duration: number; samples: Sample[] };
export type SportResult = {
 scalars: Scalar[]; findings: Finding[]; cycles: Cycle[]; driver: string | null; exerciseInfo?: ExerciseInfo;
 reps?: Rep[]; strikes?: Strike[]; rg?: { events: RgEvent[]; score: RgScore }; segments?: Segment[];
};
export type Hit = { time: number; value: number };
export function systematicFault(code: string, severity: number, hits: Hit[], total: number, params: Record<string, number | string> = {}, minCount = MIN_COUNT): Finding | null {
 if (hits.length < minCount || !total || hits.length / total < MIN_SHARE) return null;
 return { code, tone: 'attention', kind: 'fault', severity, count: hits.length, total, times: hits.map(h => h.time), time: hits[0].time, params };
}
export function consistentStrength(code: string, hits: Hit[], total: number, params: Record<string, number | string> = {}): Finding | null {
 if (hits.length < Math.max(MIN_COUNT, Math.floor(STRENGTH_SHARE * total)) || !total) return null;
 return { code, tone: 'good', kind: 'strength', count: hits.length, total, times: hits.map(h => h.time), time: hits[0].time, params };
}
export function rank(findings: (Finding | null)[]): Finding[] {
 const list = findings.filter((f): f is Finding => !!f);
 const share = (f: Finding) => f.total ? (f.count ?? 0) / f.total : 0;
 const faults = list.filter(f => f.kind === 'fault').sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || share(b) - share(a)).slice(0, 3);
 const strengths = list.filter(f => f.kind === 'strength').sort((a, b) => share(b) - share(a) || (b.count ?? 0) - (a.count ?? 0)).slice(0, 3);
 if (faults[0]) faults[0] = { ...faults[0], focus: true };
 return [...faults, ...strengths, ...list.filter(f => f.kind !== 'fault' && f.kind !== 'strength')];
}
export const scalar = (id: string, value: number | null, unit: string, digits = 1, extra: Partial<Scalar> = {}): Scalar => ({ id, value: value !== null && Number.isFinite(value) ? value : null, unit, digits, ...extra });
