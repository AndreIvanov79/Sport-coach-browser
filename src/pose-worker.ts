import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
let detector: PoseLandmarker | null = null;
const scope = self as unknown as DedicatedWorkerGlobalScope;
const round = (v: number) => Math.round(v * 1e5) / 1e5;
// Bundled as a classic worker: the MediaPipe WASM loader uses importScripts.
scope.onmessage = async (event: MessageEvent) => {
 const { id, type } = event.data;
 try {
  if (type === "init") {
   const vision = await FilesetResolver.forVisionTasks(event.data.base + "vendor");
   const options = {
    baseOptions: { modelAssetPath: event.data.base + "models/" + event.data.file, delegate: "GPU" as const }, runningMode: "VIDEO" as const,
    numPoses: event.data.numPoses ?? 3, minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5
   };
   let delegate: "CPU" | "GPU" = event.data.cpu ? "CPU" : "GPU";
   try { detector = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate } }); }
   catch { delegate = "CPU"; detector = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" } }); }
   scope.postMessage({ id, type: "ready", delegate });
  } else if (type === "frame") {
   const bitmap = event.data.bitmap as ImageBitmap;
   try {
    if (!detector) throw new Error("model-not-ready");
    const result = detector.detectForVideo(bitmap, event.data.timestamp);
    const poses = result.landmarks.map(lm => lm.map(p => ({ x: round(p.x), y: round(p.y), z: round(p.z), visibility: round(p.visibility ?? 0), presence: round((p as { presence?: number }).presence ?? 1) })));
    scope.postMessage({ id, type: "pose", poses });
   } finally { bitmap.close(); }
  } else if (type === "close") { detector?.close(); detector = null; scope.postMessage({ id, type: "closed" }); }
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  scope.postMessage({ id, type: "error", message: /GLctx|WebGL|GL context|activeTexture/i.test(message) ? "webgl" : message });
 }
};
