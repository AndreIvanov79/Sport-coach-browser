# Architecture (v0.2)

## Product boundary

Three separate products (fitness, boxing, rhythmic gymnastics) built from one TypeScript core; each ships as a PWA, a Chromium MV3 extension and a Firefox MV3 extension. Analysis runs entirely on the device: MediaPipe Pose Landmarker in a Web Worker, deterministic metrics and rule-based findings. No server inference, LLM, analytics, accounts or billing.

## Pipeline

File / recording → decoder (requestVideoFrameCallback playback, seek fallback) → downscaled frame (max 960 px) → transferable ImageBitmap → classic Worker → MediaPipe (Lite/Full/Heavy, up to 3 people) → samples with all candidates and their clothing colours (`core/appearance.ts`: mean torso/thigh RGB from a 256 px copy of the frame, memory only) →
`core/track.ts` athlete selection and identity tracking → `core/body.ts` observed landmarks + bridged gaps (≤ 0.3 s) → `core/series.ts` per-frame series (joint angles, trunk, head, split, leg lift, guard, depth) → sport analysis (`sports/*`) → findings ranking → report.

Live mode runs the same engine on camera frames while MediaRecorder records; samples are aligned to the recording clock, so the report needs no second decoding pass.

## Ported from qwen36 (deterministic parts only)

| Browser module | qwen36 source |
| --- | --- |
| `core/track.ts` | select_main_person / pose track continuity (position + scale gates, re-acquisition); browser addition: clothing-colour cost and rejection so crossing partners do not swap identity |
| `core/body.ts` | mask_and_interpolate (short-gap bridging), pose_reliability (limb-length plausibility) |
| `core/cycles.ts` | fitness_metrics._observed_cycles, detect_gym_driver (ROM ≥ 25°, hysteresis 0.30) |
| `core/segments.ts` | segmentation.motion_envelope, hold_duration_metric |
| `core/findings.ts` | *_findings.extract_findings: MIN_COUNT 2, MIN_SHARE 0.3, severity ranking, ≤ 3 faults / 3 strengths, focus |
| `sports/fitness*.ts` | fitness_metrics (tempo, asymmetry, hip sag, depth, stance, foot split, prone support, wrist travel, hands overhead), fitness_vlm_prior.EXPECTATIONS (37 exercises, metrics-only fallback with dominance), fitness_findings thresholds |
| `sports/boxing.ts` | boxing_metrics (rotation extent with deadband/glitch rejection, guard vs nose, stance, head offset), strike signature, boxing_findings thresholds |
| `sports/rg*.ts` | rg_spatial (support, flight with take-off, free/support leg, profile-passage half turns, still shape), recognition_profiles.json, body_difficulties.json families, FIG 2.5 split bands, judging_rules group minimum; browser additions: a flight needs a plausibly long lowest leg (Lite collapses legs in ring/split poses), short low "flights" inside a turn sequence are treated as relevé, profile passages are not smoothed below 20 fps (a fast turn is in profile for ~1 frame at 15 fps) and a turn needs an upright body rather than a detected sole contact, but is rejected while the model folds a leg (held ring/split balances in profile flicker like turns) or the athlete pivots on two flat feet, shape stillness uses a 3-frame median |

Thresholds are coach heuristics or engineering gates exactly as in qwen36, not new sports rules. Two browser-only additions are documented in code: a `standing` predicate that separates leg press from squat (no VLM to disambiguate), and per-repetition facts (qwen36 used VLM segments; here each complete observed cycle is one unit).

## Honesty rules

- Medians, extremes and coverage use only observed landmarks; bridged values feed cycles and charts only.
- A metric needs ≥ 60% coverage and ≥ 4 values; otherwise it is reported as not assessed.
- Ambiguous exercise geometry yields candidates, never a guess.
- 2D split angles are review candidates and are kept out of the E estimate; no total RG score is produced.
- Voice prompts use on-device voices only (`localService`); network voices would send the spoken text to a speech service.

## Storage and packaging

IndexedDB v2 per sport: `reports` (landmarks packed into Float32Array) and `summaries` (history list, trends, comparison). v1 records are migrated on upgrade. Reports are re-derived from landmarks on open (`refreshReport`), so code improvements apply to old reports.

PWA service worker precaches the app, both WASM variants and the Lite model; optional Full/Heavy models are cached on first use in a separate cache that survives app updates. A waiting worker is applied only after the user presses “Update” (or when an analysis ends). Extensions include every built model and request no permissions.
