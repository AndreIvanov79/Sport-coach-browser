import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
// @ts-ignore: plain ES module shared with the publishing scripts
import { SPORTS, LANGS, LIMITS, loadListings, listingProblems, placeholders, configProblems, assetLinks, fill } from "../scripts/store-lib.mjs";

const config = (over: Record<string, unknown> = {}) => ({ siteUrl: "https://coach.example.org", contactEmail: "coach@example.org", developerName: "Coach & Co", policyDate: "2026-10-22", androidPackagePrefix: "org.example.sportcoach", playSigningSha256: { fitness: [], boxing: [], rg: [] }, ...over });

test("store texts fit every store limit in all three languages", async () => {
 const listings = await loadListings();
 assert.deepEqual(listingProblems(listings), []);
 for (const sport of SPORTS) for (const lang of LANGS) assert.ok([...listings[sport][lang].name].length <= LIMITS.name);
});

test("an over-long or placeholder text is reported", async () => {
 const listings = structuredClone(await loadListings());
 listings.rg.ro.playShort = "x".repeat(81); listings.boxing.en.summary = "Write to YOUR_EMAIL";
 assert.deepEqual(listingProblems(listings), ["boxing.en.summary: placeholder left in text", "rg.ro.playShort: 81 > 80 characters"]);
});

test("store/config.json is well-formed: the only allowed problems are values not filled in yet", async () => {
 const shipped = JSON.parse(await fs.readFile("store/config.json", "utf8"));
 for (const problem of configProblems(shipped)) assert.match(problem, /fill in store\/config\.json/);
 assert.ok(placeholders(config({ siteUrl: "https://YOUR_DOMAIN" })).includes("siteUrl"));
});

test("config checks: https, e-mail, root domain for Android", () => {
 assert.deepEqual(configProblems(config()), []);
 assert.deepEqual(configProblems(config({ androidPackagePrefix: "YOUR_REVERSED_DOMAIN.sportcoach" })), [], "the website does not need the Android package");
 assert.ok(configProblems(config({ siteUrl: "http://coach.example.org" }))[0].includes("https"));
 assert.ok(configProblems(config({ contactEmail: "coach" }))[0].includes("e-mail"));
 assert.ok(configProblems(config({ siteUrl: "https://me.github.io/sport-coach" }), { needAndroid: true })[0].includes("root of its domain"));
 assert.deepEqual(configProblems(config({ siteUrl: "https://me.github.io/sport-coach" })), [], "a project page is fine for the PWAs alone");
});

test("assetlinks: one statement per signed app, fingerprints validated", () => {
 const print = Array(32).fill("ab").join(":");
 const links = assetLinks(config({ playSigningSha256: { fitness: [print], boxing: [], rg: [] } }));
 assert.equal(links.length, 1);
 assert.equal(links[0].target.package_name, "org.example.sportcoach.fitness");
 assert.deepEqual(links[0].target.sha256_cert_fingerprints, [print.toUpperCase()]);
 assert.throws(() => assetLinks(config({ playSigningSha256: { fitness: ["AB:CD"], boxing: [], rg: [] } })), /SHA-256/);
});

test("policy pages: every language present, placeholders filled and escaped", async () => {
 for (const page of ["privacy", "terms"]) {
  const html = await fs.readFile("site/" + page + ".html", "utf8");
  for (const lang of LANGS) assert.ok(html.includes(`<section id="${lang}" lang="${lang}">`), page + " " + lang);
  const filled = fill(html, config());
  assert.ok(!/\{\{\w+\}\}/.test(filled), page);
  assert.ok(filled.includes("Coach &amp; Co") && filled.includes("coach@example.org") && filled.includes("2026-10-22"));
 }
});
