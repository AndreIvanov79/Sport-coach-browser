export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function percentile(values: number[], p: number): number {
 const s = [...values].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
 return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export const median = (values: number[]) => percentile(values, .5);
export const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
export function values(series: (number | null)[], from = 0, to = series.length): number[] {
 const out: number[] = []; for (let i = Math.max(0, from); i < Math.min(series.length, to); i++) { const v = series[i]; if (finite(v)) out.push(v); } return out;
}
/** [start, end) index runs where mask is true. */
export function runs(mask: boolean[]): [number, number][] {
 const out: [number, number][] = []; let s = -1;
 for (let i = 0; i <= mask.length; i++) { const on = i < mask.length && mask[i]; if (on && s < 0) s = i; else if (!on && s >= 0) { out.push([s, i]); s = -1; } }
 return out;
}
/** 3-point median; keeps nulls and edges unchanged. Removes single-frame landmark spikes before cycle detection. */
export function median3(series: (number | null)[]): (number | null)[] {
 return series.map((v, i) => {
  if (v === null || i === 0 || i === series.length - 1) return v;
  const a = series[i - 1], b = series[i + 1]; if (a === null || b === null) return v;
  return a + b + v - Math.max(a, b, v) - Math.min(a, b, v);
 });
}
/** Centered moving average over finite values within +-half seconds. */
export function smoothTime(series: (number | null)[], times: number[], half: number): (number | null)[] {
 return series.map((v, i) => {
  if (v === null) return null; let sum = 0, n = 0;
  for (let j = i; j >= 0 && times[i] - times[j] <= half; j--) { const x = series[j]; if (x !== null) { sum += x; n++; } }
  for (let j = i + 1; j < series.length && times[j] - times[i] <= half; j++) { const x = series[j]; if (x !== null) { sum += x; n++; } }
  return sum / n;
 });
}
/** Time derivative (units per second) by central differences over contiguous values. */
export function derivative(series: (number | null)[], times: number[]): (number | null)[] {
 return series.map((v, i) => {
  if (v === null) return null;
  const a = i > 0 ? series[i - 1] : null, b = i < series.length - 1 ? series[i + 1] : null;
  if (a !== null && b !== null && times[i + 1] > times[i - 1]) return (b - a) / (times[i + 1] - times[i - 1]);
  if (b !== null && times[i + 1] > times[i]) return (b - v) / (times[i + 1] - times[i]);
  if (a !== null && times[i] > times[i - 1]) return (v - a) / (times[i] - times[i - 1]);
  return null;
 });
}
/** Rolling percentile over a centered time window; null where no finite neighbours. */
export function rollingPercentile(series: (number | null)[], times: number[], half: number, p: number): (number | null)[] {
 return series.map((_, i) => {
  const w: number[] = [];
  for (let j = i; j >= 0 && times[i] - times[j] <= half; j--) { const x = series[j]; if (x !== null) w.push(x); }
  for (let j = i + 1; j < series.length && times[j] - times[i] <= half; j++) { const x = series[j]; if (x !== null) w.push(x); }
  return w.length ? percentile(w, p) : null;
 });
}
export const round = (v: number | null | undefined, d = 1): number | null => v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;
