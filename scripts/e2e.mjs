// Browser QA: real MediaPipe in Chromium against the built PWAs.
// Usage: node scripts/e2e.mjs [--chrome /path/to/chrome] [--fixtures dir] [--out artifacts/e2e] [--dump] [--skip-update]
// cases.json: [{ name, sport, file, exercise?, fps?, lang?, model? }]
// Chromium builds without proprietary codecs need VP8/VP9 WebM fixtures (ffmpeg -c:v libvpx-vp9).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : process.env[name.toUpperCase()] ?? fallback; };
const dist = path.resolve("dist"), fixtures = path.resolve(arg("fixtures", "work/fixtures")), out = path.resolve(arg("out", "artifacts/e2e"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".task": "application/octet-stream", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/markdown" };
let serveRoot = dist;
const server = http.createServer(async (req, res) => {
 try { const root = serveRoot; let file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!file.startsWith(root)) { res.writeHead(403).end(); return; } if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" }).end(await fs.readFile(file)); }
 catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port, origin = "http://127.0.0.1:" + port;
await fs.mkdir(out, { recursive: true });
const casesFile = path.join(fixtures, "cases.json");
const cases = JSON.parse(await fs.readFile(casesFile, "utf8"));
const executablePath = arg("chrome", undefined), extra = (arg("chrome-args", "") || "").split(" ").filter(Boolean);
const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", ...extra] });
const results = [], external = [];
for (const c of cases) {
 const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: c.lang ?? "ru-RU" });
 const page = await context.newPage(), errors = [];
 page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/^(INFO|W\d+|I\d+):|XNNPACK|TensorFlow Lite/.test(m.text())) errors.push(m.text()); });
 page.on("request", r => { if (!r.url().startsWith(origin) && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) external.push(r.url()); });
 await page.goto(origin + "/" + c.sport + "/pwa/?e2e" + (process.env.E2E_CPU ? "&cpu" : ""));
 if (c.lang) await page.selectOption("#lang", c.lang);
 await page.setInputFiles("#file-input", path.join(fixtures, c.file));
 await page.selectOption("#exercise", c.exercise ?? "auto"); await page.selectOption("#fps", String(c.fps ?? 15));
 if (c.model) await page.selectOption("#model", c.model);
 const started = Date.now();
 await page.click("#analyze");
 await page.waitForFunction(() => !window.__sportCoach.busy() && (window.__sportCoach.report() || !document.getElementById("error").hidden), null, { timeout: 600000 });
 const r = await page.evaluate(() => { const x = window.__sportCoach.report(); if (!x) return { error: document.getElementById("error").textContent }; return { samples: x.samples.length, duration: x.duration, decode: x.decode, coverage: x.coverage, people: x.athlete.people, selection: x.athlete.selection, lost: x.athlete.lostFrames, view: x.view.kind, driver: x.driver, cycles: x.cycles.length, findings: x.findings.map(f => f.code + (f.focus ? "*" : "")), model: document.getElementById("model")?.value, pickButton: !!document.getElementById("pick-athlete"), scalars: Object.fromEntries(x.scalars.filter(s => s.value !== null).map(s => [s.id, Math.round(s.value * 100) / 100])), exercise: x.exerciseInfo ? { detected: x.exerciseInfo.detected, status: x.exerciseInfo.status, candidates: x.exerciseInfo.candidates } : null, strikes: x.strikes?.length ?? null, events: x.rg ? x.rg.events.map(e => e.action + ":" + e.element + "@" + e.peak.toFixed(1) + (e.turns ? "x" + e.turns : "") + (e.hold !== null ? " hold " + e.hold.toFixed(2) : "")) : null, score: x.rg ? { d: x.rg.score.d.value, e: x.rg.score.e.total, review: x.rg.score.e.review, mode: x.rg.score.mode } : null }; });
 if (process.argv.includes("--dump")) await fs.writeFile(path.join(out, c.name + ".report.json"), await page.evaluate(() => JSON.stringify(window.__sportCoach.report())));
 const text = await page.locator("#report-section").innerText().catch(() => "");
 const rawKeys = [...text.matchAll(/\b(?:f|s|sd|m|md|rg\.el|ex|exn|app|report|sum)\.[a-z][\w.]*\b/g)].map(m => m[0]).filter(k => !/\.(mp4|webm|json|csv)$/.test(k));
 await page.screenshot({ path: path.join(out, c.name + ".png"), fullPage: true });
 if (!results.length && r.samples) {
  // Full screen must cover the video AND the skeleton layer (the browser's own video fullscreen shows the bare video).
  await page.click("#fullscreen"); await page.waitForTimeout(600);
  const fsState = await page.evaluate(() => ({ el: document.fullscreenElement?.id ?? null, canvas: document.getElementById("pose-overlay").clientWidth, view: innerWidth }));
  if (fsState.el !== "video-wrap" || fsState.canvas !== fsState.view) errors.push("fullscreen: " + JSON.stringify(fsState));
  await page.keyboard.press("KeyF"); await page.waitForTimeout(300);
 }
 results.push({ name: c.name, sport: c.sport, file: c.file, wallMs: Date.now() - started, ...r, rawKeys: [...new Set(rawKeys)].slice(0, 10), errors });
 console.log(c.name, JSON.stringify(results[results.length - 1]));
 await context.close();
}
// PWA update path: a 0.1 service worker (cache-first, no update banner) must hand over to this build by itself,
// and a later build must wait for the user's "Update" instead of reloading the page.
if (!process.argv.includes("--skip-update")) {
 const legacy = path.join(out, "update-legacy", "fitness", "pwa"), newer = path.join(out, "update-newer");
 await fs.rm(path.join(out, "update-legacy"), { recursive: true, force: true }); await fs.rm(newer, { recursive: true, force: true });
 await fs.mkdir(legacy, { recursive: true });
 await fs.writeFile(path.join(legacy, "index.html"), '<!doctype html><meta charset="utf-8"><p id="legacy">0.1</p><script>navigator.serviceWorker.register("./sw.js")</script>');
 await fs.writeFile(path.join(legacy, "sw.js"), 'const CACHE="sport-coach-fitness-legacy",FILES=["./index.html"];self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith((async()=>{const c=await caches.open(CACHE);return (await c.match(e.request))||(e.request.mode==="navigate"&&await c.match("./index.html"))||fetch(e.request);})());});');
 await fs.cp(path.join(dist, "fitness", "pwa"), path.join(newer, "fitness", "pwa"), { recursive: true });
 await fs.appendFile(path.join(newer, "fitness", "pwa", "sw.js"), "\n// newer build\n");
 const context = await browser.newContext(), page = await context.newPage(), errors = [];
 const state = () => page.evaluate(() => ({ legacy: !!document.getElementById("legacy"), app: !!document.getElementById("analyze"), banner: !!document.getElementById("update-banner") && !document.getElementById("update-banner").hidden }));
 try {
  serveRoot = path.join(out, "update-legacy");
  await page.goto(origin + "/fitness/pwa/"); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  serveRoot = dist; await page.reload();
  await page.waitForFunction(() => !!document.getElementById("analyze"), null, { timeout: 60000 }).catch(() => errors.push("0.1 page did not switch to this build"));
  serveRoot = newer; await page.waitForTimeout(2000); await page.reload(); await page.waitForTimeout(8000);
  const s = await state(); if (!s.app || !s.banner) errors.push("newer build: expected the update banner, got " + JSON.stringify(s));
 } catch (e) { errors.push(String(e)); }
 serveRoot = dist; await context.close();
 results.push({ name: "pwa-update", errors, rawKeys: [] }); console.log("pwa-update", errors.length ? JSON.stringify(errors) : "ok");
}
await browser.close(); server.close();
await fs.writeFile(path.join(out, "e2e-report.json"), JSON.stringify({ testedAt: new Date().toISOString(), results, external: [...new Set(external)] }, null, 2));
const failed = results.filter(r => r.error || r.errors.length || r.rawKeys.length);
console.log(failed.length ? "FAILED: " + failed.map(f => f.name).join(", ") : "All e2e cases passed", "external requests:", external.length);
process.exit(failed.length || external.length ? 1 : 0);
