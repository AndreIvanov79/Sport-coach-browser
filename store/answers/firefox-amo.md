# Firefox Add-ons (addons.mozilla.org): ответы для формы

Регистрация бесплатная (аккаунт Mozilla). Пакет: `artifacts/packages/<sport>-firefox.zip`.
Исходники для ревьюера: `artifacts/packages/sport-coach-source.zip` (собирается `npm run package`).
Картинки: `artifacts/store/<sport>/desktop/<lang>/` (после `npm run store:assets`).

## Загрузка

1. Developer Hub → Submit a New Add-on → **On this site** (публичный листинг на AMO).
2. Загрузить `<sport>-firefox.zip`. Совместимость: Firefox for desktop 140+ (Android не отмечать: в манифесте нет `gecko_android`).
   Перед загрузкой можно прогнать тот же линтер, что у AMO: `npx addons-linter dist/<sport>/firefox` (0 ошибок; предупреждения
   про innerHTML объяснены в заметке ниже).
3. «Do you need to submit source code?» → **Yes**: сборка Vite минифицирует код. Загрузить `sport-coach-source.zip`.

ID расширений зафиксированы в манифесте: `fitness@sport-coach.local`, `boxing@sport-coach.local`, `rg@sport-coach.local`.
После первой публикации ID менять нельзя.

## Notes to reviewer (вставить целиком)

```
How to build (reproduces dist/<sport>/firefox exactly):
  Requirements: Node.js 22.18 or newer (tested with 22.22), npm 10, internet access to registry.npmjs.org
  and storage.googleapis.com. Any OS.
  1. unzip sport-coach-source.zip && cd into it
  2. npm ci
  3. npm run build
  The add-on is in dist/fitness/firefox, dist/boxing/firefox and dist/rg/firefox.

What the build does (scripts/build.mjs):
  - type-checks (tsc) and runs the unit tests;
  - bundles src/ with Vite 8 (minified) and the pose worker as one IIFE file;
  - copies the MediaPipe Tasks Vision 0.10.32 WebAssembly runtime unmodified from node_modules/@mediapipe/tasks-vision/wasm;
  - downloads the official MediaPipe pose landmarker models (lite, full, heavy) from storage.googleapis.com
    and verifies their SHA-256 against assets-lock.json;
  - writes manifest.json and _locales (en, ru, ro) from store/listings.

Third-party code: @mediapipe/tasks-vision 0.10.32 (Apache-2.0), unmodified. No other runtime dependencies.

innerHTML: the linter warns about innerHTML in assets/index-*.js. The markup comes from the app's own templates
and translation strings; values from user files (file names, imported reports) are escaped (esc() in src/ui/dom.ts)
or validated (validateImport in src/ui/history-view.ts). The CSP forbids inline scripts.

Behaviour: no permissions, no network requests, no remote code, no data collection
(data_collection_permissions: required ["none"]). Video files chosen by the user and the camera stream are processed
locally in a Web Worker. Reports the user saves are kept in IndexedDB on the device.

To test: click the toolbar icon (opens the app in a tab), choose any short training video, press "Analyse".
```

## Listing

| Поле | Значение |
|---|---|
| Name | `name` из листинга |
| Add-on URL | `fitness-coach`, `boxing-coach`, `rhythm-coach` (если свободны) |
| Summary | `amoSummary` (≤ 250) |
| Description | `description` |
| Categories | `categories.firefox` (Photos, Music & Videos; вторую можно не выбирать) |
| Support e-mail | контактный e-mail |
| Support website | `<SITE>` |
| License | выбрать самим: «All Rights Reserved», если код не открыт; MIT/Apache-2.0, если хотите открыть |
| Privacy policy | вставить текст английской части `<SITE>privacy/` или ссылку на неё |
| Screenshots | `desktop/<lang>/1280x800-1..5.jpg` |
| Icon | берётся из пакета (128×128) |
| Experimental | No |
| Requires payment | No |

Переводы листинга (Russian, Romanian) добавляются после публикации: Edit Product Page → выбрать язык.

Автоматическая проверка проходит сразу, ручная проверка исходников может занять от нескольких дней до пары недель.
