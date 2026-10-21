import type { Landmark, ModelInfo, Profile, Sample } from "../types.ts";
import { PoseEngine } from "../engine.ts";
import { observed, buildBody } from "../core/body.ts";
import { FRAMING } from "../core/landmarks.ts";
import { personGeometry, type Geo } from "../core/track.ts";
import { blendLook, lookDistance, lookPixels, sampleLooks, type Look, type Pixels } from "../core/appearance.ts";
import { metricsFor } from "../core/series.ts";
import { detectCycles, inferInverted, pickDriver } from "../core/cycles.ts";
import { extensionEvents } from "../sports/boxing.ts";
import { speechLang, t } from "../i18n/index.ts";
import { prepare, drawLandmarks, videoBox } from "./overlay.ts";
import { $, formatTime, toast } from "./dom.ts";
export type LiveResult = { samples: Sample[]; duration: number; file: File | null; elapsedMs: number; delegate: string };
export type LiveHooks = { profile: Profile; threshold: () => number; exercise: () => string; model: () => ModelInfo; finish: (r: LiveResult) => void; error: (e: unknown) => void };
type Check = { id: string; ok: boolean; warn?: boolean };
export function framingChecks(lms: Landmark[] | null, people: number, threshold: number): Check[] {
 const found = !!lms?.length;
 const pts = found ? FRAMING.map(k => lms![k]) : [];
 const full = found && pts.every(p => observed(p, threshold) && p.x > .02 && p.x < .98 && p.y > .02 && p.y < .98);
 const ys = pts.filter(p => p && Number.isFinite(p.y)).map(p => p.y), height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
 return [{ id: "person", ok: found }, { id: "full", ok: full }, { id: "size", ok: found && height >= .35 }, { id: "single", ok: people <= 1, warn: true }];
}
export class LiveSession {
 private stream: MediaStream | null = null; private engine: PoseEngine | null = null; private running = false; private busy = false;
 private facing: "user" | "environment" = "environment"; private last: Geo | null = null; private look: Look | null = null; private lookCanvas = document.createElement("canvas"); private readySince = 0; private announcedReady = false;
 private state: "idle" | "countdown" | "recording" = "idle"; private recStart = 0; private samples: Sample[] = []; private recorder: MediaRecorder | null = null;
 private chunks: BlobPart[] = []; private count = 0; private lastCount = 0; private timer: ReturnType<typeof setInterval> | null = null; private wake: { release(): Promise<void> } | null = null;
 private video = $<HTMLVideoElement>("live-video"); private canvas = $<HTMLCanvasElement>("live-overlay");
 constructor(private hooks: LiveHooks) {}
 private warnedVoice = false;
 /** On-device voices only: a network voice would send the spoken text to a speech service. */
 private voice(): SpeechSynthesisVoice | null {
  const lang = speechLang().toLowerCase(), base = lang.split("-")[0], local = speechSynthesis.getVoices().filter(v => v.localService);
  return local.find(v => v.lang.toLowerCase().replace("_", "-") === lang) ?? local.find(v => v.lang.toLowerCase().split(/[-_]/)[0] === base) ?? null;
 }
 speak(text: string) {
  if (!$<HTMLInputElement>("live-voice").checked || !("speechSynthesis" in window)) return;
  try {
   const voice = this.voice();
   if (!voice) { if (!this.warnedVoice && speechSynthesis.getVoices().length) { this.warnedVoice = true; toast(t("live.noLocalVoice")); } return; }
   const u = new SpeechSynthesisUtterance(text); u.voice = voice; u.lang = voice.lang; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* ignore */ }
 }
 async open(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("live.noCamera"));
  if ("speechSynthesis" in window) speechSynthesis.getVoices(); // starts asynchronous voice loading
  await this.startCamera();
  $("live-message").textContent = t("live.loadingModel");
  this.engine = await PoseEngine.create(this.hooks.model());
  $("live-message").textContent = t("live.position");
  this.running = true; this.loop();
  try { this.wake = await (navigator as unknown as { wakeLock?: { request(type: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { this.wake = null; }
 }
 private async startCamera() {
  this.stream?.getTracks().forEach(tr => tr.stop());
  this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
  this.video.srcObject = this.stream; this.video.classList.toggle("mirror", this.facing === "user");
  await this.video.play().catch(() => undefined);
 }
 async switchCamera() { if (this.state === "recording") return; this.facing = this.facing === "user" ? "environment" : "user"; try { await this.startCamera(); } catch (e) { this.hooks.error(e); } }
 private loop() {
  if (!this.running) return;
  const next = () => { const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }; if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.loop()); else requestAnimationFrame(() => this.loop()); };
  if (!this.busy && this.engine && this.video.videoWidth) {
   this.busy = true;
   const captured = performance.now(), px = lookPixels(this.lookCanvas, this.video, this.video.videoWidth, this.video.videoHeight);
   createImageBitmap(this.video).then(bitmap => this.engine!.detect(bitmap, captured)).then(poses => this.process(poses, captured, px)).catch(e => { if (this.running) this.hooks.error(e); this.running = false; }).finally(() => { this.busy = false; });
  }
  next();
 }
 private pick(poses: Landmark[][], w: number, h: number, looks?: (Look | null)[]): number {
  let best = -1, score = Infinity;
  poses.forEach((lms, k) => {
   const g = personGeometry(lms, w, h); if (!g) return;
   const l = this.look && looks?.[k] ? lookDistance(this.look, looks[k]!) : null;
   const s = this.last ? Math.hypot(g.cx - this.last.cx, g.cy - this.last.cy) / this.last.scale + 3 * (l ?? .12) : -g.height;
   if (s < score) { score = s; best = k; }
  });
  if (best >= 0) { this.last = personGeometry(poses[best], w, h); const lk = looks?.[best]; if (lk && (poses.length === 1 || !this.look)) this.look = this.look ? blendLook(this.look, lk, .1) : lk; }
  return best;
 }
 private process(poses: Landmark[][], captured: number, px: Pixels | null) {
  const looks = px && poses.length ? sampleLooks(px, poses) : undefined;
  const w = this.video.videoWidth, h = this.video.videoHeight, k = this.pick(poses, w, h, looks), athlete = k >= 0 ? poses[k] : null;
  const ctx = prepare(this.canvas);
  if (ctx) {
   const box = videoBox(this.canvas, w, h), accent = this.hooks.profile.accent, mirror = this.facing === "user";
   poses.forEach((lms, i) => { if (i !== k) drawLandmarks(ctx, lms, box, { accent: "#ffffff", threshold: .5, dim: true, mirror }, { w, h }); });
   if (athlete) drawLandmarks(ctx, athlete, box, { accent, threshold: this.hooks.threshold(), mirror, angles: [[23, 25, 27], [24, 26, 28], [11, 13, 15], [12, 14, 16]] }, { w, h });
  }
  const checks = framingChecks(athlete, poses.length, this.hooks.threshold());
  $("live-checks").innerHTML = checks.map(c => "<li class=\"" + (c.ok ? "ok" : c.warn ? "warn" : "bad") + "\">" + t("live.check." + c.id + (c.ok ? ".ok" : ".bad")) + "</li>").join("");
  const ready = checks.filter(c => !c.warn).every(c => c.ok), now = performance.now();
  if (!ready) { this.readySince = 0; this.announcedReady = false; } else if (!this.readySince) this.readySince = now;
  const stable = ready && now - this.readySince >= 1000;
  $("live-ready").className = "live-ready " + (stable ? "ok" : "bad"); $("live-ready").textContent = t(stable ? "live.ready" : "live.notReady");
  if (stable && !this.announcedReady && this.state === "idle") { this.announcedReady = true; this.speak(t("live.voiceReady")); }
  if (this.state === "recording") {
   const time = (captured - this.recStart) / 1000; if (time < 0) return;
   this.samples.push({ time, width: w, height: h, landmarks: athlete ?? [], candidates: poses, looks, people: poses.length, reason: poses.length ? undefined : "no-pose" });
  }
 }
 private updateCount() {
  const elapsed = (performance.now() - this.recStart) / 1000; $("live-timer").textContent = formatTime(elapsed) + " / 5:00";
  if (elapsed >= 300) { void this.stop(); return; }
  if (this.samples.length < 10) return;
  const sport = this.hooks.profile.id, body = buildBody(this.samples.map(s => ({ ...s, candidates: undefined, looks: undefined })), this.hooks.threshold());
  if (sport === "fitness") {
   const ex = this.hooks.profile.exercises.find(e => e.id === this.hooks.exercise());
   const metrics = metricsFor(body, ["leftKnee", "rightKnee", "leftElbow", "rightElbow", "leftHip", "rightHip", "leftShoulder", "rightShoulder"]);
   const d = ex?.driver ? pickDriver(metrics, [ex.driver]) : pickDriver(metrics);
   this.count = d ? detectCycles(d.metric.series, body.times, ex?.inverted ?? inferInverted(d.metric.series)).length : 0;
  } else if (sport === "boxing") {
   const metrics = metricsFor(body, ["leftElbow", "rightElbow"]);
   this.count = metrics.reduce((a, m) => a + extensionEvents(m.series, body.times).length, 0);
  } else { this.count = 0; }
  $("live-count").textContent = sport === "rg" ? "—" : String(this.count);
  if (this.count > this.lastCount) { this.lastCount = this.count; this.speak(String(this.count)); }
 }
 async start() {
  if (this.state !== "idle" || !this.stream) return;
  if ($("live-ready").classList.contains("bad")) toast(t("live.startAnyway"));
  this.state = "countdown"; ($("live-start") as HTMLButtonElement).disabled = true; ($("live-stop") as HTMLButtonElement).disabled = false;
  const n = Number(($("live-countdown") as HTMLSelectElement).value);
  for (let i = n; i > 0; i--) { if (this.state !== "countdown") return; $("live-big").textContent = String(i); $("live-big").hidden = false; this.speak(String(i)); await new Promise(r => setTimeout(r, 1000)); }
  if (this.state !== "countdown") return;
  $("live-big").hidden = true; this.speak(t("live.voiceStart"));
  this.samples = []; this.count = this.lastCount = 0; this.chunks = []; $("live-count").textContent = this.hooks.profile.id === "rg" ? "—" : "0";
  if (($("live-record") as HTMLInputElement).checked && "MediaRecorder" in window) {
   const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(m => MediaRecorder.isTypeSupported(m));
   this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : {});
   this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
   this.recorder.start(1000);
  }
  this.recStart = performance.now(); this.state = "recording"; $("live-message").textContent = t("live.recording");
  this.timer = setInterval(() => this.updateCount(), 500);
 }
 async stop() {
  if (this.state === "countdown") { this.state = "idle"; $("live-big").hidden = true; ($("live-start") as HTMLButtonElement).disabled = false; return; }
  if (this.state !== "recording") return;
  this.state = "idle"; if (this.timer) clearInterval(this.timer); this.timer = null;
  const duration = (performance.now() - this.recStart) / 1000; this.speak(t("live.voiceStop"));
  let file: File | null = null;
  if (this.recorder) {
   const rec = this.recorder; this.recorder = null;
   await new Promise<void>(resolve => { rec.onstop = () => resolve(); rec.stop(); });
   const type = rec.mimeType || "video/webm";
   if (this.chunks.length) file = new File([new Blob(this.chunks, { type })], "live-" + new Date().toISOString().replace(/[:.]/g, "-") + (type.includes("mp4") ? ".mp4" : ".webm"), { type });
  }
  const samples = this.samples; this.samples = [];
  const delegate = this.engine?.delegate ?? "";
  this.close();
  this.hooks.finish({ samples, duration, file, elapsedMs: duration * 1000, delegate });
 }
 close() {
  this.running = false; if (this.timer) clearInterval(this.timer); this.timer = null;
  if (this.recorder?.state === "recording") { this.recorder.ondataavailable = null; this.recorder.stop(); } this.recorder = null;
  this.stream?.getTracks().forEach(tr => tr.stop()); this.stream = null; this.video.srcObject = null;
  this.engine?.dispose(); this.engine = null; this.state = "idle"; void this.wake?.release().catch(() => undefined); this.wake = null;
  const ctx = prepare(this.canvas); void ctx; ($("live-start") as HTMLButtonElement).disabled = false; ($("live-stop") as HTMLButtonElement).disabled = true; $("live-big").hidden = true;
 }
}
