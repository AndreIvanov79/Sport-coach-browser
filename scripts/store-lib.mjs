// Shared helpers for the publishing scripts (site, store sheets, store graphics, Android TWA).
import fs from "node:fs/promises";

export const SPORTS = ["fitness", "boxing", "rg"];
export const LANGS = ["en", "ru", "ro"];
export const APP = {
 fitness: { short: "Fitness Coach", color: "#c6ef73" },
 boxing: { short: "Boxing Coach", color: "#ffb49b" },
 rg: { short: "Rhythm Coach", color: "#c3b1ff" }
};
export const BACKGROUND = "#121619";

// Store field limits. name: Chrome manifest name ≤ 75, AMO name ≤ 50, so 50 is the common limit.
// summary: Chrome/Edge manifest description ≤ 132. amoSummary: AMO summary ≤ 250. playTitle ≤ 30, playShort ≤ 80, description ≤ 4000 (Play).
export const LIMITS = { name: 50, playTitle: 30, summary: 132, playShort: 80, amoSummary: 250, description: 4000 };

export async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
export async function loadConfig() { return readJson("store/config.json"); }
export async function loadListings() {
 const out = {};
 for (const sport of SPORTS) out[sport] = await readJson("store/listings/" + sport + ".json");
 return out;
}

/** Problems with the listing texts: missing fields, store length limits, leftover placeholders. */
export function listingProblems(listings) {
 const problems = [];
 for (const sport of SPORTS) {
  const l = listings[sport];
  if (!l) { problems.push(sport + ": listing missing"); continue; }
  for (const lang of LANGS) for (const [field, max] of Object.entries(LIMITS)) {
   const text = l[lang]?.[field];
   if (typeof text !== "string" || !text.trim()) problems.push(`${sport}.${lang}.${field}: missing`);
   else if ([...text].length > max) problems.push(`${sport}.${lang}.${field}: ${[...text].length} > ${max} characters`);
   else if (/YOUR_|\{\{/.test(text)) problems.push(`${sport}.${lang}.${field}: placeholder left in text`);
  }
 }
 return problems;
}

/** Config values that still need to be filled in by the publisher. */
export function placeholders(config) {
 const out = [];
 const walk = (value, at) => {
  if (typeof value === "string") { if (value.includes("YOUR_")) out.push(at); }
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (!k.startsWith("_")) walk(v, at ? at + "." + k : k);
 };
 walk(config, "");
 return out;
}

export function configProblems(config, { needAndroid = false } = {}) {
 const problems = placeholders(config).filter(p => needAndroid || p !== "androidPackagePrefix").map(p => p + ": fill in store/config.json");
 if (!placeholders(config).includes("siteUrl")) {
  let url; try { url = new URL(config.siteUrl); } catch { problems.push("siteUrl: not a URL"); }
  if (url && url.protocol !== "https:") problems.push("siteUrl: must start with https://");
  if (url && needAndroid && url.pathname !== "/") problems.push("siteUrl: Google Play apps need the site at the root of its domain (custom domain or <user>.github.io repository), not under " + url.pathname);
 }
 if (!placeholders(config).includes("contactEmail") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.contactEmail)) problems.push("contactEmail: not an e-mail address");
 if (!/^\d{4}-\d{2}-\d{2}$/.test(config.policyDate ?? "")) problems.push("policyDate: use YYYY-MM-DD");
 if (needAndroid) {
  if (!placeholders(config).includes("androidPackagePrefix") && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(config.androidPackagePrefix)) problems.push("androidPackagePrefix: use lower-case reversed domain, e.g. com.example.sportcoach");
 }
 return problems;
}

export function fingerprints(config, sport) {
 const list = config.playSigningSha256?.[sport] ?? [];
 return (Array.isArray(list) ? list : [list]).map(s => String(s).trim().toUpperCase()).filter(Boolean);
}
export const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function siteBase(config) { return config.siteUrl.replace(/\/+$/, "") + "/"; }

/** Digital Asset Links statements for every app that has signing fingerprints. */
export function assetLinks(config) {
 const out = [];
 for (const sport of SPORTS) {
  const prints = fingerprints(config, sport);
  if (!prints.length) continue;
  for (const p of prints) if (!FINGERPRINT.test(p)) throw new Error(`playSigningSha256.${sport}: "${p}" is not a SHA-256 fingerprint (32 hex pairs separated by colons)`);
  out.push({ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: config.androidPackagePrefix + "." + sport, sha256_cert_fingerprints: prints } });
 }
 return out;
}

export function fill(template, config) {
 const values = { SITE_URL: siteBase(config), CONTACT_EMAIL: config.contactEmail, DEVELOPER: config.developerName, POLICY_DATE: config.policyDate };
 return template.replace(/\{\{(\w+)\}\}/g, (all, key) => key in values ? escapeHtml(values[key]) : all);
}
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]); }

export async function walk(directory, prefix = "") {
 const out = [];
 for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
  const rel = prefix + entry.name;
  if (entry.isDirectory()) out.push(...await walk(directory + "/" + entry.name, rel + "/")); else out.push(rel);
 }
 return out;
}
