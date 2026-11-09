// Coach mode on screen: the "Analysis for: <name>" banner and, after the analysis, "Save to card" with the links back
// to Coach Desk Lite plus "Share report". Shown only when the analyzer was opened from the Mini App.
import type { Report } from "../types.ts";
import { t } from "../i18n/index.ts";
import { esc, icon, toast } from "../ui/dom.ts";
import { findingTitle } from "../ui/report-view.ts";
import { coachSummary, isPhone, preferredOpen, rememberOpen, type CoachContext, type CoachSummary } from "./coach.ts";

export function coachTitle(ctx: CoachContext): string {
  return ctx.name ? t("coach.for", { name: ctx.name }) : ctx.athlete ? t("coach.forAthlete") : t("coach.forSelf");
}

export function renderCoachBanner(host: HTMLElement, ctx: CoachContext, exit: () => void): void {
  host.innerHTML = "<div class=\"coach-banner\" role=\"status\">" + icon("user", 22) + "<div><strong>" + esc(coachTitle(ctx)) + "</strong><p>" + esc(t("coach.hint")) + "</p></div>" +
    "<button class=\"text-button\" id=\"coach-exit\">" + esc(t("coach.exit")) + "</button></div>";
  host.hidden = false;
  (host.querySelector("#coach-exit") as HTMLButtonElement).onclick = exit;
}

export type CoachPanelHooks = { save: () => Promise<void>; share: () => void };

/** Inserts the coach panel at the top of the report. Returns when the summary is ready. */
export async function renderCoachPanel(section: HTMLElement, r: Report, ctx: CoachContext, hooks: CoachPanelHooks): Promise<void> {
  section.querySelector(".coach-panel")?.remove();
  const panel = document.createElement("section");
  panel.className = "panel coach-panel";
  const phone = isPhone(), first = preferredOpen();
  const buttons = phone
    ? "<button class=\"primary\" data-open=\"tme\">" + icon("arrow", 18) + " <span>" + esc(t("coach.save")) + "</span></button>"
    : (first === "web" ? ["web", "app"] as const : ["app", "web"] as const).map(kind => "<button class=\"" + (kind === first ? "primary" : "small-button") + "\" data-open=\"" + kind + "\">" + (kind === first ? icon("arrow", 18) + " " : "") + "<span>" + esc(t(kind === "web" ? "coach.openWeb" : "coach.openApp")) + "</span></button>").join("");
  panel.innerHTML = "<div class=\"section-heading\"><div><div class=\"eyebrow\"><span></span><b>COACH DESK LITE</b></div><h3>" + esc(coachTitle(ctx)) + "</h3></div>" + icon("user", 20) + "</div>" +
    "<p class=\"muted\">" + esc(t("coach.panelText")) + "</p>" +
    (phone ? "" : "<p class=\"mini muted\">" + esc(t("coach.desktopHint")) + "</p>") +
    "<div class=\"coach-buttons\">" + buttons + "<button class=\"small-button\" data-share>" + icon("arrow", 16) + " <span>" + esc(t("share.button")) + "</span></button></div>" +
    "<details class=\"coach-what\"><summary>" + esc(t("coach.what")) + "</summary><div data-what class=\"mini muted\">" + esc(t("share.making")) + "</div></details>";
  section.prepend(panel);
  const open = [...panel.querySelectorAll<HTMLButtonElement>("[data-open]")];
  open.forEach(b => b.disabled = true);
  (panel.querySelector("[data-share]") as HTMLButtonElement).onclick = hooks.share;

  let summary: CoachSummary;
  try { summary = await coachSummary(r, ctx); }
  catch (error) {
    (panel.querySelector("[data-what]") as HTMLElement).textContent = t("coach.error", { reason: error instanceof Error ? error.message : String(error) });
    return;
  }
  const label = (id: string) => t("s." + id);
  const titles = summary.summary.f.map(code => { const f = r.findings.find(x => x.code === code); return f ? findingTitle(r, f) : code; });
  const what = panel.querySelector("[data-what]") as HTMLElement;
  what.innerHTML = "<p>" + esc(t("coach.figures", { list: Object.keys(summary.summary.k).map(label).join(", ") || t("coach.none") })) + "</p>" +
    "<p>" + esc(t("coach.findings", { list: titles.join("; ") || t("coach.none") })) + "</p>" +
    (summary.dropped.k.length || summary.dropped.f.length ? "<p>" + esc(t("coach.trimmed", { list: [...summary.dropped.k.map(label), ...summary.dropped.f].join(", ") })) + "</p>" : "") +
    "<p>" + esc(t("coach.notSent")) + "</p>";
  for (const b of open) {
    b.disabled = false;
    b.onclick = () => {
      open.forEach(x => x.disabled = true);
      // The full report stays in this device's history under the same id as the summary. The link opens right away,
      // still inside the tap (phones hand t.me to the Telegram app only from a user gesture).
      hooks.save().catch(error => console.warn("[sport-coach] save before hand-off", error));
      const kind = b.dataset.open as "tme" | "web" | "app";
      if (kind === "tme") location.href = summary.links.tme;
      else {
        rememberOpen(kind);
        const a = document.createElement("a");
        a.href = kind === "web" ? summary.links.web : summary.links.tme; a.target = "_blank"; a.rel = "noopener";
        document.body.append(a); a.click(); a.remove();
      }
      toast(t("coach.opened"));
      setTimeout(() => open.forEach(x => x.disabled = false), 1500);
    };
  }
}
