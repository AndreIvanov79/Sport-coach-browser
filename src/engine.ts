import type { Landmark, ModelInfo } from "./types.ts";
export class EngineError extends Error { constructor(public code: string, message?: string) { super(message ?? code); } }
type Pending = { resolve: (v: any) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> };
/** MediaPipe Pose in a dedicated classic worker. One engine = one monotonic VIDEO timeline. */
export class PoseEngine {
 private worker: Worker; private pending = new Map<number, Pending>(); private seq = 0; private failed: Error | null = null; private lastTs = 0;
 delegate = "";
 private constructor(public model: ModelInfo) {
  this.worker = new Worker(new URL("./pose-worker.js", document.baseURI));
  this.worker.onerror = event => this.fail(new EngineError("worker", event.message));
  this.worker.onmessage = event => {
   const item = this.pending.get(event.data.id); if (!item) return;
   clearTimeout(item.timer); this.pending.delete(event.data.id);
   if (event.data.type === "error") item.reject(new EngineError(event.data.message === "webgl" ? "webgl" : "model", event.data.message)); else item.resolve(event.data);
  };
 }
 /** `?cpu` forces the WASM CPU delegate (broken GPU drivers, software-rendered test browsers). */
 static async create(model: ModelInfo, numPoses = 3): Promise<PoseEngine> {
  if (!("Worker" in window) || !("createImageBitmap" in window) || !("OffscreenCanvas" in window)) throw new EngineError("unsupported");
  const engine = new PoseEngine(model);
  const cpu = new URLSearchParams(location.search).has("cpu");
  try { const ready = await engine.request({ type: "init", base: new URL("./", document.baseURI).href, file: model.file, numPoses, cpu }, [], 120000); engine.delegate = ready.delegate; }
  catch (error) { engine.dispose(); throw error; }
  return engine;
 }
 private fail(error: Error) { this.failed = error; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
 private request(data: object, transfer: Transferable[] = [], timeout = 90000): Promise<any> {
  if (this.failed) return Promise.reject(this.failed);
  return new Promise((resolve, reject) => {
   const id = ++this.seq, timer = setTimeout(() => { this.pending.delete(id); reject(new EngineError("timeout")); }, timeout);
   this.pending.set(id, { resolve, reject, timer });
   try { this.worker.postMessage({ id, ...data }, transfer); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
  });
 }
 /** Timestamps must strictly increase for MediaPipe VIDEO mode. */
 async detect(bitmap: ImageBitmap, timeMs: number): Promise<Landmark[][]> {
  const ts = Math.max(this.lastTs + 1, Math.round(timeMs)); this.lastTs = ts;
  const res = await this.request({ type: "frame", bitmap, timestamp: ts }, [bitmap]);
  return res.poses as Landmark[][];
 }
 dispose() { this.worker.terminate(); this.fail(new EngineError("closed")); }
}
export const availableModels = (): ModelInfo[] => typeof __MODELS__ !== "undefined" && __MODELS__.length ? __MODELS__ : [{ id: "lite", file: "pose_landmarker_lite.task", bytes: 5777746 }];
