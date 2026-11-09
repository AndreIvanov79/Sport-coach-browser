// Coach Desk Lite: the analysis summary that travels from the analyzer (sport-coach-browser) back to the Mini App
// inside a Telegram start parameter. One implementation for both sides; the analyzer keeps a byte-identical copy
// in src/handoff/ (see SPEC.md, section 6.2). No imports: it runs in browsers and in Node 22+ as is.
//
// Never put a file name, an athlete name, body landmarks or frames into a summary.

/** Telegram limit for `startapp`: at most 512 characters from A-Z a-z 0-9 _ - */
export const PARAM_MAX = 512;
export const FINDINGS_MAX = 3;
/** Decompressed JSON larger than this is rejected (a hand-made link must not blow up memory). */
const JSON_MAX = 8192;
const KEYS_MAX = 60;

export type SportCode = "f" | "b" | "r";
export type Sport = "fitness" | "boxing" | "rg";
export const SPORT_CODE: Record<Sport, SportCode> = { fitness: "f", boxing: "b", rg: "r" };
export const SPORT_NAME: Record<SportCode, Sport> = { f: "fitness", b: "boxing", r: "rg" };

export type Summary = {
  v: 1;
  /** Report id in the analyzer (idempotent saving, link to the full report on the coach's device). */
  id: string;
  /** Athlete id from the hand-off fragment; absent for Self-training. */
  a?: string;
  /** Inbox item id (stage B). */
  in?: string;
  s: SportCode;
  /** Exercise (fitness), mode (boxing) or element/routine (rg). */
  e: string;
  /** Analysis time, minutes since 1970-01-01 UTC. */
  t: number;
  /** Clip duration, tenths of a second. */
  d: number;
  /** Share of frames with a detected pose, percent. */
  c: number;
  /** Reps, strikes or elements; null when the analysis does not count them. */
  n: number | null;
  /** Key figures in the sport's priority order (most important first), rounded. */
  k: Record<string, number>;
  /** Up to three finding codes, the focus first. */
  f: string[];
};

/** What the analyzer passes in: the fields of its Report plus the count it computes in summarize(). */
export type SummarySource = {
  id: string;
  sport: Sport;
  exercise: string;
  detected?: string | null;
  createdAt: string | number | Date;
  /** seconds */
  duration: number;
  /** 0..1 */
  coverage: number;
  count: number | null;
  /** In the report's order, which is the priority order. `digits` is the display precision. */
  scalars: { id: string; value: number | null; digits?: number }[];
  findings: { code: string; kind?: string; tone?: string; focus?: boolean }[];
};

export type SummaryContext = { athlete?: string; inbox?: string };

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const EXERCISE = /^[a-z0-9_]{1,40}$/;
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const CODE = /^[a-z0-9_]{1,40}$/;
const PARAM = /^r[01]_[A-Za-z0-9_-]+$/;
const T_MIN = Date.UTC(2025, 0, 1) / 60000;
const T_MAX = Date.UTC(2100, 0, 1) / 60000;

/** Rounds to the display precision (at most 2 decimals); without one: integers from 10 up, else 2 decimals. */
export function roundValue(value: number, digits?: number): number {
  const d = digits === undefined ? (Math.abs(value) >= 10 ? 0 : 2) : Math.max(0, Math.min(2, Math.round(digits)));
  const f = 10 ** d, r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Informational findings that only repeat what `n` and `e` already say (counts, which exercise was recognised).
 * Other informational findings (head_moves, rg_max_split, tempo_varies…) are technique remarks and may fill
 * the remaining places after faults and strengths. Quality findings (coverage, view, bridging) never travel.
 */
const SKIP_INFO = new Set(["cycles", "no_cycles", "strikes", "no_strikes", "rg_events", "sets",
  "exercise_detected", "exercise_confirmed", "exercise_ambiguous", "exercise_conflict"]);

function findingKind(f: SummarySource["findings"][number]): string {
  if (f.kind) return f.kind;
  return f.tone === "attention" ? "fault" : f.tone === "good" ? "strength" : "info";
}

/** Picks the coach-relevant part of a report: figures in priority order, the focus and faults before strengths. */
export function toSummary(src: SummarySource, ctx: SummaryContext = {}): Summary {
  const s = SPORT_CODE[src.sport];
  if (!s) throw new Error("unknown sport " + String(src.sport));
  if (!ID.test(src.id)) throw new Error("report id must match " + ID);
  const exercise = src.exercise === "auto" || !src.exercise ? src.detected || "auto" : src.exercise;
  const k: Record<string, number> = {};
  for (const x of src.scalars) {
    if (Object.keys(k).length >= KEYS_MAX) break;
    if (x.value === null || !Number.isFinite(x.value) || !KEY.test(x.id) || x.id in k) continue;
    k[x.id] = roundValue(x.value, x.digits);
  }
  const rank = (f: SummarySource["findings"][number]) => {
    const kind = findingKind(f);
    if (kind === "info") return SKIP_INFO.has(f.code) ? -1 : 9;
    if (kind !== "fault" && kind !== "strength") return -1;
    return (f.focus ? 0 : 2) + (kind === "fault" ? 0 : 1);
  };
  const f: string[] = [];
  src.findings
    .map((x, i) => ({ code: x.code, r: rank(x), i }))
    .filter(x => x.r >= 0 && CODE.test(x.code))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .forEach(x => { if (f.length < FINDINGS_MAX && !f.includes(x.code)) f.push(x.code); });
  const time = new Date(src.createdAt).getTime();
  const out: Summary = {
    v: 1, id: src.id, s,
    e: EXERCISE.test(exercise) ? exercise : "auto",
    t: Math.floor((Number.isFinite(time) ? time : Date.now()) / 60000),
    d: Math.max(0, Math.round(src.duration * 10)),
    c: Math.max(0, Math.min(100, Math.round(src.coverage * 100))),
    n: src.count === null || !Number.isFinite(src.count) ? null : Math.max(0, Math.round(src.count)),
    k, f
  };
  if (ctx.athlete !== undefined) {
    if (!ID.test(ctx.athlete)) throw new Error("athlete id must match " + ID);
    out.a = ctx.athlete;
  }
  if (ctx.inbox !== undefined) {
    if (!ID.test(ctx.inbox)) throw new Error("inbox id must match " + ID);
    out.in = ctx.inbox;
  }
  return out;
}

// ---- bytes <-> base64url ----

function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - text.length % 4) % 4));
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
  } catch { return null; }
}

