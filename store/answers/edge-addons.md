# Microsoft Edge Add-ons: ответы для формы

Регистрация в Partner Center бесплатная (аккаунт Microsoft → Edge program → Individual).
Пакет тот же, что для Chrome: `artifacts/packages/<sport>-chromium.zip`. Картинки: `artifacts/store/<sport>/` (после `npm run store:assets`).

## Packages

Загрузить `<sport>-chromium.zip`. Имя и описание Edge возьмёт из `manifest.json` (локализованы через `_locales`: en, ru, ro).

## Availability

- Visibility: Public (или Hidden для проверки по прямой ссылке).
- Markets: все.

## Properties

| Поле | Значение |
|---|---|
| Category | `categories.edge` из листинга (Sports) |
| Privacy policy requirements | **No**: the extension does not access, collect or transmit personal information |
| Privacy policy URL | `<SITE>privacy/` (необязательно при ответе No, но лучше указать) |
| Website URL | `<SITE>` |
| Support contact | контактный e-mail из `store/config.json` |
| Mature content | No |

## Store listings (для каждого языка: English, Russian, Romanian)

| Поле | Значение |
|---|---|
| Description | `description` из листинга (250–5000 символов, наши ≈1500) |
| Extension Store logo | `logo-300.png` (300×300) |
| Small promotional tile | `promo-440x280-<lang>.jpg` (необязательно) |
| Large promotional tile | `marquee-1400x560-<lang>.jpg` (необязательно) |
| Screenshots | `desktop/<lang>/1280x800-1..5.jpg` (до 10) |
| Short description | `summary` из листинга |
| Search terms | Fitness: `workout, exercise form, rep counter, squat, push-up, pose`; Boxing: `boxing, punch, sparring, shadow boxing, technique, pose`; Rhythm: `rhythmic gymnastics, leaps, balance, split, FIG, pose` (до 21 слова) |

## Notes for certification

```
No account or login is needed. Click the toolbar icon: the app opens in a new tab.
Choose any short video of a person training (or allow the camera in "Live") and press "Analyse".
The extension requests no permissions and makes no network requests: all code, the MediaPipe WebAssembly
runtime and the pose models are packaged. Content Security Policy: script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'.
Source code and build instructions are available on request.
```

Проверка в Edge обычно занимает до 7 рабочих дней.
