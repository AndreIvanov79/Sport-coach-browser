// Coach mode: the analyzer was opened from the Coach Desk Lite Mini App (coach-lite SPEC, sections 5.5-6.4).
// summary.ts and handoff.ts are byte-identical copies from coach-lite/shared; this file is the analyzer's glue.
import type { Report } from "../types.ts";
import { buildFragment, parseFragment, returnLinks, type CoachContext, type ReturnLinks } from "./handoff.ts";
import { encodeSummary, toSummary, type Encoded } from "./summary.ts";
import { RETURN_TARGETS } from "./targets.ts";

export type { CoachContext } from "./handoff.ts";
const SESSION = "sport-coach-coach";
const OPEN_WITH = "sport-coach-telegram";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session = (): Store | null => { try { return sessionStorage; } catch { return null; } };
const local = (): Store | null => { try { return localStorage; } catch { return null; } };

/**
 * Coach context from the URL fragment, or from this tab's session after a reload (the fragment is removed from the
 * address bar so the athlete's name does not stay in bookmarks or an installed app's start page).
 */
export function readCoachContext(hash: string, store: Store | null = session()): CoachContext | null {
  const fresh = parseFragment(hash, RETURN_TARGETS);
  if (fresh) { try { store?.setItem(SESSION, JSON.stringify(fresh)); } catch { /* private mode */ } return fresh; }
  try {
    const saved = JSON.parse(store?.getItem(SESSION) ?? "null") as CoachContext | null;
    return saved ? parseFragment("#" + buildFragment(saved), RETURN_TARGETS) : null;
  } catch { return null; }
}

export function endCoachMode(store: Store | null = session()): void { try { store?.removeItem(SESSION); } catch { /* ignore */ } }

/** Reps, strikes or elements: the same count as the history summary (storage.ts summarize). */
export function reportCount(r: Report): number | null {
  return r.sport === "boxing" ? r.strikes?.length ?? null : r.sport === "rg" ? r.rg?.events.length ?? null : r.cycles?.length ?? null;
}

export type CoachSummary = Encoded & { links: ReturnLinks };

export async function coachSummary(r: Report, ctx: CoachContext): Promise<CoachSummary> {
  const summary = toSummary({
    id: r.id, sport: r.sport, exercise: r.exercise, detected: r.exerciseInfo?.detected ?? null, createdAt: r.createdAt,
    duration: r.duration, coverage: r.coverage, count: reportCount(r), scalars: r.scalars, findings: r.findings
  }, { athlete: ctx.athlete, inbox: ctx.inbox });
  const encoded = await encodeSummary(summary);
  return { ...encoded, links: returnLinks(ctx.ret, encoded.param) };
}

/** Phones and tablets open t.me straight in the Telegram app (checked on Android); computers get two choices. */
export function isPhone(nav: { userAgent: string; maxTouchPoints?: number; userAgentData?: { mobile?: boolean } } = navigator as never): boolean {
  if (nav.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1; // iPadOS reports itself as a Mac
}

/** On a computer: Telegram Desktop ("app", via t.me) or web.telegram.org ("web", the default: works without installing). */
export function preferredOpen(store: Store | null = local()): "app" | "web" {
  try { return store?.getItem(OPEN_WITH) === "app" ? "app" : "web"; } catch { return "web"; }
}
export function rememberOpen(choice: "app" | "web", store: Store | null = local()): void { try { store?.setItem(OPEN_WITH, choice); } catch { /* ignore */ } }
