// Decoder fault injection: phones sometimes refuse a hardware decoder for a moment (the player, the camera or the GPU
// still hold one). This checks that the app retries instead of failing: refusals when the analysis opens the video,
// a dropout in the middle of the analysis, a refusal in the visible player, and the message when it never works.
// Usage: npm run build && node scripts/qa-decoder.mjs [--chrome /path/to/chrome] [--clip work/fixtures/fuette.webm] [--sport rg]
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const dist = path.resolve("dist"), clip = path.resolve(arg("clip", "work/fixtures/fuette.webm")), sport = arg("sport", "rg");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const server = http.createServer(async (req, res) => { try { let f = path.join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!f.startsWith(dist)) throw 0; if ((await fs.stat(f)).isDirectory()) f = path.join(f, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(f)] ?? "application/octet-stream" }).end(await fs.readFile(f)); } catch { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: arg("chrome", undefined), args: ["--autoplay-policy=no-user-gesture-required"] });
// Makes the next N video loads fail like a refused decoder: an "error" event with MediaError code 3.
const inject = () => {
 const fake = (el, message) => Object.defineProperty(el, "error", { configurable: true, get: () => ({ code: 3, message }) });
 const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
 Object.defineProperty(HTMLMediaElement.prototype, "src", { configurable: true, get() { return d.get.call(this); }, set(v) {
  d.set.call(this, v);
  const key = this.id === "player" ? "__failPlayer" : "__failOpen";
  if (v && window[key] > 0) { window[key]--; fake(this, "simulated decoder refusal"); this.dispatchEvent(new Event("error")); }
 } });
 window.__dropout = () => { const v = [...document.querySelectorAll("video")].find(x => x.id !== "player" && x.id !== "live-video" && x.getAttribute("src")); if (!v) return false; fake(v, "simulated dropout"); v.dispatchEvent(new Event("error")); return true; };
};
async function run(name, setup, midway = false) {
 const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
 await ctx.addInitScript(inject);
 const page = await ctx.newPage(), warnings = [];
 page.on("console", m => { if (m.text().includes("[sport-coach]")) warnings.push(m.text()); });
 page.on("pageerror", e => warnings.push("pageerror: " + e));
 await page.goto(origin + "/" + sport + "/pwa/?e2e&cpu");
 await page.evaluate(setup);
 await page.setInputFiles("#file-input", clip);
 await page.waitForTimeout(1500);
 const errorAfterOpen = await page.evaluate(() => document.getElementById("error").hidden ? null : document.getElementById("error").textContent);
 await page.selectOption("#fps", "15");
 await page.click("#analyze");
 if (midway) { await page.waitForTimeout(2500); assert.ok(await page.evaluate(() => window.__dropout()), name + ": no analysis video to interrupt"); }
 await page.waitForFunction(() => !window.__sportCoach.busy() && (window.__sportCoach.report() || !document.getElementById("error").hidden), null, { timeout: 600000 });
 await page.waitForTimeout(1500);
 const r = await page.evaluate(() => { const x = window.__sportCoach.report(), p = document.getElementById("player"); return { report: !!x, samples: x?.samples.length ?? 0, decode: x?.decode ?? null, error: document.getElementById("error").hidden ? null : document.getElementById("error").textContent, playerBack: !!p.getAttribute("src") && p.readyState >= 1 && !p.getAttribute("poster") }; });
 await ctx.close();
 const out = { name, errorAfterOpen, ...r, warnings };
 console.log(JSON.stringify(out));
 return out;
}
const base = await run("baseline", () => undefined);
assert.ok(base.report && base.samples > 0 && !base.error && base.playerBack, "baseline");
const twice = await run("open refused twice", () => { window.__failOpen = 2; });
assert.ok(twice.report && twice.samples === base.samples && twice.warnings.length === 2, "retries when the decoder refuses the first opens");
const never = await run("open always refused", () => { window.__failOpen = 99; });
assert.ok(!never.report && /MediaError 3/.test(never.error ?? "") && never.playerBack, "clear message with the browser's reason, player restored");
const player = await run("player refused once", () => { window.__failPlayer = 1; });
assert.ok(!player.errorAfterOpen && player.report, "the player retries quietly");
const mid = await run("dropout mid-way", () => undefined, true);
assert.ok(mid.report && Math.abs(mid.samples - base.samples) <= 2 && mid.warnings.some(w => w.includes("reopening")), "reopens and finishes after a dropout");
await browser.close(); server.close();
console.log("Decoder fault injection: all 5 scenarios passed.");
