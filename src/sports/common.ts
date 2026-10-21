import type { Body } from "../core/body.ts";
import type { Point } from "../core/geometry.ts";
import type { Metric } from "../types.ts";
import { midpoint } from "../core/geometry.ts";
import { L } from "../core/landmarks.ts";
export type Get = (k: number) => Point | null;
export type Pair = { full: (number | null)[]; obs: (number | null)[] };
/** Same per-frame function on bridged and observed-only coordinates (stats use observed values). */
export function pairOf(b: Body, fn: (p: Get, i: number) => number | null): Pair {
 const run = (src: (Point | null)[][]) => src.map((row, i) => { const v = fn(k => row[k], i); return v !== null && Number.isFinite(v) ? v : null; });
 return { full: run(b.pts), obs: run(b.raw) };
}
export const coverage = (s: (number | null)[]) => s.length ? s.filter(v => v !== null).length / s.length : 0;
export const mid = (p: Get, a: number, b: number) => { const A = p(a), B = p(b); return A && B ? midpoint(A, B) : null; };
export const hipMid = (p: Get) => mid(p, L.lHip, L.rHip);
export const shoulderMid = (p: Get) => mid(p, L.lShoulder, L.rShoulder);
/** First index with time >= t (lower bound). */
export function indexAt(times: number[], t: number): number {
 let lo = 0, hi = times.length;
 while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t - 1e-9) lo = m + 1; else hi = m; }
 return lo;
}
/** First index with time > t. */
export function upperIndex(times: number[], t: number): number {
 let lo = 0, hi = times.length;
 while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] <= t + 1e-9) lo = m + 1; else hi = m; }
 return lo;
}
/** Frame index range [from, to) covering times within [a, b]. */
export const span = (times: number[], a: number, b: number): [number, number] => [indexAt(times, a), upperIndex(times, b)];
export const metricById = (metrics: Metric[], id: string) => metrics.find(m => m.id === id);
export const assessable = (m: Metric | undefined): m is Metric & { value: number; min: number; max: number } => !!m && m.value !== null && m.min !== null && m.max !== null;
export function windowValues(s: (number | null)[], from: number, to: number): number[] {
 const out: number[] = []; for (let i = Math.max(0, from); i < Math.min(s.length, to); i++) { const v = s[i]; if (v !== null) out.push(v); } return out;
}
export const checkOp = (v: number | string, op: string, target: number | string | [number, number] | string[]): boolean => {
 if (op === "in") return (target as string[]).includes(v as string);
 if (op === "==") return v === target;
 const x = v as number;
 if (op === "between") { const [a, b] = target as [number, number]; return x >= a && x <= b; }
 const t = target as number;
 return op === "<" ? x < t : op === ">" ? x > t : op === ">=" ? x >= t : op === "<=" ? x <= t : false;
};
/** qwen36 _near_threshold: within 5% of the threshold is borderline, not a violation. */
export function nearThreshold(v: number, op: string, target: number | [number, number]): boolean {
 if (op === "between") { const [a, b] = target as [number, number], pad = .05 * Math.max(b - a, 1); return v >= a - pad && v <= b + pad; }
 const t = target as number; return Math.abs(v - t) <= .05 * Math.max(Math.abs(t), 1);
}
