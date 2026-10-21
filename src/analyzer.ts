import type { ModelInfo, Sample } from "./types.ts";
import { EngineError, PoseEngine } from "./engine.ts";
import { lookPixels, sampleLooks } from "./core/appearance.ts";
export type Progress = { phase: "open" | "model" | "frames"; fraction: number; sample?: Sample };
export type AnalysisResult = { samples: Sample[]; duration: number; elapsedMs: number; decode: string; delegate: string; interrupted: boolean; processedDuration: number };
export class AnalysisAborted extends Error { constructor(public partial: AnalysisResult | null) { super("aborted"); this.name = "AbortError"; } }
const abortError = () => new DOMException("Aborted", "AbortError");
export function waitFor(target: EventTarget, type: string, signal: AbortSignal, timeout = 20000): Promise<void> {
 return new Promise((resolve, reject) => {
  const finish = (error?: unknown) => { clearTimeout(timer); target.removeEventListener(type, ok); target.removeEventListener("error", bad); signal.removeEventListener("abort", stop); error ? reject(error) : resolve(); };
  const ok = () => finish(), bad = () => finish(new EngineError("decode")), stop = () => finish(abortError());
  const timer = setTimeout(() => finish(new EngineError("video-timeout")), timeout);
  target.addEventListener(type, ok, { once: true }); target.addEventListener("error", bad, { once: true }); signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
 });
}
type FrameCb = (now: number, meta: { mediaTime: number }) => void;
type RvfcVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: FrameCb): number; cancelVideoFrameCallback(h: number): void };
/** Play until a frame at or after `target` is presented, pause and draw it synchronously (exact frame, real media time). */
function playUntil(video: RvfcVideo, target: number, draw: () => void, signal: AbortSignal, timeout = 4000): Promise<number | null> {
 return new Promise((resolve, reject) => {
  let handle = 0, done = false;
  const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); video.removeEventListener("ended", onEnd); signal.removeEventListener("abort", onAbort); try { video.cancelVideoFrameCallback(handle); } catch { /* noop */ } video.pause(); fn(); };
  const cb: FrameCb = (_now, meta) => { if (done) return; if (meta.mediaTime >= target - 1e-3) { video.pause(); draw(); finish(() => resolve(meta.mediaTime)); } else handle = video.requestVideoFrameCallback(cb); };
  const onEnd = () => finish(() => resolve(null)), onAbort = () => finish(() => reject(abortError()));
  const timer = setTimeout(() => finish(() => reject(new EngineError("rvfc-timeout"))), timeout);
  video.addEventListener("ended", onEnd); signal.addEventListener("abort", onAbort);
  handle = video.requestVideoFrameCallback(cb);
  video.play().catch(error => finish(() => reject(error)));
 });
}
async function seekTo(video: HTMLVideoElement, target: number, draw: () => void, signal: AbortSignal): Promise<number> {
 if (Math.abs(video.currentTime - target) > 1e-4) { const sought = waitFor(video, "seeked", signal); video.currentTime = target; await sought; }
 draw(); return target;
}
export async function analyzeVideo(file: File, options: { fps: number; signal: AbortSignal; model: ModelInfo; durationOverride?: number; decode?: "auto" | "seek"; progress: (p: Progress) => void }): Promise<AnalysisResult> {
 const started = performance.now(), video = document.createElement("video") as RvfcVideo, url = URL.createObjectURL(file), host = document.createElement("div");
 // Kept in the document (tiny, transparent) so browsers present frames and fire requestVideoFrameCallback.
 host.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:.01;pointer-events:none;z-index:-1";
 video.muted = true; video.playsInline = true; video.preload = "auto"; host.appendChild(video); document.body.appendChild(host);
 let engine: PoseEngine | null = null;
 const samples: Sample[] = []; let duration = 0, decode = "seek", usedPlay = false, usedSeek = false;
 const result = (interrupted: boolean): AnalysisResult => ({ samples, duration, elapsedMs: performance.now() - started, decode, delegate: engine?.delegate ?? "", interrupted, processedDuration: samples.length ? samples[samples.length - 1].time : 0 });
 const stop = () => engine?.dispose();
 options.signal.addEventListener("abort", stop, { once: true });
 try {
  if (options.signal.aborted) throw abortError();
  options.progress({ phase: "open", fraction: 0 });
  const loaded = waitFor(video, "loadeddata", options.signal); video.src = url; await loaded;
  duration = Number.isFinite(video.duration) ? video.duration : options.durationOverride ?? 0;
  if (!duration || duration <= 0) throw new EngineError("no-duration");
  if (duration > 600) throw new EngineError("too-long");
  options.progress({ phase: "model", fraction: 0 });
  engine = await PoseEngine.create(options.model);
  const width = video.videoWidth, height = video.videoHeight; if (!width || !height) throw new EngineError("no-video");
  const ratio = Math.min(1, 960 / Math.max(width, height)), canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
  const ctx = canvas.getContext("2d", { alpha: false }); if (!ctx) throw new EngineError("canvas");
  const draw = () => ctx.drawImage(video, 0, 0, canvas.width, canvas.height), lookCanvas = document.createElement("canvas");
  let mode: "playback" | "seek" = "requestVideoFrameCallback" in HTMLVideoElement.prototype && options.decode !== "seek" ? "playback" : "seek";
  video.playbackRate = options.fps <= 10 ? 3 : options.fps <= 15 ? 2 : 1;
  const count = Math.ceil(duration * options.fps);
  for (let index = 0; index < count; index++) {
   if (options.signal.aborted) throw abortError();
   const target = Math.min(index / options.fps, Math.max(0, duration - .01));
   let time: number | null;
   if (index === 0 && video.currentTime < 1e-3) { draw(); time = 0; }
   else if (mode === "playback" && !document.hidden) {
    try { time = await playUntil(video, target, draw, options.signal); usedPlay = true; }
    catch (error) {
     if (error instanceof DOMException && error.name === "AbortError") throw error;
     mode = "seek"; time = await seekTo(video, target, draw, options.signal); usedSeek = true;
    }
   } else { time = await seekTo(video, target, draw, options.signal); usedSeek = true; }
   if (time === null) break;
   if (samples.length && time <= samples[samples.length - 1].time + 1e-6) continue;
   const bitmap = await createImageBitmap(canvas);
   if (options.signal.aborted) { bitmap.close(); throw abortError(); }
   const poses = await engine.detect(bitmap, time * 1000), px = poses.length ? lookPixels(lookCanvas, canvas, canvas.width, canvas.height) : null;
   const sample: Sample = { time, width, height, landmarks: poses[0] ?? [], candidates: poses, looks: px ? sampleLooks(px, poses) : undefined, people: poses.length, reason: poses.length ? undefined : "no-pose" };
   samples.push(sample);
   options.progress({ phase: "frames", fraction: Math.min(1, (index + 1) / count), sample });
  }
  decode = usedPlay && usedSeek ? "mixed" : usedPlay ? "playback" : "seek";
  return result(false);
 } catch (error) {
  decode = usedPlay && usedSeek ? "mixed" : usedPlay ? "playback" : "seek";
  if ((error instanceof DOMException && error.name === "AbortError") || (options.signal.aborted && error instanceof EngineError && error.code === "closed")) throw new AnalysisAborted(samples.length ? result(true) : null);
  throw error;
 } finally {
  options.signal.removeEventListener("abort", stop); engine?.dispose();
  video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); host.remove();
 }
}
