import "./style.css";
import type { Lang, ModelId, Report, Seed } from "./types.ts";
import { profiles } from "./profiles.ts";
import { AnalysisAborted, analyzeVideo } from "./analyzer.ts";
import { EngineError, availableModels } from "./engine.ts";
import { makeReport } from "./core/report.ts";
import { persistStorage, saveReport } from "./storage.ts";
import { LANGS, LANG_NAMES, getLang, setLang, t } from "./i18n/index.ts";
import { $, download, esc, formatTime, icon, toast } from "./ui/dom.ts";
import { drawLandmarks, drawMini, drawPose, videoBox } from "./ui/overlay.ts";
import { renderReport } from "./ui/report-view.ts";
import { renderHistory } from "./ui/history-view.ts";
import { LiveSession } from "./ui/live.ts";
import { canChoose, currentCandidate, pickAthlete } from "./ui/picker.ts";
import { personGeometry } from "./core/track.ts";
import { idle, refreshPwaTexts, setupPwa } from "./ui/pwa.ts";
import { bindFullscreen } from "./ui/fullscreen.ts";
import { watchFrozenFrames } from "./ui/stall.ts";
const profile = profiles[__SPORT__], app = document.querySelector<HTMLDivElement>("#app")!;
const extension = location.protocol.endsWith("-extension:");
const models = availableModels();
const SETTINGS = "sport-coach-" + profile.id + "-settings";
type Settings = { exercise: string; fps: number; threshold: number; model: ModelId; countdown: number; voice: boolean; record: boolean; v?: number };
// Full by default: on real clips it gives several times fewer skeleton glitches (left/right swaps, limbs jumping) than Lite.
const defaultModel: ModelId = models.some(m => m.id === "full") ? "full" : "lite";
const defaults: Settings = { exercise: "auto", fps: profile.defaultFps, threshold: 65, model: defaultModel, countdown: 5, voice: true, record: true, v: 2 };
let settings: Settings = defaults;
try { const saved = JSON.parse(localStorage.getItem(SETTINGS) ?? "{}"); settings = { ...defaults, ...saved }; if (saved.v !== 2) { settings.model = defaultModel; settings.v = 2; } } catch { /* defaults */ }
if (!models.some(m => m.id === settings.model)) settings.model = defaultModel;
const saveSettings = () => { try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* ignore */ } };
let file: File | null = null, objectUrl: string | null = null, report: Report | null = null, controller: AbortController | null = null;
let durationOverride: number | undefined, frameLoop = 0, live: LiveSession | null = null, playhead: ((time: number) => void) | null = null;
let source: Report["source"] = "file", view: "analysis" | "live" | "history" = "analysis";
document.documentElement.style.setProperty("--accent", profile.accent);
document.documentElement.lang = getLang();
const ANGLES: Record<string, [number, number, number][]> = {
 fitness: [[23, 25, 27], [24, 26, 28], [11, 23, 25], [12, 24, 26], [11, 13, 15], [12, 14, 16]],
 boxing: [[11, 13, 15], [12, 14, 16], [23, 25, 27], [24, 26, 28]], rg: [[23, 25, 27], [24, 26, 28], [11, 23, 25], [12, 24, 26]]
};
const opt = (value: string | number, key: string, selected: unknown) => "<option value=\"" + value + "\"" + (String(selected) === String(value) ? " selected" : "") + " data-i18n=\"" + key + "\">" + esc(t(key)) + "</option>";
app.innerHTML = `
<aside class="sidebar">
 <a class="brand" href="./"><img class="brand-icon" src="./icons/icon-192.png" alt=""><span><b data-i18n="sport.${profile.id}.name"></b><small data-i18n="app.tagline"></small></span></a>
 <div class="nav-label" data-i18n="app.workspace"></div>
 <nav><button class="nav-item active" id="nav-analysis">${icon("chart")}<span data-i18n="nav.analysis"></span><span class="nav-dot"></span></button><button class="nav-item" id="nav-live">${icon("live")}<span data-i18n="nav.live"></span><span class="nav-dot"></span></button><button class="nav-item" id="nav-history">${icon("history")}<span data-i18n="nav.history"></span><span class="nav-dot"></span></button><button class="nav-item" id="nav-guide">${icon("help")}<span data-i18n="nav.guide"></span></button></nav>
 <div class="sidebar-bottom"><div class="privacy-symbol">${icon("shield", 24)}</div><strong data-i18n="app.privacyTitle"></strong><p data-i18n="app.privacyText"></p><button class="text-button" id="privacy-info"><span data-i18n="app.privacyMore"></span> ${icon("arrow", 15)}</button><div class="version">SPORT COACH <span>v${__APP_VERSION__} · LOCAL</span></div></div>
</aside>
<div class="workspace">
 <header class="topbar"><div class="breadcrumb"><span data-i18n="sport.${profile.id}.name"></span> <span>/</span> <b id="page-label"></b></div><div class="top-actions"><label class="lang">${icon("globe", 15)}<select id="lang" aria-label="Language">${LANGS.map(l => "<option value=\"" + l + "\"" + (l === getLang() ? " selected" : "") + ">" + LANG_NAMES[l] + "</option>").join("")}</select></label><button class="small-button" id="install" hidden>${icon("download", 16)} <span data-i18n="app.install"></span></button><span class="status-pill" id="offline-status"></span></div></header>
 <main>
  <div id="analysis-view">
   <section class="hero"><div><div class="eyebrow"><span></span><b data-i18n="sport.${profile.id}.tag"></b></div><h1 data-i18n="sport.${profile.id}.title"></h1><p data-i18n="sport.${profile.id}.subtitle"></p></div><div class="hero-stamp"><span>ON DEVICE</span>${icon("shield", 38)}<span>BY DESIGN</span></div></section>
   <div class="studio-grid">
    <section class="panel source-panel">
     <div class="section-heading"><div class="number-label"><span>01</span><h2 data-i18n="app.yourVideo"></h2></div><span class="muted mini" id="source-meta"></span></div>
     <div class="source-tabs" role="group"><button id="source-file" class="selected">${icon("upload", 17)} <span data-i18n="app.uploadFile"></span></button><button id="source-camera">${icon("live", 17)} <span data-i18n="app.liveCamera"></span></button></div>
     <input type="file" id="file-input" accept="video/*" hidden><input type="file" id="attach-input" accept="video/*" hidden>
     <button class="dropzone" id="dropzone"><div class="motion-art" aria-hidden="true"><svg viewBox="0 0 240 140" fill="none"><ellipse cx="120" cy="117" rx="76" ry="9" stroke="currentColor" opacity=".15"/><path d="M51 43v-15h15m108 0h15v15M51 86v15h15m108 0h15V86" stroke="currentColor" opacity=".4"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="128" cy="29" r="9"/><path d="m125 43-14 29 28 20 17 25m-45-45-27 25-22 14m56-57 26 10 21-21m-40 0-27 8-16-15"/></g><g fill="currentColor"><circle cx="111" cy="72" r="4"/><circle cx="139" cy="92" r="4"/><circle cx="84" cy="97" r="4"/><circle cx="144" cy="64" r="4"/><circle cx="98" cy="51" r="4"/></g></svg></div><strong data-i18n="app.drop"></strong><span data-i18n="app.dropOr"></span><small data-i18n="app.formats"></small></button>
     <div id="player-section" hidden><div class="video-wrap" id="video-wrap" tabindex="0"><video id="player" controls playsinline preload="metadata"></video><canvas id="pose-overlay" aria-hidden="true"></canvas><div class="pick-layer" id="pick-layer"></div><span class="video-label" id="video-label"></span><button class="video-fs" id="fullscreen" type="button" data-i18n-aria="app.fullscreen">${icon("expand", 18)}</button></div>
      <div class="player-footer"><span id="file-label"></span><label class="toggle"><input type="checkbox" id="show-skeleton" checked> <span data-i18n="app.skeleton"></span></label><label class="toggle"><input type="checkbox" id="show-angles" checked> <span data-i18n="app.angles"></span></label><button class="text-button" id="replace-file" data-i18n="app.replace"></button></div>
      <div class="player-tools"><div class="speed" role="group"><button data-speed="0.25">0.25×</button><button data-speed="0.5">0.5×</button><button data-speed="1" class="selected">1×</button></div><button class="icon-button" id="step-back" data-i18n-aria="app.stepBack">${icon("prev", 16)}</button><button class="icon-button" id="step-fwd" data-i18n-aria="app.stepFwd">${icon("next", 16)}</button><span class="mini muted" data-i18n="app.keysHint"></span></div>
      <p class="mini muted" id="playback-note"></p></div>
     <div class="source-footnote">${icon("shield", 16)} <span data-i18n="app.localFile"></span></div>
    </section>
    <aside class="panel settings-panel">
     <div class="section-heading"><div class="number-label"><span>02</span><h2 data-i18n="app.settings"></h2></div>${icon("settings", 19)}</div>
     <label class="field-label" for="exercise" data-i18n="app.movement"></label><select id="exercise"></select><p class="field-help" id="exercise-help"></p>
     <label class="field-label" for="fps" data-i18n="app.fps"></label><select id="fps"></select>
     <div class="range-heading"><label class="field-label" for="threshold" data-i18n="app.threshold"></label><output id="threshold-value"></output></div><input id="threshold" type="range" min="50" max="90" step="5"><p class="field-help" data-i18n="app.thresholdHelp"></p>
     <label class="field-label" for="model" data-i18n="app.model"></label><select id="model"></select><p class="field-help" id="model-help"></p>
     <button id="analyze" class="primary" disabled><span data-i18n="app.analyze"></span> ${icon("arrow", 19)}</button><p class="run-note" data-i18n="app.runNote"></p>
    </aside>
   </div>
   <section class="panel progress-panel" id="progress-section" hidden aria-live="polite"><canvas id="progress-mini" aria-hidden="true"></canvas><div class="progress-body"><div><strong id="progress-title"></strong><span id="progress-percent">0%</span></div><progress id="progress" max="1" value="0"></progress><div class="progress-bottom"><span id="progress-detail"></span><button class="text-button" id="cancel" data-i18n="app.cancel"></button></div></div></section>
   <div class="notice error" id="error" role="alert" hidden></div>
   <section id="report-section" hidden></section>
   <section class="principles" id="principles"><article><span>01 /</span><h3 data-i18n="principle.1.t"></h3><p data-i18n="principle.1.d"></p></article><article><span>02 /</span><h3 data-i18n="principle.2.t"></h3><p data-i18n="principle.2.d"></p></article><article><span>03 /</span><h3 data-i18n="principle.3.t"></h3><p data-i18n="principle.3.d"></p></article></section>
  </div>
  <section id="live-view" hidden>
   <div class="eyebrow" data-i18n="live.eyebrow"></div><h1 data-i18n="live.title"></h1><p class="section-intro" data-i18n="live.intro"></p>
   <div class="live-grid">
    <div class="live-stage"><video id="live-video" playsinline muted></video><canvas id="live-overlay"></canvas><div class="live-big" id="live-big" hidden></div><span class="live-ready bad" id="live-ready"></span></div>
    <aside class="panel live-side">
     <div class="live-counter"><span data-i18n="live.count.${profile.id}"></span><strong id="live-count">0</strong><small id="live-timer">0:00 / 5:00</small></div>
     <ul class="live-checks" id="live-checks"></ul>
     <label class="field-label" for="live-exercise" data-i18n="app.movement"></label><select id="live-exercise"></select>
     <label class="field-label" for="live-countdown" data-i18n="live.countdown"></label><select id="live-countdown"></select>
     <label class="toggle"><input type="checkbox" id="live-voice"> <span data-i18n="live.voice"></span></label><label class="toggle"><input type="checkbox" id="live-record"> <span data-i18n="live.record"></span></label>
     <div class="live-buttons"><button class="primary" id="live-start">${icon("play", 17)} <span data-i18n="live.start"></span></button><button class="small-button" id="live-stop" disabled>${icon("stop", 16)} <span data-i18n="live.stop"></span></button><button class="small-button" id="live-switch">${icon("refresh", 16)} <span data-i18n="live.switch"></span></button></div>
     <p class="mini muted" id="live-message"></p>
    </aside>
   </div>
  </section>
  <section id="history-view" hidden><div class="eyebrow" data-i18n="history.eyebrow"></div><h1 data-i18n="nav.history"></h1><p class="section-intro" data-i18n="history.intro"></p><div id="history-list"></div></section>
  <footer><span><b data-i18n="sport.${profile.id}.name"></b> · <span data-i18n="app.footer"></span></span><span data-i18n="app.footerRight"></span></footer>
 </main>
</div>
<dialog id="info-dialog"><button class="dialog-close" id="close-info" data-i18n-aria="app.close">${icon("close")}</button><div id="info-content"></div></dialog>
<dialog id="picker-dialog" class="wide"><div class="eyebrow" data-i18n="picker.eyebrow"></div><h2 data-i18n="picker.title"></h2><p class="muted" id="picker-text"></p><div class="picker-stage"><canvas id="picker-frame"></canvas><canvas id="picker-canvas"></canvas></div><div class="picker-bar"><button class="icon-button" id="picker-prev">${icon("prev", 16)}</button><span id="picker-time" class="mini"></span><button class="icon-button" id="picker-next">${icon("next", 16)}</button><span class="grow"></span><button class="text-button" id="picker-cancel" data-i18n="app.cancel"></button><button class="small-button" id="picker-confirm" data-i18n="picker.confirm"></button></div></dialog>
<div id="update-banner" class="update-banner" role="status" hidden></div>
<div id="toast" class="toast" role="status" hidden></div>`;
const player = $<HTMLVideoElement>("player"), overlay = $<HTMLCanvasElement>("pose-overlay");
const fullscreen = bindFullscreen($("video-wrap"), player, $<HTMLButtonElement>("fullscreen"));
function applyI18n() {
 document.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n!); });
 document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria!)));
 document.title = t("sport." + profile.id + ".name") + " · " + t("app.titleSuffix");
 $("exercise").innerHTML = profile.exercises.map(e => opt(e.id, "ex." + profile.id + "." + e.id, settings.exercise)).join("");
 $("live-exercise").innerHTML = $("exercise").innerHTML;
 $("fps").innerHTML = [10, 15, 30].map(v => opt(v, "fps." + v, settings.fps)).join("");
 $("model").innerHTML = models.map(m => opt(m.id, "model." + m.id, settings.model)).join("");
 $("live-countdown").innerHTML = [0, 3, 5, 10].map(v => opt(v, "countdown." + v, settings.countdown)).join("");
 $<HTMLInputElement>("threshold").value = String(settings.threshold); $("threshold-value").textContent = settings.threshold + "%";
 $<HTMLInputElement>("live-voice").checked = settings.voice; $<HTMLInputElement>("live-record").checked = settings.record;
 $("page-label").textContent = t("nav." + view); movementHint(); modelHint();
 if (!file) $("source-meta").textContent = t("app.upTo10");
 $("video-label").textContent = t(report && file ? "app.labelSkeleton" : "app.labelSource");
 $("playback-note").textContent = t(report && file ? "app.noteSkeleton" : "app.noteSource");
 refreshPwaTexts();
}
function movementHint() {
 const ex = profile.exercises.find(e => e.id === $<HTMLSelectElement>("exercise").value) ?? profile.exercises[0];
 $("exercise-help").textContent = t(ex.id === "auto" ? "help.auto." + profile.id : ex.driver ? "help.driver" : "help.noDriver", { joint: t("joint." + (ex.driver ?? "")) });
}
function modelHint() { const m = models.find(x => x.id === $<HTMLSelectElement>("model").value) ?? models[0]; $("model-help").textContent = t("modelHelp." + m.id, { mb: (m.bytes / 1048576).toFixed(1) }); }
function fail(error: unknown) {
 const code = error instanceof EngineError ? error.code : null;
 $("error").textContent = code ? t("err." + code) : error instanceof Error ? error.message : String(error); $("error").hidden = false;
}
function updateControls() {
 const busy = !!controller;
 for (const id of ["exercise", "fps", "threshold", "model", "source-file", "source-camera", "replace-file", "dropzone"]) $<HTMLButtonElement>(id).disabled = busy;
 $<HTMLButtonElement>("analyze").disabled = busy || !file;
}
function setFile(next: File, recordedDuration?: number, keepReport = false) {
 if (controller) return;
 if (!next.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v)$/i.test(next.name)) { fail(new Error(t("err.notVideo"))); return; }
 if (next.size > 1024 * 1024 * 1024) { fail(new Error(t("err.tooBig"))); return; }
 stopOverlay(); if (objectUrl) URL.revokeObjectURL(objectUrl);
 file = next; durationOverride = recordedDuration; objectUrl = URL.createObjectURL(next);
 if (!keepReport) { report = null; $("report-section").hidden = true; $("principles").hidden = false; source = "file"; }
 player.src = objectUrl; player.load(); $("dropzone").hidden = true; $("player-section").hidden = false; $("error").hidden = true;
 $("file-label").textContent = next.name; $("source-meta").textContent = (next.size / 1048576).toFixed(1) + " MB";
 applyI18n(); updateControls(); if (keepReport && report) { startOverlay(); renderCurrent(); }
}
player.addEventListener("error", () => { if (player.getAttribute("src")) fail(new Error(t("err.decode"))); });
watchFrozenFrames(player);
const choose = () => { if (!controller) $<HTMLInputElement>("file-input").click(); };
$("source-file").onclick = choose; $("dropzone").onclick = choose; $("replace-file").onclick = choose;
$<HTMLInputElement>("file-input").onchange = event => { const input = event.target as HTMLInputElement; if (input.files?.[0]) setFile(input.files[0]); input.value = ""; };
const dropTarget = document.body;
dropTarget.addEventListener("dragover", event => { event.preventDefault(); $("dropzone").classList.add("dragover"); });
dropTarget.addEventListener("dragleave", () => $("dropzone").classList.remove("dragover"));
dropTarget.addEventListener("drop", event => { event.preventDefault(); $("dropzone").classList.remove("dragover"); const f = event.dataTransfer?.files[0]; if (f && view === "analysis") setFile(f); });
$<HTMLInputElement>("threshold").oninput = () => { settings.threshold = Number($<HTMLInputElement>("threshold").value); $("threshold-value").textContent = settings.threshold + "%"; saveSettings(); };
$("exercise").onchange = () => { settings.exercise = $<HTMLSelectElement>("exercise").value; saveSettings(); movementHint(); };
$("fps").onchange = () => { settings.fps = Number($<HTMLSelectElement>("fps").value); saveSettings(); };
$("model").onchange = () => { settings.model = $<HTMLSelectElement>("model").value as ModelId; saveSettings(); modelHint(); };
$("lang").onchange = () => { setLang($<HTMLSelectElement>("lang").value as Lang); applyI18n(); renderCurrent(); if (view === "history") void showHistory(); };
// Player: overlay, angle labels, slow motion, frame stepping, chart playhead.
// The skeleton follows the frame actually on screen (requestVideoFrameCallback), not currentTime: the clock runs
// a frame or two apart from the picture, which made fast punches and kicks look as if the skeleton jumped.
let shownTime: number | null = null;
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };
if ((player as FrameVideo).requestVideoFrameCallback) {
 const onFrame = (_now: number, meta: { mediaTime: number }) => { shownTime = meta.mediaTime; (player as FrameVideo).requestVideoFrameCallback!(onFrame); };
 (player as FrameVideo).requestVideoFrameCallback!(onFrame);
 player.addEventListener("loadstart", () => { shownTime = null; });
}
function currentSample() {
 if (!report) return undefined;
 const tm = shownTime ?? player.currentTime, s = report.samples; let lo = 0, hi = s.length - 1;
 while (lo < hi) { const m = (lo + hi) >> 1; if (s[m].time < tm) lo = m + 1; else hi = m; }
 const best = lo > 0 && Math.abs(s[lo - 1].time - tm) < Math.abs(s[lo].time - tm) ? lo - 1 : lo;
 return s[best] && Math.abs(s[best].time - tm) < 1.5 / Math.max(5, report.fps) ? s[best] : undefined;
}
function stopOverlay() { cancelAnimationFrame(frameLoop); drawPose(overlay, player, undefined, { accent: profile.accent, threshold: .65 }); pickLayer(undefined); }
// On pause, the other people the model found in this frame are drawn faintly and can be clicked to analyse them instead.
let choosable = false, pickKey = "";
function pickLayer(sample: Report["samples"][number] | undefined) {
 const layer = $("pick-layer"), vw = player.videoWidth, vh = player.videoHeight;
 const show = !!report && choosable && player.paused && !!sample?.candidates && sample.candidates.length > 1 && !!vw && !!vh;
 if (show) {
  const ctx = overlay.getContext("2d"), box = videoBox(overlay, vw, vh);
  if (ctx) sample!.candidates!.forEach(lms => { if (lms !== sample!.landmarks) drawLandmarks(ctx, lms, box, { accent: "#ffffff", threshold: .5, dim: true }, { w: sample!.width || vw, h: sample!.height || vh }); });
 }
 const key = show ? report!.id + ":" + sample!.time + ":" + overlay.clientWidth + "x" + overlay.clientHeight + ":" + report!.athlete.seed?.index + "/" + report!.athlete.seed?.candidate : "";
 if (key === pickKey) return; pickKey = key; layer.innerHTML = "";
 if (!show) return;
 const s = sample!, box = videoBox(overlay, vw, vh), index = report!.samples.indexOf(s), current = currentCandidate(s);
 s.candidates!.forEach((lms, k) => {
  if (k === current) return;
  const g = personGeometry(lms, s.width || vw, s.height || vh); if (!g) return;
  const sx = box.w / (s.width || vw), sy = box.h / (s.height || vh), pad = 10;
  const b = document.createElement("button"); b.type = "button"; b.className = "pick-person";
  b.style.left = (box.ox + g.minX * sx - pad) + "px"; b.style.top = (box.oy + g.minY * sy - pad) + "px";
  b.style.width = ((g.maxX - g.minX) * sx + 2 * pad) + "px"; b.style.height = ((g.maxY - g.minY) * sy + 2 * pad) + "px";
  b.innerHTML = "<span>" + esc(t("player.pickThis")) + "</span>"; b.setAttribute("aria-label", t("player.pickThis"));
  b.onclick = event => { event.stopPropagation(); chooseAthlete({ index, candidate: k }); };
  layer.appendChild(b);
 });
}
function chooseAthlete(seed: Seed) {
 const r = report; if (!r) return;
 report = makeReport({ ...r, seed, elapsedMs: r.elapsedMs }); renderCurrent(); toast(t("app.athleteChanged"));
}
async function choosePerson(auto: boolean) {
 const r = report; if (!r || !file || !canChoose(r)) return;
 const seed = await pickAthlete(r, player, profile.accent, auto);
 if (seed && report === r) chooseAthlete(seed);
}
function startOverlay() {
 stopOverlay();
 const tick = () => {
  if (!report) return;
  const sample = currentSample();
  drawPose(overlay, player, $<HTMLInputElement>("show-skeleton").checked ? sample : undefined, { accent: profile.accent, threshold: report.threshold, angles: $<HTMLInputElement>("show-angles").checked ? ANGLES[profile.id] : undefined });
  pickLayer(sample);
  playhead?.(player.currentTime); frameLoop = requestAnimationFrame(tick);
 };
 tick();
}
document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach(b => b.onclick = () => { player.playbackRate = Number(b.dataset.speed); document.querySelectorAll("[data-speed]").forEach(x => x.classList.toggle("selected", x === b)); });
function step(dir: number) {
 if (!report?.samples.length) return; player.pause();
 const s = report.samples, tm = player.currentTime;
 const next = dir > 0 ? s.find(x => x.time > tm + 1e-3) : [...s].reverse().find(x => x.time < tm - 1e-3);
 if (next) player.currentTime = next.time;
}
$("step-back").onclick = () => step(-1); $("step-fwd").onclick = () => step(1);
document.addEventListener("keydown", event => {
 const target = event.target as HTMLElement;
 if (event.code === "KeyF" && !event.ctrlKey && !event.metaKey && !event.altKey && view === "analysis" && file && !/INPUT|SELECT|TEXTAREA/.test(target.tagName) && !document.querySelector("dialog[open]")) { event.preventDefault(); fullscreen.toggle(); return; }
 if (view !== "analysis" || !report || !file || /INPUT|SELECT|TEXTAREA/.test(target.tagName) || document.querySelector("dialog[open]")) return;
 if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); }
});
function seek(time: number) { if (!file) return; player.pause(); player.currentTime = time; $("player-section").scrollIntoView({ behavior: "smooth", block: "center" }); }
const PHASES: Record<string, string> = { open: "progress.open", model: "progress.model", frames: "progress.frames" };
async function runAnalysis(target: File, src: Report["source"]) {
 if (controller) return; player.pause(); stopOverlay(); report = null; playhead = null; $("report-section").hidden = true; $("error").hidden = true;
 controller = new AbortController(); updateControls(); $("progress-section").hidden = false; $("progress-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
 const fps = settings.fps, threshold = settings.threshold / 100, exercise = settings.exercise, model = models.find(m => m.id === settings.model) ?? models[0];
 const base = { sport: profile.id, exercise, fileName: target.name, fps, threshold, modelId: model.id, source: src, fileSize: target.size, fileModified: target.lastModified };
 const aspect = { value: 1 };
 try {
  const data = await analyzeVideo(target, { fps, model, signal: controller.signal, durationOverride, progress: p => {
   $("progress-title").textContent = t(PHASES[p.phase]); $<HTMLProgressElement>("progress").value = p.fraction; $("progress-percent").textContent = Math.round(p.fraction * 100) + "%";
   if (p.sample) { aspect.value = p.sample.width / Math.max(1, p.sample.height); $("progress-detail").textContent = t("progress.detail", { time: formatTime(p.sample.time), people: p.sample.people ?? 0 }); drawMini($<HTMLCanvasElement>("progress-mini"), p.sample.candidates?.[0], aspect.value, profile.accent); }
  } });
  report = makeReport({ ...base, ...data }); source = src; renderCurrent();
  // Several people found: ask right away who the athlete is instead of hiding the choice in the report.
  if (file && canChoose(report)) setTimeout(() => void choosePerson(true), 300);
 } catch (error) {
  if (error instanceof AnalysisAborted) {
   const partial = error.partial;
   if (partial && partial.samples.length >= 10) { report = makeReport({ ...base, ...partial, interrupted: true }); renderCurrent(); toast(t("app.partialReport")); }
   else toast(t("app.cancelled"));
  } else fail(error);
 } finally { controller = null; $("progress-section").hidden = true; updateControls(); idle(); }
}
$("analyze").onclick = () => { if (file) void runAnalysis(file, source === "live" ? "camera" : source); };
$("cancel").onclick = () => controller?.abort();
function exportJson() {
 if (!report) return; const r = { ...report, samples: report.samples.map(({ candidates, looks, ...s }) => s) };
 download(new Blob([JSON.stringify(r)], { type: "application/json" }), profile.id + "-report-" + report.id.slice(0, 8) + ".json");
}
function exportCsv() {
 if (!report) return; const r = report, rows = ["time_s," + r.metrics.map(m => m.id).join(",")];
 r.samples.forEach((s, i) => rows.push(s.time.toFixed(4) + "," + r.metrics.map(m => m.series[i]?.toFixed(4) ?? "").join(",")));
 download(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }), profile.id + "-metrics-" + r.id.slice(0, 8) + ".csv");
}
async function save() {
 if (!report) return;
 try {
  await saveReport({ ...report, samples: report.samples.map(({ candidates, looks, ...s }) => s) });
  const persisted = await persistStorage();
  toast(t(persisted ? "app.savedPersistent" : "app.savedLocal"));
 } catch (error) { fail(new Error(t("err.save"))); throw error; }
}
function renderCurrent() {
 if (!report) return; const r = report;
 $("report-section").hidden = false; $("principles").hidden = true;
 const canPick = !!file && canChoose(r); choosable = canPick; pickKey = "";
 const api = renderReport($("report-section"), r, {
  hasVideo: () => !!file, seek, save, json: exportJson, csv: exportCsv, attach: () => $<HTMLInputElement>("attach-input").click(),
  pickAthlete: canPick ? () => void choosePerson(false) : null,
  reanalyze: r.source === "live" && file ? () => void runAnalysis(file!, "camera") : null
 });
 playhead = api.playhead;
 if (file) { $("video-label").textContent = t("app.labelSkeleton"); $("playback-note").textContent = t("app.noteSkeleton"); startOverlay(); }
}
$<HTMLInputElement>("attach-input").onchange = async event => {
 const input = event.target as HTMLInputElement, next = input.files?.[0]; input.value = ""; if (!next || !report) return;
 const probe = document.createElement("video"), url = URL.createObjectURL(next); probe.preload = "metadata"; probe.src = url;
 const duration = await new Promise<number>(resolve => { probe.onloadedmetadata = () => resolve(probe.duration); probe.onerror = () => resolve(NaN); });
 URL.revokeObjectURL(url);
 if (Number.isFinite(duration) && Math.abs(duration - report.duration) > .6) { toast(t("app.attachMismatch", { a: formatTime(duration), b: formatTime(report.duration) })); return; }
 setFile(next, undefined, true); toast(t("app.attached"));
};
function show(next: typeof view) {
 if (view === "live" && next !== "live") { live?.close(); live = null; }
 view = next;
 $("analysis-view").hidden = next !== "analysis"; $("history-view").hidden = next !== "history"; $("live-view").hidden = next !== "live";
 for (const v of ["analysis", "live", "history"]) $("nav-" + v).classList.toggle("active", v === next);
 $("page-label").textContent = t("nav." + next);
 if (next !== "analysis") { player.pause(); stopOverlay(); } else if (report && file) startOverlay();
}
$("nav-analysis").onclick = () => show("analysis");
async function showHistory() {
 show("history");
 await renderHistory($("history-list"), profile.id, {
  accent: profile.accent, busy: () => !!controller, dialog: openInfo,
  open: opened => { stopOverlay(); if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; file = null; player.removeAttribute("src"); player.load(); report = opened; source = opened.source; show("analysis"); $("dropzone").hidden = false; $("player-section").hidden = true; $("error").hidden = true; updateControls(); applyI18n(); renderCurrent(); toast(t("app.reopened")); }
 });
}
$("nav-history").onclick = () => { void showHistory(); };
async function openLive() {
 if (controller) { toast(t("app.waitAnalysis")); return; }
 show("live"); $<HTMLSelectElement>("live-exercise").value = settings.exercise; $("live-count").textContent = profile.id === "rg" ? "—" : "0";
 live = new LiveSession({
  profile, threshold: () => settings.threshold / 100, exercise: () => $<HTMLSelectElement>("live-exercise").value, model: () => models.find(m => m.id === settings.model) ?? models[0],
  error: e => { fail(e); show("analysis"); },
  finish: res => {
   live = null; show("analysis"); stopOverlay();
   if (res.samples.length < 5) { toast(t("live.tooShort")); return; }
   if (res.file) setFile(res.file, res.duration); else { file = null; $("dropzone").hidden = false; $("player-section").hidden = true; }
   const fps = Math.round(res.samples.length / Math.max(.1, res.duration));
   report = makeReport({ sport: profile.id, exercise: $<HTMLSelectElement>("live-exercise").value, fileName: res.file?.name ?? "live", samples: res.samples, fps, threshold: settings.threshold / 100, elapsedMs: res.elapsedMs, duration: res.duration, modelId: settings.model, source: "live", decode: "live", fileSize: res.file?.size });
   source = "live"; renderCurrent();
  }
 });
 try { await live.open(); } catch (error) { live?.close(); live = null; show("analysis"); fail(error instanceof DOMException ? new Error(t("live.permission")) : error); }
}
$("nav-live").onclick = () => { void openLive(); }; $("source-camera").onclick = () => { void openLive(); };
$("live-start").onclick = () => { void live?.start(); }; $("live-stop").onclick = () => { void live?.stop(); }; $("live-switch").onclick = () => { void live?.switchCamera(); };
$("live-countdown").onchange = () => { settings.countdown = Number($<HTMLSelectElement>("live-countdown").value); saveSettings(); };
$("live-voice").onchange = () => { settings.voice = $<HTMLInputElement>("live-voice").checked; saveSettings(); };
$("live-record").onchange = () => { settings.record = $<HTMLInputElement>("live-record").checked; saveSettings(); };
$("live-exercise").onchange = () => { settings.exercise = $<HTMLSelectElement>("live-exercise").value; $<HTMLSelectElement>("exercise").value = settings.exercise; saveSettings(); movementHint(); };
const info = $<HTMLDialogElement>("info-dialog");
function openInfo(html: string) { $("info-content").innerHTML = html; info.showModal(); }
$("close-info").onclick = () => info.close();
$("nav-guide").onclick = () => openInfo("<div class=\"eyebrow\">" + t("guide.eyebrow") + "</div><h2>" + t("guide.title") + "</h2><ol class=\"guide-list\">" + [1, 2, 3, 4].map(i => "<li>" + esc(t("sport." + profile.id + ".guide" + i)) + "</li>").join("") + "</ol><div class=\"notice\"><p>" + esc(t("sport." + profile.id + ".scope")) + "</p></div>");
$("privacy-info").onclick = async () => {
 let storage = t("privacy.noEstimate"), persisted = "";
 try { const e = await navigator.storage?.estimate(); if (e) storage = t("privacy.estimate", { used: ((e.usage ?? 0) / 1048576).toFixed(1), quota: ((e.quota ?? 0) / 1073741824).toFixed(1) }); } catch { /* ignore */ }
 try { persisted = (await navigator.storage?.persisted?.()) ? t("privacy.persisted") : t("privacy.notPersisted"); } catch { /* ignore */ }
 openInfo("<div class=\"eyebrow\">" + t("privacy.eyebrow") + "</div><h2>" + t("privacy.title") + "</h2>" + [1, 2, 3, 4].map(i => "<p>" + t("privacy.p" + i) + "</p>").join("") + "<p>" + esc(storage) + " " + esc(persisted) + "</p>");
};
window.addEventListener("pagehide", () => { controller?.abort(); live?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
setupPwa(extension, () => !!controller || !!live);
// Test hook for the automated browser QA (scripts/e2e.mjs); inert in normal use.
if (new URLSearchParams(location.search).has("e2e")) Object.assign(window, { __sportCoach: { report: () => report, busy: () => !!controller } });
applyI18n();
if (location.hash === "#live") void openLive();
