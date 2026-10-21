# Architecture and source mapping

## Product boundary

The user's final requirements override suggestions in the pasted conversation: three separate sports, Chromium + Firefox extensions and PWAs, local file/camera input, fully on-device MediaPipe and deterministic explanations. No page-video capture, server inference, LLM, analytics, accounts or billing.

The provided conversation supplies the local file → decoded frames → MediaPipe Worker → metrics/rules → optional local history architecture. The actual prompt-plan attachment mentioned in that conversation was not supplied; the implementation does not assume unseen requirements from it.

## Reused concepts from qwen36

The source workspace was read without modification:

- gym-vl-api-analysis/video-handler-service/src/pipeline/fitness_metrics.py: complete observed joint cycles, relative hysteresis 0.30, minimum 25° angular range, missing observations reset phase.
- boxing-vl-api-analysis/video-handler-service/src/pipeline/boxing_metrics.py: wrist height relative to body scale as a 2D observation, not a universal diagnosis of guard quality.
- rg-vl-api-analysis/video-handler-service/src/pipeline/coach_pipeline.py: body shape geometry and evidence-based abstention.
- Web frontends: local upload, camera, separate sport context and follow-up result workflow.

This is a new TypeScript implementation. COCO-WholeBody/RTMW's 133-point indices, Python runtime and scoring contracts are not copied into MediaPipe's 33-point schema. The existing local VLM, apparatus tracking, billing and CoP scoring pipelines are not browser-compatible features of this version.

## Runtime

File / recorded Blob → object URL → dedicated HTMLVideoElement → sequential seeks → downscaled canvas (max 960 px edge) → one transferable ImageBitmap → classic Worker → MediaPipe Lite → raw landmarks and flags → geometry → report.

The Worker is bundled independently as IIFE. MediaPipe's loader uses importScripts, which is not supported inside module Workers. GPU initialization falls back to CPU. An abort terminates the Worker, rejects outstanding requests and releases the video/object URL. The UI never stores decoded frame sequences.

Frames with no detected pose or multiple detected poses have no body measurements. Low-visibility, nonfinite, off-frame and degenerate required landmarks produce nulls. Normalized x/y coordinates are converted to image aspect-correct coordinates before measuring angles. World coordinates are not marketed as true calibrated biomechanics.

Metric median and P2/P98 range require >= 60% coverage and >= 4 observations. Cycles require a complete baseline → excursion → baseline, >= 25° range, >= 0.2 seconds, strictly increasing timestamps and no observation gap greater than 0.25 seconds. Sampling timestamps are requested video positions, not a guarantee that source frame timestamps differ by exactly that amount. No unsupported muscle-phase labels are inferred.

Reports retain timestamps, thresholds, model identity, sample landmarks, nulls, coverage and rule explanations. The model's visibility is an estimator output, not a guarantee of physical visibility or identity.

## Isolation and packaging

Each product has a distinct name, sport constant, output tree, IndexedDB database, PWA identity/scope/cache and extension identity. Shared source code is intentional; users never select between sports within one installed app.

Chromium Manifest V3 uses a background service worker that only opens index.html on action click. Firefox uses an event/background script. No host permissions are requested. The extension page and Worker use local assets with wasm-unsafe-eval only for WebAssembly.

PWA service workers precache the entire runtime, including both WASM variants and the model. Readiness is acknowledged after cache completion. Updates wait for old clients to close. Cache names include the built entry fingerprint, worker bytes and model digest.

## Validation scope

Pure geometry/cycle tests cover aspect ratio, missing evidence, partial cycles, temporal gaps, inverted extension cycles, ambiguous people and abstention. The browser test uses a two-second excerpt of a local real video and checks processing with the browser offline. It does not establish recognition accuracy, coaching validity, mobile performance or measurement calibration. Camera automation uses a synthetic browser device.
