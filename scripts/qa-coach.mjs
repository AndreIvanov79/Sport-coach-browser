// Coach mode QA (coach-lite SPEC, sections 6-7): the analyzer opened from the Coach Desk Lite Mini App.
// Checks that the normal mode is untouched, the banner, the summary link back to Telegram (desktop: web Telegram in a
// new tab; phone: t.me), that the full report lands in history, and the share card PNG. Telegram is never contacted:
// its addresses are answered locally.
// Usage: npm run build && node scripts/qa-coach.mjs --boxing clip.webm --rg clip.webm [--only computer|phone] [--chrome /path/to/chrome] [--out artifacts/coach]
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { decodeSummary } from "../src/handoff/summary.ts";

const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const dist = path.resolve("dist"), out = path.resolve(arg("out", "artifacts/coach"));
const clips = { boxing: arg("boxing"), rg: arg("rg") };
if (!clips.boxing || !clips.rg) { console.error("Pass --boxing <clip> and --rg <clip> (short clips with one person)."); process.exit(1); }
await fs.mkdir(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const server = http.createServer(async (req, res) => { try { let f = path.join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!f.startsWith(dist)) throw 0; if ((await fs.stat(f)).isDirectory()) f = path.join(f, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(f)] ?? "application/octet-stream" }).end(await fs.readFile(f)); } catch { res.writeHead(404).end(); } });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: arg("chrome", undefined), args: ["--autoplay-policy=no-user-gesture-required"] });
const telegram = route => route.fulfill({ status: 200, contentType: "text/html", body: "<title>telegram stub</title>" });

async function analyze(page, clip) {
 await page.setInputFiles("#file-input", clip);
 await page.selectOption("#fps", "15");
 await page.click("#analyze");
 await page.waitForFunction(() => !window.__sportCoach.busy() && (window.__sportCoach.report() || !document.getElementById("error").hidden), null, { timeout: 900000, polling: 500 });
 // Several people in the frame: the app asks who the athlete is; keep its suggestion.
 await page.waitForTimeout(1200);
 if (await page.isVisible("#picker-dialog")) { await page.click("#picker-confirm"); await page.waitForTimeout(500); }
 const report = await page.evaluate(() => { const r = window.__sportCoach.report(); return r && { id: r.id, sport: r.sport, strikes: r.strikes?.length ?? null, events: r.rg?.events.length ?? null, scalars: r.scalars.map(s => s.id), findings: r.findings.map(f => f.code) }; });
 assert.ok(report, "analysis finished: " + await page.textContent("#error"));
 return report;
}
const pngSize = buf => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), png: buf.subarray(1, 4).toString() === "PNG" });
function checkSummary(s, report, athlete) {
 assert.ok(s, "the link carries a valid summary");
 assert.equal(s.id, report.id);
 assert.equal(s.a, athlete);
 assert.equal(s.s, report.sport === "boxing" ? "b" : "r");
 assert.equal(s.n, report.sport === "boxing" ? report.strikes : report.events);
 for (const k of Object.keys(s.k)) assert.ok(report.scalars.includes(k), "figure from the report: " + k);
 for (const f of s.f) assert.ok(report.findings.includes(f), "finding from the report: " + f);
}

// 1. The normal mode does not change; a foreign return bot does not turn coach mode on.
{
 const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })).newPage();
 await page.goto(origin + "/boxing/pwa/?e2e&cpu");
 assert.ok(await page.isHidden("#coach-host"), "no banner in the normal mode");
 await page.goto(origin + "/boxing/pwa/?e2e&cpu#coach=1&a=Ab12&n=X&ret=evil_collector_bot");
 await page.reload();
 assert.ok(await page.isHidden("#coach-host"), "foreign ret: no coach mode");
 assert.equal(await page.evaluate(() => location.hash), "", "the fragment is removed from the address bar anyway");
 await page.context().close();
 console.log("normal mode: unchanged, foreign ret refused");
}