export const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inflates at most `limit` bytes; null when the data is broken or larger. */
async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel().catch(() => {}); return null; }
      parts.push(value);
    }
  } catch { return null; }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ---- encode ----

export type Encoded = {
  param: string;
  /** What actually went into the link (after trimming). */
  summary: Summary;
  /** Figures and findings left out to fit the 512-character limit. */
  dropped: { k: string[]; f: string[] };
};

async function pack(s: Summary, compress: boolean): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(s));
  const plain = "r0_" + toBase64url(json);
  if (!compress) return plain;
  const packed = "r1_" + toBase64url(await deflate(json));
  return packed.length < plain.length ? packed : plain;
}

/**
 * Builds the `startapp` value. Uses deflate-raw where the browser has CompressionStream (r1_), plain JSON otherwise
 * or when shorter (r0_). Over 512 characters it drops figures from the end of the priority list, then findings.
 */
export async function encodeSummary(summary: Summary, options: { compress?: boolean } = {}): Promise<Encoded> {
  const compress = options.compress ?? canCompress();
  const s: Summary = { ...summary, k: { ...summary.k }, f: [...summary.f] };
  const dropped = { k: [] as string[], f: [] as string[] };
  for (;;) {
    const param = await pack(s, compress);
    if (param.length <= PARAM_MAX) return { param, summary: s, dropped };
    const keys = Object.keys(s.k);
    if (keys.length) { const last = keys[keys.length - 1]; delete s.k[last]; dropped.k.unshift(last); }
    else if (s.f.length) dropped.f.unshift(s.f.pop()!);
    else throw new Error("summary does not fit into " + PARAM_MAX + " characters even without figures and findings");
  }
}

// ---- decode ----

const isInt = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** Checks the schema and ranges; returns a clean copy without unknown fields, or null. */
export function validateSummary(x: unknown): Summary | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.id !== "string" || !ID.test(o.id)) return null;
  if (o.a !== undefined && (typeof o.a !== "string" || !ID.test(o.a))) return null;
  if (o.in !== undefined && (typeof o.in !== "string" || !ID.test(o.in))) return null;
  if (o.s !== "f" && o.s !== "b" && o.s !== "r") return null;
  if (typeof o.e !== "string" || !EXERCISE.test(o.e)) return null;
  if (!isInt(o.t, T_MIN, T_MAX) || !isInt(o.d, 0, 36000) || !isInt(o.c, 0, 100)) return null;
  if (o.n !== null && !isInt(o.n, 0, 100000)) return null;
  if (!o.k || typeof o.k !== "object" || Array.isArray(o.k)) return null;
  const entries = Object.entries(o.k as Record<string, unknown>);
  if (entries.length > KEYS_MAX) return null;
  const k: Record<string, number> = {};
  for (const [key, value] of entries) {
    if (!KEY.test(key) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e6) return null;
    k[key] = value;
  }
  if (!Array.isArray(o.f) || o.f.length > FINDINGS_MAX) return null;
  const f: string[] = [];
  for (const code of o.f) {
    if (typeof code !== "string" || !CODE.test(code)) return null;
    if (!f.includes(code)) f.push(code);
  }
  const out: Summary = { v: 1, id: o.id, s: o.s, e: o.e, t: o.t, d: o.d, c: o.c, n: o.n as number | null, k, f };
  if (o.a !== undefined) out.a = o.a as string;
  if (o.in !== undefined) out.in = o.in as string;
  return out;
}

/** Reads a `start_param`. Anything that is not a valid summary gives null (links can be hand-made). */
export async function decodeSummary(param: unknown): Promise<Summary | null> {
  if (typeof param !== "string" || param.length > PARAM_MAX || !PARAM.test(param)) return null;
  let bytes = fromBase64url(param.slice(3));
  if (!bytes) return null;
  if (param[1] === "1") {
    if (!canCompress()) return null;
    bytes = await inflate(bytes, JSON_MAX);
    if (!bytes) return null;
  } else if (bytes.length > JSON_MAX) return null;
  try {
    return validateSummary(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return null; }
}

/** True for a start parameter that should be read as a summary (r0_/r1_), whether or not it decodes. */
export const isSummaryParam = (param: unknown): param is string => typeof param === "string" && /^r[01]_/.test(param);
