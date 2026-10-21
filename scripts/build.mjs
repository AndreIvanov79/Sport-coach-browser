import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "vite";
import assert from "node:assert/strict";
const root = process.cwd(), argv = process.argv;
const appVersion = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const mpVersion = JSON.parse(await fs.readFile("node_modules/@mediapipe/tasks-vision/package.json", "utf8")).version;
const variants = { boxing: { name: "Boxing Coach", color: "#ffb49b" }, fitness: { name: "Fitness Coach", color: "#c6ef73" }, rg: { name: "Rhythm Coach", color: "#c3b1ff" } };
const base = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/";
const MODELS = {
 lite: { file: "pose_landmarker_lite.task", url: base + "pose_landmarker_lite/float16/1/pose_landmarker_lite.task" },
 full: { file: "pose_landmarker_full.task", url: base + "pose_landmarker_full/float16/1/pose_landmarker_full.task" },
 heavy: { file: "pose_landmarker_heavy.task", url: base + "pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task" }
};
await fs.mkdir("public/models", { recursive: true }); await fs.mkdir("public/vendor", { recursive: true });
let lock = {}; try { lock = JSON.parse(await fs.readFile("assets-lock.json", "utf8")); } catch { /* first build */ }
if (lock.sha256 && !lock.models) lock = { models: { lite: { file: MODELS.lite.file, url: lock.url, bytes: lock.bytes, sha256: lock.sha256 } } };
lock.models ??= {};
const available = [];
for (const [id, src] of Object.entries(MODELS)) {
 const file = "public/models/" + src.file;
 try { await fs.access(file); } catch {
  if (id !== "lite" && argv.includes("--lite-only")) continue;
  try {
   console.log("Downloading MediaPipe " + id + " model...");
   const response = await fetch(src.url); if (!response.ok) throw new Error("HTTP " + response.status);
   await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
   if (id === "lite") throw new Error("Lite model download failed: " + error.message);
   console.warn("Optional " + id + " model unavailable (" + error.message + "); building without it."); continue;
  }
 }
 const data = await fs.readFile(file); if (data.length < 1000000) throw new Error("Invalid model file: " + id);
 const sha256 = createHash("sha256").update(data).digest("hex");
 if (lock.models[id]?.sha256 && lock.models[id].sha256 !== sha256) throw new Error("Model checksum changed: " + id);
 lock.models[id] = { file: src.file, url: src.url, bytes: data.length, sha256 };
 available.push({ id, file: src.file, bytes: data.length });
}
lock.packageVersion = mpVersion;
await fs.writeFile("assets-lock.json", JSON.stringify(lock, null, 2) + "\n");
await fs.cp("node_modules/@mediapipe/tasks-vision/wasm", "public/vendor", { recursive: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], { stdio: "inherit" });
const tests = (await fs.readdir("tests")).filter(f => f.endsWith(".test.ts")).map(f => "tests/" + f);
execFileSync(process.execPath, ["--experimental-strip-types", "--test", ...tests], { stdio: "inherit" });
await build({ configFile: false, logLevel: "warn", build: { target: "es2022", lib: { entry: path.join(root, "src/pose-worker.ts"), name: "PoseWorker", formats: ["iife"], fileName: () => "pose-worker.js" }, outDir: "work/worker", emptyOutDir: true, minify: true } });
await fs.mkdir("artifacts", { recursive: true });
async function walk(directory, prefix = "") { const out = []; for (const entry of await fs.readdir(directory, { withFileTypes: true })) { const rel = prefix + entry.name; if (entry.isDirectory()) out.push(...await walk(path.join(directory, entry.name), rel + "/")); else out.push(rel); } return out; }
function serviceWorker(sport, cache, files, optional) {
 const models = "sport-coach-" + sport + "-models";
 return `const CACHE=${JSON.stringify(cache)},MODELS=${JSON.stringify(models)},FILES=${JSON.stringify(files)},OPTIONAL=${JSON.stringify(optional)};
const optional=url=>OPTIONAL.some(f=>url.pathname.endsWith(f.slice(1)));
// A 0.1 worker (no models cache) has no update banner to send "skip-waiting": the new version takes over at once
// and reloads the open 0.1 pages. Later updates wait for the user to press "Update".
let legacy=false;
self.addEventListener("install",event=>event.waitUntil((async()=>{legacy=!!self.registration.active&&!(await caches.has(MODELS));await (await caches.open(CACHE)).addAll(FILES);if(legacy)await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith("sport-coach-${sport}-")&&key!==CACHE&&key!==MODELS)await caches.delete(key);const m=await caches.open(MODELS);for(const req of await m.keys())if(!optional(new URL(req.url)))await m.delete(req);await self.clients.claim();if(legacy)for(const c of await self.clients.matchAll({type:"window"}))c.navigate(c.url).catch(()=>{});})()));
self.addEventListener("fetch",event=>{const url=new URL(event.request.url);if(event.request.method!=="GET"||url.origin!==self.location.origin)return;event.respondWith((async()=>{const main=await caches.open(CACHE),hit=await main.match(event.request);if(hit)return hit;if(optional(url)){const m=await caches.open(MODELS),cached=await m.match(event.request);if(cached)return cached;const res=await fetch(event.request);if(res.ok)await m.put(event.request,res.clone());return res;}if(event.request.mode==="navigate"){const page=await main.match("./index.html");if(page)return page;}return fetch(event.request);})());});
self.addEventListener("message",event=>{if(event.data?.type==="skip-waiting"){self.skipWaiting();return;}if(event.data?.type==="offline-status")event.waitUntil((async()=>{const c=await caches.open(CACHE);if((await c.keys()).length>=FILES.length)event.source?.postMessage({type:"offline-ready"});})());});
`;
}
const checks = [], modelsDefine = JSON.stringify(available.map(({ id, file, bytes }) => ({ id, file, bytes })));
const optionalModels = available.filter(m => m.id !== "lite").map(m => "./models/" + m.file);
const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none';";
for (const [sport, config] of Object.entries(variants)) {
 await fs.rm("public/icons", { recursive: true, force: true }); await fs.mkdir("public/icons", { recursive: true });
 await fs.cp("assets/icons/" + sport, "public/icons", { recursive: true }); await fs.rm("public/icon.svg", { force: true });
 const output = "dist/" + sport + "/pwa";
 await build({ configFile: false, base: "./", logLevel: "warn", define: { __SPORT__: JSON.stringify(sport), __APP_VERSION__: JSON.stringify(appVersion), __MODELS__: modelsDefine }, build: { outDir: output, emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 1200 } });
 await fs.copyFile("work/worker/pose-worker.js", output + "/pose-worker.js");
 let html = await fs.readFile(output + "/index.html", "utf8"); html = html.replace("<title>Sport Coach</title>", "<title>" + config.name + "</title>"); await fs.writeFile(output + "/index.html", html);
 const icons = [192, 512].flatMap(s => [{ src: "icons/icon-" + s + ".png", sizes: s + "x" + s, type: "image/png", purpose: "any" }, { src: "icons/maskable-" + s + ".png", sizes: s + "x" + s, type: "image/png", purpose: "maskable" }]);
 const manifest = { id: "./", name: config.name, short_name: config.name, start_url: "./", scope: "./", display: "standalone", lang: "ru", background_color: "#121619", theme_color: "#121619", categories: ["sports", "health", "fitness"], description: "On-device sports video analysis with MediaPipe. Video never leaves the device.", icons, shortcuts: [{ name: "Live", url: "./#live", icons: [{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" }] }] };
 await fs.writeFile(output + "/manifest.webmanifest", JSON.stringify(manifest, null, 2));
 await fs.copyFile("THIRD_PARTY_NOTICES.md", output + "/THIRD_PARTY_NOTICES.md"); await fs.cp("licenses", output + "/licenses", { recursive: true });
 const assets = (await walk(output)).sort(), fingerprint = createHash("sha256");
 for (const asset of assets) fingerprint.update(asset).update(await fs.readFile(output + "/" + asset));
 const cache = "sport-coach-" + sport + "-" + fingerprint.digest("hex").slice(0, 12);
 const precache = assets.map(a => "./" + a).filter(a => !optionalModels.includes(a));
 await fs.writeFile(output + "/sw.js", serviceWorker(sport, cache, precache, optionalModels));
 for (const browser of ["chromium", "firefox"]) {
  const target = "dist/" + sport + "/" + browser; await fs.rm(target, { recursive: true, force: true }); await fs.cp(output, target, { recursive: true }); await fs.rm(target + "/sw.js");
  await fs.writeFile(target + "/background.js", "const api=globalThis.browser||chrome;api.action.onClicked.addListener(()=>{api.tabs.create({url:api.runtime.getURL(\"index.html\")});});");
  const ext = { manifest_version: 3, name: config.name, version: appVersion, description: "On-device sports video analysis: file or camera, MediaPipe, local report. No data leaves the device.", icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" }, action: { default_title: config.name, default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" } }, background: browser === "chromium" ? { service_worker: "background.js" } : { scripts: ["background.js"] }, content_security_policy: { extension_pages: csp }, ...(browser === "chromium" ? { minimum_chrome_version: "116" } : { browser_specific_settings: { gecko: { id: sport + "@sport-coach.local", strict_min_version: "128.0", data_collection_permissions: { required: ["none"] } } } }) };
  await fs.writeFile(target + "/manifest.json", JSON.stringify(ext, null, 2));
  assert.equal(ext.permissions, undefined); assert.equal(ext.host_permissions, undefined); assert.ok(ext.content_security_policy.extension_pages.includes("connect-src 'self'"));
  for (const asset of ["index.html", "pose-worker.js", "background.js", "models/pose_landmarker_lite.task", ...Object.values(ext.icons)]) await fs.access(target + "/" + asset);
  const page = await fs.readFile(target + "/index.html", "utf8"); assert.ok(!/<script[^>]+src=["\x27]https?:/i.test(page));
  for (const m of available) assert.equal(createHash("sha256").update(await fs.readFile(target + "/models/" + m.file)).digest("hex"), lock.models[m.id].sha256);
  checks.push({ sport, target: browser, files: (await walk(target)).length, models: available.map(m => m.id), permissions: [], remoteCode: false });
 }
 checks.push({ sport, target: "pwa", precacheFiles: precache.length, onDemand: optionalModels, cache });
}
await fs.writeFile("artifacts/build-report.json", JSON.stringify({ builtAt: new Date().toISOString(), version: appVersion, mediapipe: mpVersion, models: lock.models, checks }, null, 2));
console.log("Built 3 PWAs, 3 Chromium and 3 Firefox extensions (models: " + available.map(m => m.id).join(", ") + "). No remote runtime assets.");
if (argv.includes("--package")) await import("./package.mjs");
if (argv.includes("--qa")) await import("./e2e.mjs");
if (argv.includes("--serve")) await import("./serve.mjs");
