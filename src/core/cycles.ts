import type { Cycle, Metric } from '../types.ts';
import { median3, percentile } from './stats.ts';
export const MIN_ROM = 25, HYSTERESIS = .3, MAX_STEP_S = .35, MIN_CYCLE_S = .2;
/**
 * Complete observed joint cycles: baseline -> opposite phase -> baseline.
 * Short dropouts are bridged upstream (body.ts); remaining gaps and time jumps reset the phase.
 * Non-inverted baseline is the HIGH angle (squat starts extended); inverted is the LOW angle (press starts flexed).
 */
export function detectCycles(input: (number | null)[], times: number[], inverted = false): Cycle[] {
 if (input.length !== times.length) return [];
 const values = median3(input);
 const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
 if (finite.length < 5) return [];
 const lo = percentile(finite, .02), hi = percentile(finite, .98), rom = hi - lo;
 if (rom < MIN_ROM) return [];
 const low = lo + HYSTERESIS * rom, high = hi - HYSTERESIS * rom, result: Cycle[] = [];
 let start = -1, peak = -1, crossed = false;
 for (let i = 0; i < values.length; i++) {
  const v = values[i];
  if (v === null || !Number.isFinite(v) || !Number.isFinite(times[i]) || (i > 0 && (times[i] <= times[i - 1] || times[i] - times[i - 1] > MAX_STEP_S))) { start = -1; peak = -1; crossed = false; if (v === null) continue; }
  const baseline = inverted ? v! <= low : v! >= high, extreme = inverted ? v! >= high : v! <= low;
  if (start < 0) { if (baseline) { start = i; peak = i; } continue; }
  if (peak < 0 || (inverted ? v! > values[peak]! : v! < values[peak]!)) peak = i;
  if (extreme) crossed = true;
  if (baseline) {
   if (crossed && times[i] - times[start] >= MIN_CYCLE_S) result.push({ start: times[start], peak: times[peak], end: times[i] });
   start = i; peak = i; crossed = false;
  }
 }
 return result;
}
/** Starting phase decides the baseline when the exercise does not prescribe it. */
export function inferInverted(values: (number | null)[]): boolean {
 const finite = values.filter((v): v is number => v !== null);
 if (finite.length < 5) return false;
 const lo = percentile(finite, .02), hi = percentile(finite, .98), head = finite.slice(0, Math.max(3, Math.round(finite.length * .05)));
 const startVal = percentile(head, .5);
 return startVal - lo < hi - startVal;
}
export const DRIVER_GROUPS: Record<string, [string, string]> = {
 knee: ['leftKnee', 'rightKnee'], elbow: ['leftElbow', 'rightElbow'], hip: ['leftHip', 'rightHip'], shoulder: ['leftShoulder', 'rightShoulder']
};
export const groupOf = (metricId: string) => Object.keys(DRIVER_GROUPS).find(g => DRIVER_GROUPS[g].includes(metricId)) ?? null;
const rom = (m: Metric | undefined) => m && m.min !== null && m.max !== null ? m.max - m.min : -1;
/** qwen36 detect_gym_driver: group with the largest assessable ROM (>= 25 deg), then the side with the larger ROM. */
export function pickDriver(metrics: Metric[], groups: string[] = Object.keys(DRIVER_GROUPS)): { group: string; metric: Metric; rom: number } | null {
 let best: { group: string; metric: Metric; rom: number } | null = null;
 for (const g of groups) for (const id of DRIVER_GROUPS[g] ?? []) {
  const m = metrics.find(x => x.id === id), r = rom(m);
  if (m && r >= MIN_ROM && (!best || r > best.rom)) best = { group: g, metric: m, rom: r };
 }
 return best;
}
