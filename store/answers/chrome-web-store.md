# Chrome Web Store: ответы для формы

Три отдельных товара (Fitness Coach, Boxing Coach, Rhythm Coach). Пакет: `artifacts/packages/<sport>-chromium.zip`
(после `npm run build && npm run package`). Тексты листинга: `artifacts/store/<sport>.md` (после `npm run store`).
Картинки: `artifacts/store/<sport>/` (после `npm run store:assets`).

Ответы ниже на английском: так их читают ревьюеры. `<SITE>` — значение `siteUrl` из `store/config.json`.

## Store listing

| Поле | Значение |
|---|---|
| Description | `description` из листинга (en; ru и ro добавляются как переводы) |
| Category | см. `categories.chrome` в `store/listings/<sport>.json` (Lifestyle → Health & Fitness или ближайшая спортивная) |
| Language | English (основной), затем Russian и Romanian |
| Store icon | `icon-128.png` (тот же значок, что внутри пакета) |
| Screenshots | `desktop/<lang>/1280x800-1..5.jpg` (до 5 на язык) |
| Small promo tile | `promo-440x280-<lang>.jpg` (обязательно) |
| Marquee | `marquee-1400x560-<lang>.jpg` (необязательно) |
| Official URL / Homepage | `<SITE>` |
| Support URL | `<SITE>` или `mailto:` контактного адреса |
| Mature content | No |

## Privacy practices

**Single purpose description**

- Fitness: `Analyses a workout video chosen by the user, or the live camera, on the device: recognises the exercise, counts reps and measures technique.`
- Boxing: `Analyses a boxing training video chosen by the user, or the live camera, on the device: finds strikes and measures guard, rotation and stance.`
- Rhythm: `Analyses a rhythmic gymnastics video chosen by the user, or the live camera, on the device: finds leaps, balances, turns and flexibility elements.`

**Permission justification**: расширение не запрашивает ни одного разрешения (`permissions` и `host_permissions` отсутствуют).
Если форма всё же покажет поле, ответ: `The extension requests no permissions. Clicking the toolbar icon opens the extension's own page in a new tab.`

**Are you using remote code?** → **No, I am not using Remote code.**
Пояснение (если попросят): `All JavaScript, the MediaPipe WebAssembly runtime and the pose models are packaged inside the extension. The Content Security Policy is script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'. Nothing is loaded from the network.`

**Data usage**: не отмечать ни одной категории (Personally identifiable information, Health information, … — ничего).
Пояснение: видео и результаты обрабатываются только на устройстве и никуда не передаются. По определению Chrome Web Store это не «сбор» данных.

Отметить все три подтверждения:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: `<SITE>privacy/`

## Distribution

- Visibility: Public (или Unlisted для первой проверки — ставится по ссылке, в поиске не виден).
- Regions: All regions.
- Payments: Free.

## Test instructions (поле для ревьюера)

```
No account or login is needed. Click the toolbar icon: the app opens in a new tab.
Choose any short video of a person training (or allow the camera in "Live") and press "Analyse".
Everything runs locally with the bundled MediaPipe model; the extension makes no network requests.
```

## Аккаунт разработчика

- Регистрационный взнос $5 один раз (до 20 товаров на аккаунт).
- Нужна двухэтапная аутентификация Google и подтверждённый контактный e-mail.
- Trader / non-trader (для ЕС): для бесплатного некоммерческого проекта обычно «non-trader». Если вы продаёте услуги
  тренера или это часть бизнеса — «trader», тогда адрес и телефон будут показаны покупателям в ЕС.
