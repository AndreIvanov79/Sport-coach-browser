import type { Finding, Report, Scalar } from "../types.ts";
import { t } from "../i18n/index.ts";
import { profiles } from "../profiles.ts";
import { esc, formatTime, formatTimePrecise, icon, num, valueWithUnit } from "./dom.ts";
import { chartLeftPercent, chartSvg, chartTimeAt } from "./chart.ts";
export type ReportHooks = { hasVideo: () => boolean; seek: (time: number) => void; save: () => Promise<void>; pickAthlete: (() => void) | null; attach: () => void; reanalyze: (() => void) | null; json: () => void; csv: () => void };
const exName = (id: string) => t("exn." + id);
/** Localize finding parameters that carry identifiers. */
export function findingParams(r: Report, f: Finding): Record<string, string | number> {
 const p: Record<string, string | number> = { ...(f.params ?? {}) };
 if (typeof p.exercise === "string") p.exercise = exName(p.exercise);
 if (typeof p.detected === "string") p.detected = p.detected ? exName(p.detected) : "—";
 if (typeof p.selected === "string") p.selected = t("ex." + r.sport + "." + p.selected);
 if (typeof p.candidates === "string") p.candidates = p.candidates.split(", ").filter(Boolean).map(exName).join(", ") || "—";
 if (typeof p.metric === "string") p.metric = t("m." + p.metric);
 if (typeof p.ids === "string") p.ids = p.ids.split(",").map(id => t("m." + id)).join(", ");
 if (typeof p.element === "string") p.element = p.element ? t("rg.el." + p.element) : "—";
 if (typeof p.group === "string") p.group = t("rg.group." + p.group);
 if (typeof p.value === "number" && f.code.startsWith("rg_")) p.value = num(p.value, 1);
 return p;
}
export const findingTitle = (r: Report, f: Finding) => f.title && !f.code ? f.title : t("f." + f.code + ".t", findingParams(r, f));
export const findingDetail = (r: Report, f: Finding) => f.detail && !f.code ? f.detail : t("f." + f.code + ".d", findingParams(r, f));
function timeChips(f: Finding, enabled: boolean): string {
 const times = (f.times?.length ? f.times : f.time !== undefined ? [f.time] : []).slice(0, 8);
 return times.length ? "<div class=\"chips\">" + times.map(x => "<button class=\"time-link\" data-time=\"" + x + "\"" + (enabled ? "" : " disabled") + ">" + icon("play", 12) + " " + formatTime(x) + "</button>").join("") + "</div>" : "";
}
function findingHtml(r: Report, f: Finding, video: boolean): string {
 const share = f.total ? "<span class=\"share\">" + t("app.share", { count: f.count ?? 0, total: f.total }) + "</span>" : "";
 return "<article class=\"finding " + f.tone + (f.focus ? " focus" : "") + "\"><span class=\"finding-dot\"></span><div>" + (f.focus ? "<div class=\"focus-label\">" + icon("star", 13) + " " + t("app.focus") + "</div>" : "") +
  "<h4>" + esc(findingTitle(r, f)) + " " + share + "</h4><p>" + esc(findingDetail(r, f)) + "</p>" + timeChips(f, video) + "</div></article>";
}
function findingsPanel(r: Report, video: boolean): string {
 const groups: [string, Finding[]][] = [
  ["faults", r.findings.filter(f => f.kind === "fault")], ["strengths", r.findings.filter(f => f.kind === "strength")],
  ["info", r.findings.filter(f => f.kind === "info" || (!f.kind))], ["quality", r.findings.filter(f => f.kind === "quality")]
 ];
 return "<section class=\"panel findings\"><div class=\"section-heading\"><h3>" + t("report.findings") + "</h3><span class=\"mini muted\">" + t("report.findingsNote") + "</span></div>" +
  groups.filter(([, list]) => list.length).map(([key, list]) => (key === "quality" ? "<details class=\"quality\"><summary>" + t("report.group." + key) + " · " + list.length + "</summary>" : "<div class=\"finding-group\"><div class=\"group-label\">" + t("report.group." + key) + "</div>") +
   list.map(f => findingHtml(r, f, video)).join("") + (key === "quality" ? "</details>" : "</div>")).join("") + "</section>";
}
function scalarRows(list: Scalar[]): string {
 const shown = list.filter(s => s.value !== null), hidden = list.filter(s => s.value === null);
 const row = (s: Scalar) => "<div class=\"metric-row\"><span>" + esc(t("s." + s.id)) + "<small>" + esc(t("sd." + s.id)) + "</small></span><span><strong>" + valueWithUnit(s.value, s.unit, s.digits ?? 1) + "</strong>" + (s.reason ? "<small>" + esc(t("reason." + s.reason)) + "</small>" : "") + "</span></div>";
 return shown.map(row).join("") + (hidden.length ? "<details class=\"unassessed\"><summary>" + t("report.notAssessable", { count: hidden.length }) + "</summary>" + hidden.map(row).join("") + "</details>" : "");
}
function detailTable(r: Report, video: boolean): string {
 const tl = (time: number) => "<button class=\"time-link\" data-time=\"" + time + "\"" + (video ? "" : " disabled") + ">" + formatTimePrecise(time) + "</button>";
 const deg = (v: number | null) => valueWithUnit(v, "deg", 0), sec = (v: number | null) => valueWithUnit(v, "s", 2);
 if (r.reps?.length) return "<section class=\"panel table-panel\"><div class=\"section-heading\"><h3>" + t("report.reps") + "</h3><span class=\"mini muted\">" + t("report.repsNote") + "</span></div><div class=\"scroll\"><table><thead><tr><th>#</th><th>" + t("col.time") + "</th><th>" + t("col.duration") + "</th><th>" + t("col.tempo") + "</th><th>" + t("col.range") + "</th><th>" + t("col.asym") + "</th><th>" + t("col.sag") + "</th><th>" + t("col.elbow") + "</th></tr></thead><tbody>" +
  r.reps.map(x => "<tr><td>" + x.index + "</td><td>" + tl(x.peak) + "</td><td>" + sec(x.duration) + "</td><td>" + [x.toward, x.pause, x.away].map(v => num(v, 2)).join(" / ") + "</td><td>" + deg(x.driverMin) + "–" + deg(x.driverMax) + "</td><td>" + deg(x.asymmetry) + "</td><td>" + valueWithUnit(x.hipSag, "torso", 2) + "</td><td>" + deg(x.elbowMin) + "–" + deg(x.elbowMax) + "</td></tr>").join("") + "</tbody></table></div></section>";
 if (r.strikes?.length) return "<section class=\"panel table-panel\"><div class=\"section-heading\"><h3>" + t("report.strikes") + "</h3><span class=\"mini muted\">" + t("report.strikesNote") + "</span></div><div class=\"scroll\"><table><thead><tr><th>#</th><th>" + t("col.time") + "</th><th>" + t("col.limb") + "</th><th>" + t("col.extension") + "</th><th>" + t("col.speed") + "</th><th>" + t("col.guard") + "</th><th>" + t("col.rotation") + "</th><th>" + t("col.standing") + "</th></tr></thead><tbody>" +
  r.strikes.map(x => "<tr><td>" + x.index + "</td><td>" + tl(x.time) + "</td><td>" + t("side." + x.side) + " · " + t("limb." + x.limb) + "</td><td>" + deg(x.extension) + "</td><td>" + valueWithUnit(x.velocity, "dps", 0) + "</td><td class=\"" + (x.guard !== null && x.guard < -.3 ? "low" : "") + "\">" + valueWithUnit(x.guard, "torso", 2) + "</td><td>" + deg(x.rotation) + "</td><td>" + deg(x.standingKnee) + "</td></tr>").join("") + "</tbody></table></div></section>";
 if (r.rg?.events.length) return "<section class=\"panel table-panel\"><div class=\"section-heading\"><h3>" + t("report.events") + "</h3><span class=\"mini muted\">" + t("report.eventsNote") + "</span></div><div class=\"scroll\"><table><thead><tr><th>#</th><th>" + t("col.time") + "</th><th>" + t("col.action") + "</th><th>" + t("col.element") + "</th><th>FIG</th><th>" + t("col.shape") + "</th><th>" + t("col.holdTurns") + "</th><th>" + t("col.deductions") + "</th></tr></thead><tbody>" +
  r.rg.events.map(e => "<tr><td>" + e.id + "</td><td>" + tl(e.peak) + "</td><td>" + t("rg.action." + e.action) + "</td><td>" + esc(e.element ? t("rg.el." + e.element) : "—") + "</td><td>" + (e.family ? esc(e.family) + " · " + num(e.baseValue, 1) : "—") + "</td><td>" +
   [["split_deg", "split"], ["free_leg_lift_deg", "lift"], ["trunk_lean_deg", "lean"]].map(([k, l]) => t("abbr." + l) + " " + deg(e.props[k] ?? null)).join(" · ") + "</td><td>" + (e.hold !== null ? sec(e.hold) + (e.holdBounded ? "" : "*") : e.turns ? num(e.turns, 1) + " " + t("u.turns") : "—") + "</td><td>" +
   (e.deductions.length ? e.deductions.map(d => "−" + num(d.value, 1) + (d.status === "review" ? " ?" : "")).join(", ") : "—") + "</td></tr>").join("") + "</tbody></table></div><p class=\"mini muted\">" + t("report.eventsFoot") + "</p></section>";
 return "";
}
function rgScorePanel(r: Report): string {
 if (!r.rg) return "";
 const s = r.rg.score;
 const items = s.d.items.map(i => "<li>" + esc(t("rg.el." + i.element)) + " <span class=\"muted\">" + esc(i.family) + "</span> <b>" + num(i.value, 1) + "</b></li>").join("");
 const ded = s.e.deductions.map(d => "<li class=\"" + d.status + "\">" + (d.time !== undefined ? formatTime(d.time) + " · " : "") + esc(t("rg.ded." + d.code, { ...(d.params ?? {}) })) + " <b>−" + num(d.value, 1) + "</b>" + (d.status === "review" ? " <span class=\"tag\">" + t("rg.review") + "</span>" : "") + "</li>").join("");
 return "<section class=\"panel score-panel\"><div class=\"section-heading\"><h3>" + t("rg.score.title") + "</h3><span class=\"mini muted\">" + t("rg.mode." + s.mode) + "</span></div><div class=\"score-grid\">" +
  "<div class=\"score-card\"><span>D · " + t("rg.score.d") + "</span><strong>" + num(s.d.value, 1) + (s.d.penalty ? "<small> −" + num(s.d.penalty, 1) + "</small>" : "") + "</strong><ul>" + (items || "<li class=\"muted\">" + t("rg.score.noItems") + "</li>") + (s.d.missingGroups.length ? "<li class=\"attention\">" + t("rg.score.missing", { groups: s.d.missingGroups.map(g => t("rg.group." + g)).join(", "), value: num(s.d.penalty, 1) }) + "</li>" : "") + "</ul></div>" +
  "<div class=\"score-card\"><span>E · " + t("rg.score.e") + "</span><strong>≤ " + num(s.e.upper, 2) + "</strong><ul>" + (ded || "<li class=\"muted\">" + t("rg.score.noDed") + "</li>") + "</ul>" + (s.e.review ? "<p class=\"mini muted\">" + t("rg.score.review", { value: num(s.e.review, 1) }) + "</p>" : "") + "</div>" +
  "<div class=\"score-card\"><span>A · " + t("rg.score.a") + "</span><strong>—</strong><p class=\"mini muted\">" + t("rg.score.aNote") + "</p></div></div>" +
  "<p class=\"mini muted\">" + t("rg.score.final") + "</p><details class=\"unassessed\"><summary>" + t("rg.score.notAssessed") + "</summary><ul>" + s.notAssessed.map(k => "<li>" + t("rg.na." + k) + "</li>").join("") + "</ul></details></section>";
}
function summaryCards(r: Report): string {
 const card = (label: string, value: string, small: string, note: string) => "<div class=\"summary-card\"><span>" + label + "</span><strong>" + value + "<small>" + small + "</small></strong><p>" + note + "</p></div>";
 const cards = [card(t("sum.coverage"), String(Math.round(r.coverage * 100)), "%", t("sum.coverageNote"))];
 if (r.sport === "fitness") {
  cards.push(card(t("sum.reps"), r.driver ? String(r.cycles.length) : "—", r.driver ? t("sum.repsUnit") : "", r.driver ? t("sum.repsNote", { metric: t("m." + r.driver) }) : t("sum.noDriver")));
  const ex = r.exerciseInfo;
  cards.push(card(t("sum.exercise"), ex?.detected ? esc(exName(ex.detected)) : "—", "", ex ? t("exstatus." + ex.status) : ""));
 } else if (r.sport === "boxing") {
  const s = r.strikes ?? [];
  cards.push(card(t("sum.strikes"), String(s.length), "", t("sum.strikesNote", { left: s.filter(x => x.side === "l").length, right: s.filter(x => x.side === "r").length })));
  const g = r.scalars.find(x => x.id === "guardAtStrike");
  cards.push(card(t("sum.guard"), valueWithUnit(g?.value ?? null, "torso", 2), "", t("sum.guardNote")));
 } else if (r.rg) {
  cards.push(card(t("sum.elements"), String(r.rg.events.length), "", t("sum.elementsNote")));
  cards.push(card(t("sum.dEstimate"), num(r.rg.score.d.value, 1), "", t("sum.dNote")));
 }
 cards.push(card(t("sum.processing"), num(r.elapsedMs / 1000, 1), t("u.s"), t("sum.processingNote", { fps: r.fps, model: r.modelId ?? "lite", decode: t("decode." + (r.source === "live" ? "live" : r.decode ?? "seek")) })));
 return "<div class=\"summary-grid\">" + cards.join("") + "</div>";
}
function exercisePanel(r: Report): string {
 const ex = r.exerciseInfo; if (!ex || !ex.checks.length) return "";
 return "<details class=\"panel details\"><summary>" + t("report.checks") + "</summary><ul class=\"checks\">" + ex.checks.map(c => "<li class=\"" + c.result + "\">" + esc(c.check) + (c.measured !== undefined ? " → <b>" + esc(c.measured) + "</b>" : "") + " · " + t("check." + c.result) + "</li>").join("") + "</ul><p class=\"mini muted\">" + t("report.checksNote") + "</p></details>";
}
export function renderReport(el: HTMLElement, r: Report, hooks: ReportHooks): { playhead: (time: number) => void } {
 const p = profiles[r.sport], video = hooks.hasVideo(), times = r.samples.map(s => s.time);
 const movement = t("ex." + r.sport + "." + r.exercise);
 const metricRows = r.metrics.filter(m => p.tableMetrics.includes(m.id)).map(m => {
  const d = m.unit === "deg" ? 0 : 2;
  return "<div class=\"metric-row\"><span>" + esc(t("m." + m.id)) + "</span><span><strong>" + valueWithUnit(m.value, m.unit, d) + "</strong><small>" + (m.min === null ? t("report.noData") : valueWithUnit(m.min, m.unit, d) + " – " + valueWithUnit(m.max, m.unit, d)) + "</small></span><span class=\"" + (m.coverage < .6 ? "low" : "") + "\">" + Math.round(m.coverage * 100) + "%</span></div>";
 }).join("");
 el.innerHTML =
  "<div class=\"report-heading\"><div><div class=\"eyebrow\">" + t(r.interrupted ? "report.partial" : "report.done") + "</div><h2>" + t("report.title") + "</h2><p class=\"muted\">" + esc(r.fileName) + " · " + esc(movement) + " · " + formatTime(r.duration) + " · " + t("report.frames", { count: r.samples.length }) + "</p></div><div class=\"report-actions\">" +
  "<button class=\"small-button\" id=\"save-report\">" + icon("history", 16) + " " + t("app.save") + "</button><button class=\"small-button\" id=\"export-json\">JSON</button><button class=\"small-button\" id=\"export-csv\">CSV</button><button class=\"small-button\" id=\"print-report\">" + t("app.print") + "</button>" +
  (hooks.pickAthlete ? "<button class=\"small-button\" id=\"pick-athlete\">" + icon("user", 16) + " " + t("app.pickAthlete") + "</button>" : "") +
  (!video ? "<button class=\"small-button\" id=\"attach-video\">" + icon("attach", 16) + " " + t("app.attach") + "</button>" : "") +
  (hooks.reanalyze ? "<button class=\"small-button\" id=\"reanalyze\">" + icon("refresh", 16) + " " + t("app.reanalyze") + "</button>" : "") + "</div></div>" +
  summaryCards(r) +
  "<div class=\"notice\">" + icon("help", 19) + "<p>" + esc(t("sport." + r.sport + ".scope")) + " " + t("report.scopeTail", { pct: Math.round(r.threshold * 100) }) + "</p></div>" +
  rgScorePanel(r) +
  "<div class=\"report-grid\">" + findingsPanel(r, video) + "<section class=\"panel\"><div class=\"section-heading\"><h3>" + t("report.technique") + "</h3><span class=\"mini muted\">" + t("report.techniqueNote") + "</span></div><div class=\"metrics-table\">" + scalarRows(r.scalars) + "</div></section></div>" +
  detailTable(r, video) +
  "<section class=\"panel graph-panel\"><div class=\"section-heading\"><h3>" + t("report.chart") + "</h3><select id=\"chart-metric\" aria-label=\"" + t("report.chart") + "\">" + r.metrics.map(m => "<option value=\"" + m.id + "\"" + (m.id === r.driver ? " selected" : "") + ">" + esc(t("m." + m.id)) + "</option>").join("") + "</select></div><p class=\"mini muted\" id=\"chart-description\"></p><div class=\"chart-wrap\" id=\"chart\"></div><p class=\"mini muted\">" + t("report.chartNote") + "</p></section>" +
  "<section class=\"panel\"><div class=\"section-heading\"><h3>" + t("report.metrics") + "</h3><span class=\"mini muted\">" + t("report.metricsNote") + "</span></div><div class=\"metrics-table\"><div class=\"metric-row table-head\"><span>" + t("col.metric") + "</span><span>" + t("col.value") + "</span><span>" + t("col.coverage") + "</span></div>" + metricRows + "</div></section>" +
  exercisePanel(r) +
  "<details class=\"panel details\"><summary>" + t("report.method") + "</summary><p>" + t("method.p1") + "</p><p>" + t("method.p2") + "</p><p>" + t("method.p3") + "</p><p>" + t("method.p4") + "</p></details>";
 let playheadEl: HTMLElement | null = null, chartDuration = r.duration || times[times.length - 1] || 1;
 const graph = () => {
  const id = (el.querySelector("#chart-metric") as HTMLSelectElement).value, m = r.metrics.find(x => x.id === id)!;
  const host = el.querySelector("#chart") as HTMLElement;
  const svg = chartSvg(m.series, times, t("m." + id), p.accent, { duration: chartDuration, bands: r.cycles.map(c => ({ start: c.start, end: c.end })) });
  host.innerHTML = svg ? svg + "<div class=\"playhead\"></div>" : "<div class=\"empty-chart\">" + t("report.noChart") + "</div>";
  playheadEl = host.querySelector(".playhead");
  (el.querySelector("#chart-description") as HTMLElement).textContent = t("md." + id) !== "md." + id ? t("md." + id) : t(m.unit === "deg" ? "md.deg" : "md.torso");
 };
 (el.querySelector("#chart-metric") as HTMLSelectElement).onchange = graph; graph();
 const chartEl = el.querySelector("#chart") as HTMLElement;
 chartEl.onclick = event => { if (video) hooks.seek(chartTimeAt(chartEl, event.clientX, chartDuration)); };
 (el.querySelector("#save-report") as HTMLButtonElement).onclick = async () => { const b = el.querySelector("#save-report") as HTMLButtonElement; b.disabled = true; try { await hooks.save(); b.textContent = t("app.saved"); } catch { b.disabled = false; } };
 (el.querySelector("#export-json") as HTMLButtonElement).onclick = hooks.json;
 (el.querySelector("#export-csv") as HTMLButtonElement).onclick = hooks.csv;
 (el.querySelector("#print-report") as HTMLButtonElement).onclick = () => window.print();
 const pick = el.querySelector("#pick-athlete") as HTMLButtonElement | null; if (pick && hooks.pickAthlete) pick.onclick = hooks.pickAthlete;
 const attach = el.querySelector("#attach-video") as HTMLButtonElement | null; if (attach) attach.onclick = hooks.attach;
 const re = el.querySelector("#reanalyze") as HTMLButtonElement | null; if (re && hooks.reanalyze) re.onclick = hooks.reanalyze;
 el.querySelectorAll<HTMLButtonElement>("[data-time]").forEach(b => b.onclick = () => { if (hooks.hasVideo()) hooks.seek(Number(b.dataset.time)); });
 return { playhead: (time: number) => { if (playheadEl) playheadEl.style.left = chartLeftPercent(time, chartDuration) + "%"; } };
}
