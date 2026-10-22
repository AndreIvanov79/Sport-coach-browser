// Store graphics: screenshots of the real apps (desktop 1280×800, phone 1080×1920), promo tiles, Play feature graphic, icons.
// Usage: npm run build && npm run store:assets [-- --only boxing] [--langs en,ru] [--video blur|show|hide] [--chrome /path/to/chrome] [--cpu]
// Clips: store/screenshots.json (your own videos in work/store-clips). The video picture is blurred by default so that
// the people in it cannot be recognised; the skeleton and the measurements stay sharp. Use --video show only for
// footage you have the right to publish. Output: artifacts/store/<sport>/.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { SPORTS, LANGS, APP, BACKGROUND, readJson } from "./store-lib.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const only = arg("only", "")?.split(",").filter(Boolean), langs = (arg("langs", LANGS.join(",")) ?? "").split(",").filter(l => LANGS.includes(l));
const videoMode = arg("video", "blur"), executablePath = arg("chrome", process.env.CHROME), out = path.resolve("artifacts/store");
const config = await readJson("store/screenshots.json"), clipsDir = path.resolve(arg("clips", config.clipsDir));
const sports = SPORTS.filter(s => !only?.length || only.includes(s));

const TAG = {
 fitness: { en: ["Reps, tempo and form", "from your workout video"], ru: ["Повторы, темп и техника", "по видео тренировки"], ro: ["Repetări, tempo și tehnică", "din videoclipul antrenamentului"] },
 boxing: { en: ["Strikes, guard and rotation", "from your boxing video"], ru: ["Удары, гард и разворот", "по видео бокса"], ro: ["Lovituri, gardă și rotație", "din videoclipul de box"] },
 rg: { en: ["Leaps, balances and turns", "from your gymnastics video"], ru: ["Прыжки, равновесия, повороты", "по видео гимнастики"], ro: ["Sărituri, echilibre, piruete", "din videoclipul de gimnastică"] }
};
const PRIVATE = { en: "On your device · no upload · no account", ru: "На устройстве · без загрузки · без аккаунта", ro: "Pe dispozitiv · fără încărcare · fără cont" };

