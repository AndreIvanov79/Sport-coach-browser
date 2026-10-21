// Browser QA: real MediaPipe in Chromium against the built PWAs.
// Usage: node scripts/e2e.mjs [--chrome /path/to/chrome] [--fixtures dir] [--out artifacts/e2e]
// Chromium builds without proprietary codecs need VP8/VP9 WebM fixtures (ffmpeg -c:v libvpx-vp9).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : process.env[name.toUpperCase()] ?? fallback; };
const root = path.resolve("dist"), fixtures = path.resolve(arg("fixtures", "work/fixtures")), out = path.resolve(arg("out", "artifacts/e2e"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".task": "application/octet-stream", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/markdown" };
const server = http.createServer(async (req, res) => {
 try { let file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!file.startsWith(root)) { res.writeHead(403).end(); return; } if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" }).end(await fs.readFile(file)); }
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
 const started = Date.now();
 await page.click("#analyze");
 await page.waitForFunction(() => !window.__sportCoach.busy() && (window.__sportCoach.report() || !document.getElementById("error").hidden), null, { timeout: 600000 });
 const r = await page.evaluate(() => { const x = window.__sportCoach.report(); if (!x) return { error: document.getElementById("error").textContent }; return { samples: x.samples.length, duration: x.duration, decode: x.decode, coverage: x.coverage, people: x.athlete.people, selection: x.athlete.selection, lost: x.athlete.lostFrames, view: x.view.kind, driver: x.driver, cycles: x.cycles.length, findings: x.findings.map(f => f.code + (f.focus ? "*" : "")), scalars: Object.fromEntries(x.scalars.filter(s => s.value !== null).map(s => [s.id, Math.round(s.value * 100) / 100])), exercise: x.exerciseInfo ? { detected: x.exerciseInfo.detected, status: x.exerciseInfo.status, candidates: x.exerciseInfo.candidates } : null, strikes: x.strikes?.length ?? null, events: x.rg ? x.rg.events.map(e => e.action + ":" + e.element + "@" + e.peak.toFixed(1) + (e.turns ? "x" + e.turns : "") + (e.hold !== null ? " hold " + e.hold.toFixed(2) : "")) : null, score: x.rg ? { d: x.rg.score.d.value, e: x.rg.score.e.total, review: x.rg.score.e.review, mode: x.rg.score.mode } : null }; });
 if (process.argv.includes("--dump")) await fs.writeFile(path.join(out, c.name + ".report.json"), await page.evaluate(() => JSON.stringify(window.__sportCoach.report())));
 const text = await page.locator("#report-section").innerText().catch(() => "");
 const rawKeys = [...text.matchAll(/\b(?:f|s|sd|m|md|rg\.el|ex|exn|app|report|sum)\.[a-z][\w.]*\b/g)].map(m => m[0]).filter(k => !/\.(mp4|webm|json|csv)$/.test(k));
 await page.screenshot({ path: path.join(out, c.name + ".png"), fullPage: true });
 results.push({ name: c.name, sport: c.sport, file: c.file, wallMs: Date.now() - started, ...r, rawKeys: [...new Set(rawKeys)].slice(0, 10), errors });
 console.log(c.name, JSON.stringify(results[results.length - 1]));
 await context.close();
}
await browser.close(); server.close();
await fs.writeFile(path.join(out, "e2e-report.json"), JSON.stringify({ testedAt: new Date().toISOString(), results, external: [...new Set(external)] }, null, 2));
const failed = results.filter(r => r.error || r.errors.length || r.rawKeys.length);
console.log(failed.length ? "FAILED: " + failed.map(f => f.name).join(", ") : "All e2e cases passed", "external requests:", external.length);
process.exit(failed.length || external.length ? 1 : 0);
