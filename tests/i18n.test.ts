import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DICTS } from "../src/i18n/index.ts";
import { profiles } from "../src/profiles.ts";
import { EXPECTATIONS } from "../src/sports/fitness-catalog.ts";
import { PROFILES } from "../src/sports/rg-catalog.ts";
import { NOT_ASSESSED } from "../src/sports/rg.ts";
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]).filter(f => f.endsWith(".ts") && !f.includes("i18n"));
const source = files("src").map(f => fs.readFileSync(f, "utf8")).join("\n");
const ru = DICTS.ru;
test("all languages have exactly the same keys and no empty texts", () => {
 for (const lang of ["en", "ro"] as const) {
  assert.deepEqual(Object.keys(DICTS[lang]).sort(), Object.keys(ru).sort(), lang);
  for (const [k, v] of Object.entries(DICTS[lang])) if (k !== "u.count" && k !== "joint." && k !== "exstatus.none") assert.ok(v.trim(), lang + " " + k);
 }
});
test("placeholders match across languages", () => {
 const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
 for (const k of Object.keys(ru)) for (const lang of ["en", "ro"] as const) assert.equal(ph(DICTS[lang][k]), ph(ru[k]), lang + " " + k);
});
test("every literal key used in code exists", () => {
 for (const m of source.matchAll(/\bt\("([a-zA-Z0-9_.]+)"\s*[,)]/g)) assert.ok(m[1] in ru, m[1]);
 for (const m of source.matchAll(/data-i18n(?:-aria)?="([a-zA-Z0-9_.]+)"/g)) assert.ok(m[1] in ru, m[1]);
});
test("every emitted finding code, scalar and catalogue entry is translated", () => {
 for (const m of source.matchAll(/(?<![a-zA-Z])code: "([a-z_]+)"\s*[,}]/g)) { if ("rg.ded." + m[1] in ru) continue; assert.ok("f." + m[1] + ".t" in ru, m[1]); assert.ok("f." + m[1] + ".d" in ru, m[1]); }
 for (const m of source.matchAll(/systematicFault\("([a-z_]+)"|consistentStrength\("([a-z_]+)"/g)) { const c = m[1] ?? m[2]; assert.ok("f." + c + ".t" in ru, c); }
 for (const m of source.matchAll(/scalar\("([a-zA-Z]+)"/g)) { assert.ok("s." + m[1] in ru, m[1]); assert.ok("sd." + m[1] in ru, m[1]); }
 for (const b of ["small", "medium", "large"]) assert.ok("f.rg_split_" + b + ".t" in ru);
 for (const v of ["front", "side", "oblique"]) assert.ok("f.view_" + v + ".t" in ru);
 for (const c of ["balance_short", "balance_held", "rotation", "missing_group", "max_split", "events", "no_body"]) assert.ok("f.rg_" + c + ".t" in ru, c);
 for (const el of Object.keys(EXPECTATIONS)) assert.ok("exn." + el in ru, el);
 for (const el of Object.keys(PROFILES)) assert.ok("rg.el." + el in ru, el);
 for (const k of NOT_ASSESSED) assert.ok("rg.na." + k in ru, k);
 for (const [sport, p] of Object.entries(profiles)) {
  for (const e of p.exercises) assert.ok("ex." + sport + "." + e.id in ru, sport + e.id);
  for (const m of p.metrics) assert.ok("m." + m in ru, m);
  for (const k of ["name", "tag", "title", "subtitle", "scope", "guide1", "guide2", "guide3", "guide4"]) assert.ok("sport." + sport + "." + k in ru);
 }
});