// Original line art in the style of the app's skeleton overlay (MediaPipe topology), one characteristic pose per sport.
const POSES = {
 fitness: { head: [.5, .12], ls: [.41, .25], rs: [.59, .25], le: [.29, .27], re: [.71, .27], lw: [.17, .27], rw: [.83, .27], lh: [.44, .54], rh: [.56, .54], lk: [.31, .64], rk: [.69, .64], la: [.36, .88], ra: [.64, .88], angle: ["lk", "98°", -.24, -.04] },
 boxing: { head: [.5, .12], ls: [.41, .27], rs: [.57, .24], le: [.38, .4], re: [.71, .24], lw: [.44, .17], rw: [.87, .23], lh: [.44, .54], rh: [.52, .53], lk: [.36, .71], rk: [.62, .7], la: [.28, .9], ra: [.68, .9], angle: ["re", "174°", -.04, -.13] },
 rg: { head: [.52, .14], ls: [.46, .26], rs: [.57, .26], le: [.36, .17], re: [.67, .17], lw: [.28, .08], rw: [.75, .08], lh: [.47, .46], rh: [.54, .46], lk: [.31, .47], rk: [.7, .44], la: [.13, .46], ra: [.88, .42], angle: ["lh", "182°", -.06, .07] }
};
const BONES = [["ls", "rs"], ["ls", "le"], ["le", "lw"], ["rs", "re"], ["re", "rw"], ["ls", "lh"], ["rs", "rh"], ["lh", "rh"], ["lh", "lk"], ["lk", "la"], ["rh", "rk"], ["rk", "ra"]];
function figure(sport, size) {
 const p = POSES[sport], c = APP[sport].color, X = ([x, y]) => [x * size, y * size].map(v => v.toFixed(1)).join(",");
 const lines = BONES.map(([a, b]) => `<line x1="${X(p[a]).split(",")[0]}" y1="${X(p[a]).split(",")[1]}" x2="${X(p[b]).split(",")[0]}" y2="${X(p[b]).split(",")[1]}"/>`).join("");
 const neck = [(p.ls[0] + p.rs[0]) / 2, (p.ls[1] + p.rs[1]) / 2];
 const dots = Object.entries(p).filter(([k]) => k !== "angle" && k !== "head").map(([, v]) => `<circle cx="${X(v).split(",")[0]}" cy="${X(v).split(",")[1]}" r="${size * .016}"/>`).join("");
 const [ak, label, dx, dy] = p.angle, [ax, ay] = X(p[ak]).split(",").map(Number);
 return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><g stroke="${c}" stroke-width="${size * .022}" stroke-linecap="round" fill="none" opacity=".95">${lines}<line x1="${X(neck).split(",")[0]}" y1="${X(neck).split(",")[1]}" x2="${X(p.head).split(",")[0]}" y2="${(p.head[1] * size + size * .05).toFixed(1)}"/></g><circle cx="${X(p.head).split(",")[0]}" cy="${X(p.head).split(",")[1]}" r="${size * .055}" fill="none" stroke="${c}" stroke-width="${size * .02}"/><g fill="#fff">${dots}</g><g transform="translate(${(ax + size * dx).toFixed(1)},${(ay + size * dy).toFixed(1)})"><rect width="${size * .17}" height="${size * .075}" rx="${size * .012}" fill="#0d1310" stroke="${c}" stroke-width="${size * .006}"/><text x="${size * .085}" y="${size * .053}" text-anchor="middle" font-size="${size * .045}" font-weight="700" fill="${c}" font-family="Inter,Segoe UI,Arial,sans-serif">${label}</text></g></svg>`;
}
const iconData = async sport => "data:image/png;base64," + (await fs.readFile("assets/icons/" + sport + "/icon-512.png")).toString("base64");
async function tileHtml(sport, lang, w, h) {
 const k = h / 560, [t1, t2] = TAG[sport][lang], c = APP[sport].color;
 return `<!doctype html><meta charset="utf-8"><style>
 *{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${BACKGROUND};font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#e9eeeb}
 .bg{position:absolute;inset:0;background:radial-gradient(circle at 78% 50%,${c}33,transparent ${Math.round(h * .62)}px),linear-gradient(90deg,#121619 40%,#151b1e)}
 .grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:${Math.round(40 * k)}px ${Math.round(40 * k)}px}
 .text{position:absolute;left:${Math.round(w * .065)}px;top:50%;transform:translateY(-50%);width:${Math.round(w * .52)}px}
 .brand{display:flex;align-items:center;gap:${Math.round(18 * k)}px;margin-bottom:${Math.round(26 * k)}px}.brand img{width:${Math.round(92 * k)}px;height:${Math.round(92 * k)}px;border-radius:${Math.round(22 * k)}px}
 .brand b{font-size:${Math.round(50 * k)}px;font-weight:650;letter-spacing:-.02em}
 h1{font-size:${Math.round(56 * k)}px;line-height:1.08;font-weight:600;letter-spacing:-.02em}h1 span{display:block;color:#aab6b2;font-weight:450;font-size:.72em;margin-top:${Math.round(10 * k)}px}
 p{margin-top:${Math.round(24 * k)}px;font-size:${Math.round(23 * k)}px;color:${c};font-weight:550}
 .fig{position:absolute;right:${Math.round(w * .05)}px;top:50%;transform:translateY(-50%)}
 </style><div class="bg"></div><div class="grid"></div><div class="text"><div class="brand"><img src="${await iconData(sport)}"><b>${APP[sport].short}</b></div><h1>${t1}<span>${t2}</span></h1><p>${PRIVATE[lang]}</p></div><div class="fig">${figure(sport, Math.round(h * .9))}</div>`;
}
async function smallTileHtml(sport, lang) {
 const [t1] = TAG[sport][lang], c = APP[sport].color;
 return `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}html,body{width:440px;height:280px;overflow:hidden;background:${BACKGROUND};font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#e9eeeb}
 .bg{position:absolute;inset:0;background:radial-gradient(circle at 82% 45%,${c}38,transparent 190px)}
 .text{position:absolute;left:26px;top:30px;width:250px}.text img{width:62px;height:62px;border-radius:15px}
 b{display:block;font-size:30px;font-weight:650;letter-spacing:-.02em;margin-top:16px;line-height:1.05}h1{font-size:17px;font-weight:500;color:#c5cecb;margin-top:10px;line-height:1.3}p{position:absolute;left:26px;bottom:22px;font-size:13px;color:${c};font-weight:600}
 .fig{position:absolute;right:6px;top:22px}</style><div class="bg"></div><div class="text"><img src="${await iconData(sport)}"><b>${APP[sport].short}</b><h1>${t1}</h1></div><p>${PRIVATE[lang]}</p><div class="fig">${figure(sport, 200)}</div>`;
}
async function logoHtml(sport, size) { return `<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px;background:transparent}img{width:${size}px;height:${size}px;display:block}</style><img src="${await iconData(sport)}">`; }

// Static server for the built PWAs.
const dist = path.resolve("dist"), types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
 try { let file = path.resolve(dist, "." + decodeURIComponent(new URL(req.url, "http://x").pathname)); if (!file.startsWith(dist)) throw 0; if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" }).end(await fs.readFile(file)); }
 catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath, headless: true, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });

const VIDEO_CSS = { blur: "#player,#live-video{filter:blur(14px) brightness(.62) saturate(.8)}", hide: "#player,#live-video{opacity:0}", show: "" }[videoMode] ?? "";
const STORE_CSS = VIDEO_CSS + "#update-banner,#toast{display:none!important}*{scroll-behavior:auto!important;caret-color:transparent!important}";

const LAYOUTS = { desktop: { viewport: { width: 1280, height: 800 }, scale: "css", size: "1280x800" }, phone: { viewport: { width: 360, height: 640 }, scale: "device", size: "1080x1920" } };
async function scrollTo(page, selector) {
 await page.evaluate(sel => { const el = sel && document.querySelector(sel); window.scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - 16 : 0); }, selector);
 await page.waitForTimeout(300);
}

const done = [];
for (const sport of sports) {
 const clip = config[sport], dir = path.join(out, sport);
 await fs.mkdir(dir, { recursive: true });
 // Tiles, feature graphic and icons do not need a clip.
 for (const lang of langs) {
  for (const [name, w, h] of [["marquee-1400x560", 1400, 560], ["feature-1024x500", 1024, 500]]) {
   const p = await browser.newPage({ viewport: { width: w, height: h } }); await p.setContent(await tileHtml(sport, lang, w, h)); await p.screenshot({ path: path.join(dir, `${name}-${lang}.jpg`), type: "jpeg", quality: 94 }); await p.close();
  }
  const p = await browser.newPage({ viewport: { width: 440, height: 280 } }); await p.setContent(await smallTileHtml(sport, lang)); await p.screenshot({ path: path.join(dir, `promo-440x280-${lang}.jpg`), type: "jpeg", quality: 94 }); await p.close();
 }
 for (const size of [128, 300]) { const p = await browser.newPage({ viewport: { width: size, height: size } }); await p.setContent(await logoHtml(sport, size)); await p.screenshot({ path: path.join(dir, size === 300 ? "logo-300.png" : "icon-128.png"), omitBackground: true }); await p.close(); }
 await fs.copyFile("assets/icons/" + sport + "/icon-512.png", path.join(dir, "icon-512.png"));
 done.push(sport + ": tiles, icons");

 const file = clip?.file && path.join(clipsDir, clip.file);
 if (!file || !(await fs.stat(file).catch(() => null))) { console.warn(`${sport}: no clip ${file ?? "(not configured)"}: screenshots skipped. See store/screenshots.json.`); continue; }
 // One analysis per sport; desktop shots are taken at CSS size (1280×800), phone shots at 3× (1080×1920).
 const context = await browser.newContext({ viewport: LAYOUTS.desktop.viewport, deviceScaleFactor: 3, locale: "en-US" });
 await context.addInitScript(css => { addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }); }, STORE_CSS);
 const page = await context.newPage();
 await page.goto(origin + "/" + sport + "/pwa/?e2e" + (process.argv.includes("--cpu") ? "&cpu" : ""));
 await page.waitForSelector("#offline-status i.ok", { timeout: 60000 }).catch(() => {});
 const count = {};
 const capture = async (layout, lang, n, run) => {
  await page.setViewportSize(LAYOUTS[layout].viewport); await page.waitForTimeout(250);
  await run();
  const f = path.join(dir, layout, lang, `${LAYOUTS[layout].size}-${n}.jpg`); await fs.mkdir(path.dirname(f), { recursive: true });
  await page.screenshot({ path: f, type: "jpeg", quality: 92, scale: LAYOUTS[layout].scale });
  count[layout] = (count[layout] ?? 0) + 1;
 };
 for (const lang of langs) { await page.selectOption("#lang", lang); for (const layout of Object.keys(LAYOUTS)) await capture(layout, lang, 1, () => scrollTo(page, null)); }
 await page.setViewportSize(LAYOUTS.desktop.viewport);
 await page.setInputFiles("#file-input", file);
 await page.selectOption("#exercise", clip.exercise ?? "auto"); await page.selectOption("#fps", String(clip.fps ?? 15));
 if (clip.model) await page.selectOption("#model", clip.model).catch(() => {});
 const started = Date.now();
 await page.click("#analyze");
 await page.waitForFunction(() => !window.__sportCoach.busy() && (window.__sportCoach.report() || !document.getElementById("error").hidden), null, { timeout: 1800000, polling: 1000 });
 await page.waitForTimeout(800);
 if (await page.evaluate(() => document.getElementById("picker-dialog").open)) { await page.click("#picker-cancel"); await page.waitForTimeout(300); }
 if (!(await page.evaluate(() => !!window.__sportCoach.report()))) { console.warn(sport + ": analysis failed: " + await page.textContent("#error")); await context.close(); continue; }
 console.log(`${sport}: analysed in ${Math.round((Date.now() - started) / 1000)} s`);
 await page.evaluate(at => { const v = document.getElementById("player"); v.pause(); v.currentTime = Math.min(at, v.duration - .1); }, clip.at ?? 1);
 await page.waitForTimeout(1500);
 for (const lang of langs) {
  await page.selectOption("#lang", lang); await page.waitForTimeout(400);
  for (const layout of Object.keys(LAYOUTS)) {
   // The player in the app's own full screen: video, skeleton and joint angles.
   await capture(layout, lang, 2, async () => { await page.click("#fullscreen"); await page.waitForTimeout(900); });
   await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await page.waitForTimeout(500);
   await capture(layout, lang, 3, () => scrollTo(page, "#report-section"));
   await capture(layout, lang, 4, () => scrollTo(page, "#report-section .report-grid"));
   await capture(layout, lang, 5, () => scrollTo(page, "#report-section .score-panel, #report-section .table-panel, #report-section .graph-panel"));
  }
 }
 done.push(`${sport}: ${Object.entries(count).map(([k, v]) => v + " " + k).join(", ")} screenshots`);
 await context.close();
}
await browser.close(); server.close();
console.log("Store graphics in artifacts/store/: " + done.join("; ") + ". Video: " + videoMode + ". Check every image before uploading.");
