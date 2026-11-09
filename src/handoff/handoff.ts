// Coach Desk Lite: the trip Mini App -> analyzer -> Mini App (SPEC.md, sections 6.1 and 6.3).
// The Mini App opens the analyzer in the phone's browser with a URL fragment (never sent to a server);
// the analyzer returns the summary through a t.me or web.telegram.org link with `startapp`.
// No imports: the analyzer keeps a byte-identical copy in src/handoff/.

export type Sport = "fitness" | "boxing" | "rg";
/** Where the analyzer is published (sport-coach-browser on GitHub Pages); each sport lives in <base><sport>/. */
export const ANALYZER_BASE = "https://andreivanov79.github.io/Sport-coach-browser/";
export const NAME_MAX = 60;

/** Bot username (5-32 characters, Telegram rules) and an optional Mini App short name. */
const BOT = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const APP = /^[A-Za-z0-9_]{3,30}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const SPORTS: readonly Sport[] = ["fitness", "boxing", "rg"];

export type ReturnTarget = { bot: string; app?: string };
export type CoachContext = {
  /** Athlete id in the coach's storage; absent for Self-training. */
  athlete?: string;
  /** Only for the "Analysis for: <name>" banner; may be omitted. */
  name?: string;
  inbox?: string;
  ret: ReturnTarget;
};

/** Removes control and direction-override characters, collapses spaces, keeps at most 60 characters. */
export function cleanName(name: string): string {
  const flat = name.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(flat).slice(0, NAME_MAX).join("").trim();
}

const targetText = (t: ReturnTarget) => t.app ? t.bot + "/" + t.app : t.bot;

function parseTarget(text: string): ReturnTarget | null {
  const [bot, app, extra] = text.split("/");
  if (extra !== undefined || !BOT.test(bot) || (app !== undefined && !APP.test(app))) return null;
  return app === undefined ? { bot } : { bot, app };
}

/** The fragment without "#": coach=1&a=…&n=…&ret=…&in=… */
export function buildFragment(ctx: CoachContext): string {
  if (!parseTarget(targetText(ctx.ret))) throw new Error("bad return target");
  const p = new URLSearchParams({ coach: "1" });
  if (ctx.athlete !== undefined) { if (!ID.test(ctx.athlete)) throw new Error("bad athlete id"); p.set("a", ctx.athlete); }
  const name = ctx.name === undefined ? "" : cleanName(ctx.name);
  if (name) p.set("n", name);
  p.set("ret", targetText(ctx.ret));
  if (ctx.inbox !== undefined) { if (!ID.test(ctx.inbox)) throw new Error("bad inbox id"); p.set("in", ctx.inbox); }
  return p.toString();
}

/** The link the Mini App opens with Telegram.WebApp.openLink. */
export function analyzerUrl(sport: Sport, ctx: CoachContext, base: string = ANALYZER_BASE): string {
  if (!SPORTS.includes(sport)) throw new Error("unknown sport " + String(sport));
  const root = base.endsWith("/") ? base : base + "/";
  if (!/^https:\/\//.test(root)) throw new Error("the analyzer must be served over https");
  return root + sport + "/#" + buildFragment(ctx);
}

/**
 * Reads location.hash in the analyzer. Coach mode turns on only for a return target from `allowed`
 * ("bot" or "bot/app", case-insensitive), so a foreign link cannot send a summary to someone else's bot.
 */
export function parseFragment(hash: string, allowed: readonly string[]): CoachContext | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  if (p.get("coach") !== "1") return null;
  const ret = parseTarget(p.get("ret") ?? "");
  if (!ret || !allowed.some(a => a.toLowerCase() === targetText(ret).toLowerCase())) return null;
  const ctx: CoachContext = { ret };
  const athlete = p.get("a"), inbox = p.get("in"), name = cleanName(p.get("n") ?? "");
  if (athlete !== null) { if (!ID.test(athlete)) return null; ctx.athlete = athlete; }
  if (inbox !== null) { if (!ID.test(inbox)) return null; ctx.inbox = inbox; }
  if (name) ctx.name = name;
  return ctx;
}

export type ReturnLinks = {
  /** Phones and Telegram Desktop: opens the Mini App right away on Android (checked 9 Nov 2026). */
  tme: string;
  /** Computers without Telegram Desktop: web.telegram.org shows "Launch" and opens the Mini App. */
  web: string;
};

/** Links that carry the summary back. `param` must already be a valid start parameter (≤512, A-Z a-z 0-9 _ -). */
export function returnLinks(ret: ReturnTarget, param: string): ReturnLinks {
  if (!parseTarget(targetText(ret))) throw new Error("bad return target");
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(param)) throw new Error("bad start parameter");
  const tme = "https://t.me/" + ret.bot + (ret.app ? "/" + ret.app : "") + "?startapp=" + param;
  const resolve = "tg://resolve?domain=" + ret.bot + (ret.app ? "&appname=" + ret.app : "") + "&startapp=" + param;
  return { tme, web: "https://web.telegram.org/k/#?tgaddr=" + encodeURIComponent(resolve) };
}

/** Options for Telegram.WebApp.openLink: Android opens Chrome (checked); elsewhere the system default. */
export const openLinkOptions = (platform: string): { try_browser?: "chrome" } | undefined =>
  platform === "android" ? { try_browser: "chrome" } : undefined;
