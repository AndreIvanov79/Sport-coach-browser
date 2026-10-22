import { getLang, t } from "../i18n/index.ts";
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
export const esc = escapeHtml;
export function formatTime(seconds: number): string { if (!Number.isFinite(seconds)) return "—"; const s = Math.max(0, seconds); return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }
export function formatTimePrecise(seconds: number): string { if (!Number.isFinite(seconds)) return "—"; return Math.floor(seconds / 60) + ":" + (seconds % 60).toFixed(1).padStart(4, "0"); }
export function num(v: number | null | undefined, digits = 1): string {
 if (v === null || v === undefined || !Number.isFinite(v)) return "—";
 return new Intl.NumberFormat(getLang(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
export function unit(u: string): string { const k = "u." + u; const s = t(k); return s === k ? u : s; }
export function valueWithUnit(v: number | null | undefined, u: string, digits = 1): string {
 if (v === null || v === undefined || !Number.isFinite(v)) return "—";
 const us = unit(u); return u === "deg" || u === "pct" ? num(v, digits) + us : num(v, digits) + (us ? " " + us : "");
}
export function download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
export function toast(message: string): void { const el = $("toast"); el.textContent = message; el.hidden = false; clearTimeout((toast as unknown as { timer: number }).timer); (toast as unknown as { timer: number }).timer = window.setTimeout(() => el.hidden = true, 4500); }
const ICONS: Record<string, string> = {
 upload: "<path d=\"M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4\"/>", camera: "<rect x=\"3\" y=\"6\" width=\"13\" height=\"13\" rx=\"3\"/><path d=\"m16 10 5-3v12l-5-3\"/>",
 play: "<path d=\"m9 5 11 7-11 7Z\"/>", history: "<path d=\"M3 12a9 9 0 1 0 3-7M3 3v5h5m4-1v6l4 2\"/>", shield: "<path d=\"m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z\"/><path d=\"m8 12 3 3 5-6\"/>",
 chart: "<path d=\"M4 4v16h17M7 15l4-5 4 3 5-8\"/>", arrow: "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>", close: "<path d=\"m6 6 12 12M6 18 18 6\"/>", check: "<path d=\"m5 12 4 4L19 6\"/>",
 settings: "<path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"3\" fill=\"currentColor\"/><circle cx=\"16\" cy=\"17\" r=\"3\" fill=\"currentColor\"/>", download: "<path d=\"M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4\"/>",
 help: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01\"/>", layers: "<path d=\"m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5\"/>",
 trash: "<path d=\"M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7\"/>", live: "<circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"currentColor\"/><path d=\"M6.3 6.3a8 8 0 0 0 0 11.4m11.4 0a8 8 0 0 0 0-11.4M3.5 3.5a12 12 0 0 0 0 17m17 0a12 12 0 0 0 0-17\"/>",
 user: "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c1-4 4-6 8-6s7 2 8 6\"/>", compare: "<path d=\"M8 3v18M16 3v18M3 8h5m8 0h5M3 16h5m8 0h5\"/>", import: "<path d=\"M12 21V9m-5 5 5-5 5 5M4 7V3h16v4\"/>",
 attach: "<path d=\"m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7\"/>", prev: "<path d=\"M18 6 9 12l9 6ZM6 6v12\"/>", next: "<path d=\"m6 6 9 6-9 6ZM18 6v12\"/>",
 volume: "<path d=\"M4 9h4l5-4v14l-5-4H4Z\"/><path d=\"M17 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12\"/>", stop: "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/>", refresh: "<path d=\"M20 11a8 8 0 1 0-2 6m2-12v6h-6\"/>",
 expand: "<path d=\"M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5\"/>", shrink: "<path d=\"M9 4v5H4m11-5v5h5m0 6h-5v5m-6 0v-5H4\"/>",
 globe: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\"/>", star: "<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z\"/>"
};
export const icon = (name: string, size = 20) => "<svg width=\"" + size + "\" height=\"" + size + "\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">" + (ICONS[name] ?? "") + "</svg>";
