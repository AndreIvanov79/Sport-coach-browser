import type { Report, ReportSummary, Sport } from "../types.ts";
import { getLang, t } from "../i18n/index.ts";
import { deleteReport, listSummaries, loadReport, saveReport } from "../storage.ts";
import { refreshReport } from "../core/report.ts";
import { esc, formatTime, icon, num, toast } from "./dom.ts";
import { trendSvg } from "./chart.ts";
export type HistoryHooks = { open: (report: Report) => void; dialog: (html: string) => void; accent: string; busy: () => boolean };
const keyLabel = (k: string) => k.startsWith("s.") ? t("s." + k.slice(2)) : t("m." + k.slice(2));
export function validateImport(data: unknown, sport: Sport): Report {
 const r = data as Report;
 if (!r || typeof r !== "object" || !Array.isArray(r.samples) || typeof r.duration !== "number") throw new Error(t("history.importInvalid"));
 if (r.sport !== sport) throw new Error(t("history.importSport", { sport: t("sport." + r.sport + ".name") }));
 for (const s of r.samples.slice(0, 50)) if (typeof s.time !== "number" || !Array.isArray(s.landmarks)) throw new Error(t("history.importInvalid"));
 return refreshReport({ ...r, samples: r.samples.map(s => ({ time: s.time, width: s.width, height: s.height, landmarks: s.landmarks, ...(s.reason ? { reason: s.reason } : {}) })) });
}
export async function renderHistory(el: HTMLElement, sport: Sport, hooks: HistoryHooks): Promise<void> {
 el.innerHTML = "<p class=\"muted\">" + t("history.loading") + "</p>";
 let list: ReportSummary[];
 try { list = await listSummaries(sport); } catch { el.innerHTML = "<div class=\"notice\">" + t("history.unavailable") + "</div>"; return; }
 const keys = [...new Set(list.flatMap(s => Object.entries(s.key).filter(([, v]) => v !== null).map(([k]) => k)))].sort((a, b) => (a[0] === "s" ? 0 : 1) - (b[0] === "s" ? 0 : 1) || keyLabel(a).localeCompare(keyLabel(b)));
 const selected = new Set<string>();
 const date = (iso: string) => new Date(iso).toLocaleString(getLang());
 el.innerHTML = "<div class=\"history-tools\"><button class=\"small-button\" id=\"import-json\">" + icon("import", 16) + " " + t("history.import") + "</button><input type=\"file\" id=\"import-input\" accept=\"application/json,.json\" hidden><button class=\"small-button\" id=\"compare\" disabled>" + icon("compare", 16) + " " + t("history.compare") + "</button></div>" +
  (list.length >= 2 && keys.length ? "<section class=\"panel trend-panel\"><div class=\"section-heading\"><h3>" + t("history.trend") + "</h3><select id=\"trend-key\">" + keys.map(k => "<option value=\"" + k + "\">" + esc(keyLabel(k)) + "</option>").join("") + "</select></div><div id=\"trend\"></div><p class=\"mini muted\">" + t("history.trendNote") + "</p></section>" : "") +
  (list.length ? list.map(s => "<article class=\"history-card\"><label class=\"pick\"><input type=\"checkbox\" data-pick=\"" + s.id + "\" aria-label=\"" + t("history.select") + "\"></label><div class=\"history-icon\">" + icon("chart", 24) + "</div><div><h3>" + esc(s.fileName) + "</h3><p>" + date(s.createdAt) + " · " + formatTime(s.duration) + " · " + t("history.coverage", { pct: Math.round(s.coverage * 100) }) +
   (s.detected ? " · " + esc(t("exn." + s.detected)) : s.exercise !== "auto" ? " · " + esc(t("ex." + sport + "." + s.exercise)) : "") + (s.count !== null ? " · " + t("history.count." + sport, { count: s.count }) : "") + "</p></div><button class=\"small-button\" data-open=\"" + s.id + "\">" + t("app.open") + "</button><button class=\"icon-button\" data-delete=\"" + s.id + "\" aria-label=\"" + t("history.delete") + "\">" + icon("trash", 18) + "</button></article>").join("")
   : "<div class=\"empty-state\">" + icon("history", 40) + "<h2>" + t("history.emptyTitle") + "</h2><p>" + t("history.emptyText") + "</p></div>");
 const trend = () => {
  const key = (el.querySelector("#trend-key") as HTMLSelectElement | null)?.value; if (!key) return;
  const pts = [...list].reverse().filter(s => s.key[key] !== null && s.key[key] !== undefined).map(s => ({ label: new Date(s.createdAt).toLocaleDateString(getLang()), value: s.key[key] as number }));
  (el.querySelector("#trend") as HTMLElement).innerHTML = trendSvg(pts, hooks.accent) || "<div class=\"empty-chart\">" + t("history.trendEmpty") + "</div>";
 };
 const tk = el.querySelector("#trend-key") as HTMLSelectElement | null; if (tk) { tk.onchange = trend; trend(); }
 el.querySelectorAll<HTMLInputElement>("[data-pick]").forEach(cb => cb.onchange = () => {
  if (cb.checked) selected.add(cb.dataset.pick!); else selected.delete(cb.dataset.pick!);
  if (selected.size > 2) { const first = [...selected][0]; selected.delete(first); const other = el.querySelector<HTMLInputElement>("[data-pick=\"" + first + "\"]"); if (other) other.checked = false; }
  (el.querySelector("#compare") as HTMLButtonElement).disabled = selected.size !== 2;
 });
 (el.querySelector("#compare") as HTMLButtonElement).onclick = () => {
  const [a, b] = [...selected].map(id => list.find(s => s.id === id)!).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const shared = keys.filter(k => a.key[k] !== null && a.key[k] !== undefined && b.key[k] !== null && b.key[k] !== undefined);
  hooks.dialog("<div class=\"eyebrow\">" + t("history.compareEyebrow") + "</div><h2>" + t("history.compareTitle") + "</h2><div class=\"scroll\"><table><thead><tr><th></th><th>" + esc(date(a.createdAt)) + "</th><th>" + esc(date(b.createdAt)) + "</th><th>Δ</th></tr></thead><tbody>" +
   shared.map(k => { const x = a.key[k]!, y = b.key[k]!, d = y - x; return "<tr><td>" + esc(keyLabel(k)) + "</td><td>" + num(x, 2) + "</td><td>" + num(y, 2) + "</td><td class=\"" + (d > 0 ? "up" : d < 0 ? "down" : "") + "\">" + (d > 0 ? "+" : "") + num(d, 2) + "</td></tr>"; }).join("") + "</tbody></table></div><p class=\"mini muted\">" + t("history.compareNote") + "</p>");
 };
 const input = el.querySelector("#import-input") as HTMLInputElement;
 (el.querySelector("#import-json") as HTMLButtonElement).onclick = () => input.click();
 input.onchange = async () => {
  const file = input.files?.[0]; input.value = ""; if (!file) return;
  try { const report = validateImport(JSON.parse(await file.text()), sport); await saveReport(report); toast(t("history.imported")); await renderHistory(el, sport, hooks); }
  catch (error) { toast(error instanceof Error ? error.message : String(error)); }
 };
 el.querySelectorAll<HTMLButtonElement>("[data-open]").forEach(b => b.onclick = async () => {
  if (hooks.busy()) { toast(t("app.waitAnalysis")); return; }
  const stored = await loadReport(sport, b.dataset.open!); if (stored) hooks.open(refreshReport(stored));
 });
 el.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach(b => b.onclick = async () => {
  if (!confirm(t("history.confirmDelete"))) return;
  try { await deleteReport(sport, b.dataset.delete!); await renderHistory(el, sport, hooks); } catch (error) { toast(String(error)); }
 });
}