const only = arg("only"); // "computer" or "phone" to rerun one part
// 2. Computer: banner with the name, survives a reload, web Telegram in a new tab, report saved, share card.
if (only !== "phone") {
 const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", acceptDownloads: true });
 await ctx.route("https://web.telegram.org/**", telegram); await ctx.route("https://t.me/**", telegram);
 const page = await ctx.newPage(), warnings = [];
 page.on("pageerror", e => warnings.push(String(e)));
 await page.goto(origin + "/boxing/pwa/?e2e&cpu#coach=1&a=Ab12Cd34&n=" + encodeURIComponent("Тест Тестов") + "&ret=coach_desk_lite_bot");
 await page.evaluate(() => localStorage.setItem("sport-coach-lang", "ru")); await page.reload();
 assert.match(await page.textContent("#coach-host"), /Разбор для: Тест Тестов/);
 assert.equal(await page.evaluate(() => location.hash), "", "the name is not left in the address bar");
 const report = await analyze(page, clips.boxing);
 await page.waitForSelector(".coach-panel [data-open=web]:not([disabled])");
 assert.equal(await page.locator(".coach-panel [data-open]").count(), 2, "computer: Telegram Desktop and web Telegram");
 await page.click(".coach-panel details summary");
 const what = await page.textContent(".coach-panel [data-what]");
 assert.match(what, /Показатели: .+/); assert.doesNotMatch(what, /Тест Тестов|\.webm/);
 await page.locator(".coach-panel").screenshot({ path: path.join(out, "desktop-panel.png") });
 const [tab] = await Promise.all([ctx.waitForEvent("page"), page.click(".coach-panel [data-open=web]")]);
 const tgaddr = decodeURIComponent(new URL(tab.url()).hash.split("tgaddr=")[1] ?? "");
 assert.match(tgaddr, /^tg:\/\/resolve\?domain=coach_desk_lite_bot&startapp=r[01]_/);
 const summary = await decodeSummary(new URL(tgaddr.replace("tg://", "https://x/")).searchParams.get("startapp"));
 checkSummary(summary, report, "Ab12Cd34");
 await tab.close();
 assert.equal(await page.evaluate(() => localStorage.getItem("sport-coach-telegram")), "web");
 await page.waitForTimeout(500);
 const saved = await page.evaluate(id => new Promise(resolve => { const r = indexedDB.open("sport-coach-boxing"); r.onsuccess = () => { const q = r.result.transaction("reports").objectStore("reports").get(id); q.onsuccess = () => resolve(!!q.result); q.onerror = () => resolve(false); }; r.onerror = () => resolve(false); }), report.id);
 assert.ok(saved, "the full report is in history under the summary's id");
 // Share card: blurred by default, then without blur.
 await page.click(".coach-panel [data-share]");
 await page.waitForSelector("#share-dialog [data-download]:not([disabled])");
 assert.ok(await page.isChecked("#share-dialog [data-blur]"), "blurred by default");
 await page.locator("#share-dialog").screenshot({ path: path.join(out, "share-dialog.png") });
 const save = async name => { const [d] = await Promise.all([page.waitForEvent("download"), page.click("#share-dialog [data-download]")]); const file = path.join(out, name); await d.saveAs(file); return pngSize(await fs.readFile(file)); };
 assert.deepEqual(await save("card-blurred.png"), { w: 1080, h: 1350, png: true });
 await page.uncheck("#share-dialog [data-blur]");
 await page.waitForSelector("#share-dialog [data-download]:not([disabled])");
 assert.deepEqual(await save("card-clear.png"), { w: 1080, h: 1350, png: true });
 await page.click("#share-dialog [data-close]");
 // After a reload of the tab the coach mode is still on (the Mini App context is kept for this tab only).
 await page.reload();
 assert.match(await page.textContent("#coach-host"), /Тест Тестов/);
 await page.click("#coach-exit");
 assert.ok(await page.isHidden("#coach-host"), "back to the normal mode");
 await page.reload();
 assert.ok(await page.isHidden("#coach-host"), "and it stays off");
 assert.deepEqual(warnings, []);
 await ctx.close();
 console.log("computer: summary " + JSON.stringify(summary));
}

// 3. Phone (Pixel 7): Self-training (no athlete), the single t.me button.
if (only !== "computer") {
 const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "en-US" });
 await ctx.route("https://t.me/**", telegram);
 const page = await ctx.newPage();
 await page.goto(origin + "/rg/pwa/?e2e&cpu#coach=1&ret=coach_desk_lite_bot");
 await page.evaluate(() => localStorage.setItem("sport-coach-lang", "en")); await page.reload();
 assert.match(await page.textContent("#coach-host"), /My progress/);
 const report = await analyze(page, clips.rg);
 await page.waitForSelector(".coach-panel [data-open=tme]:not([disabled])");
 assert.equal(await page.locator(".coach-panel [data-open]").count(), 1, "phone: one button");
 await page.locator(".coach-panel").screenshot({ path: path.join(out, "phone-panel.png") });
 const [request] = await Promise.all([page.waitForRequest(/^https:\/\/t\.me\/coach_desk_lite_bot\?startapp=/), page.click(".coach-panel [data-open=tme]")]);
 const summary = await decodeSummary(new URL(request.url()).searchParams.get("startapp"));
 checkSummary(summary, report, undefined);
 await ctx.close();
 console.log("phone: summary " + JSON.stringify(summary));
}
await browser.close(); server.close();
console.log("Coach mode: all checks passed. Screenshots and cards in " + path.relative(process.cwd(), out));
