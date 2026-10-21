import { esc, formatTime, num } from "./dom.ts";
export const CHART = { x0: 42, x1: 732, y0: 24, y1: 164, w: 760, h: 200 };
export type Band = { start: number; end: number; kind?: string };
/** Gaps stay gaps; bands mark cycles/strikes/events; the playhead is a separate element. */
export function chartSvg(series: (number | null)[], times: number[], label: string, accent: string, opts: { duration?: number; bands?: Band[]; digits?: number } = {}): string {
 const finite = series.filter((v): v is number => v !== null);
 if (!finite.length) return "";
 let minimum = Math.min(...finite), maximum = Math.max(...finite);
 if (maximum - minimum < 1e-8) { const pad = Math.abs(maximum) > 2 ? 5 : .05; minimum -= pad; maximum += pad; }
 const rough = (maximum - minimum) / 3, magnitude = 10 ** Math.floor(Math.log10(rough)), factor = rough / magnitude;
 const tick = magnitude * (factor <= 2 ? 2 : factor <= 5 ? 5 : 10);
 const low = Math.floor(minimum / tick) * tick, high = Math.max(low + tick, Math.ceil(maximum / tick) * tick), duration = opts.duration || times[times.length - 1] || 1;
 const decimals = Math.max(0, Math.min(4, -Math.floor(Math.log10(tick))));
 const X = (t: number) => CHART.x0 + t / duration * (CHART.x1 - CHART.x0), Y = (v: number) => CHART.y1 - (v - low) / (high - low) * (CHART.y1 - CHART.y0);
 let path = "", pen = false; const step = Math.max(1, Math.ceil(series.length / 900));
 for (let i = 0; i < series.length; i++) {
  const v = series[i]; if (v === null) { pen = false; continue; }
  if (i % step !== 0 && i !== series.length - 1 && series[i + 1] !== null) continue;
  path += (pen ? "L" : "M") + X(times[i]).toFixed(1) + "," + Y(v).toFixed(1); pen = true;
 }
 const bands = (opts.bands ?? []).map(b => "<rect x=\"" + X(b.start).toFixed(1) + "\" y=\"" + CHART.y0 + "\" width=\"" + Math.max(1.5, X(b.end) - X(b.start)).toFixed(1) + "\" height=\"" + (CHART.y1 - CHART.y0) + "\" fill=\"" + accent + "\" opacity=\".12\"/>").join("");
 return "<svg viewBox=\"0 0 " + CHART.w + " " + CHART.h + "\" role=\"img\" aria-label=\"" + esc(label) + "\">" + bands +
  "<path d=\"M42 24H732M42 94H732M42 164H732\" stroke=\"#2c3439\" stroke-dasharray=\"3 6\"/><g fill=\"#93a0a8\" font-size=\"11\" font-family=\"monospace\"><text x=\"0\" y=\"28\">" + num(high, decimals) + "</text><text x=\"0\" y=\"168\">" + num(low, decimals) + "</text><text x=\"42\" y=\"190\">0:00</text><text x=\"700\" y=\"190\">" + formatTime(duration) + "</text></g>" +
  "<path d=\"" + path + "\" fill=\"none\" stroke=\"" + accent + "\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/></svg>";
}
export const chartTimeAt = (el: HTMLElement, clientX: number, duration: number) => {
 const r = el.getBoundingClientRect(), x = (clientX - r.left) / r.width * CHART.w;
 return Math.max(0, Math.min(duration, (x - CHART.x0) / (CHART.x1 - CHART.x0) * duration));
};
export const chartLeftPercent = (t: number, duration: number) => (CHART.x0 + Math.max(0, Math.min(1, t / (duration || 1))) * (CHART.x1 - CHART.x0)) / CHART.w * 100;
/** Sparkline-like trend across saved sessions. */
export function trendSvg(points: { label: string; value: number }[], accent: string): string {
 if (points.length < 2) return "";
 const vs = points.map(p => p.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || Math.abs(hi) || 1;
 const X = (i: number) => 42 + i / (points.length - 1) * 690, Y = (v: number) => 150 - (v - lo) / span * 110;
 const d = points.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(p.value).toFixed(1)).join("");
 return "<svg viewBox=\"0 0 760 190\" role=\"img\"><path d=\"M42 40H732M42 150H732\" stroke=\"#2c3439\" stroke-dasharray=\"3 6\"/><path d=\"" + d + "\" fill=\"none\" stroke=\"" + accent + "\" stroke-width=\"2.5\"/>" +
  points.map((p, i) => "<circle cx=\"" + X(i).toFixed(1) + "\" cy=\"" + Y(p.value).toFixed(1) + "\" r=\"4\" fill=\"" + accent + "\"><title>" + esc(p.label) + ": " + num(p.value, 2) + "</title></circle>").join("") +
  "<g fill=\"#93a0a8\" font-size=\"11\" font-family=\"monospace\"><text x=\"0\" y=\"44\">" + num(hi, 1) + "</text><text x=\"0\" y=\"154\">" + num(lo, 1) + "</text><text x=\"42\" y=\"180\">" + esc(points[0].label) + "</text><text x=\"732\" y=\"180\" text-anchor=\"end\">" + esc(points[points.length - 1].label) + "</text></g></svg>";
}
