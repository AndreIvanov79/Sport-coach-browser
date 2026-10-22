# Публикация: сайт, магазины расширений, Google Play

Здесь всё, что нужно, чтобы выпустить Fitness Coach, Boxing Coach и Rhythm Coach: сайт с тремя PWA, политикой
конфиденциальности и условиями, расширения в Chrome Web Store, Microsoft Edge Add-ons и Firefox Add-ons и приложения
в Google Play. Регистрацию аккаунтов, оплату взносов и отправку на проверку делаете вы: это действия от вашего имени.

## Что лежит в репозитории

| Файл | Что это |
|---|---|
| `store/config.json` | ваши данные: адрес сайта, публичный e-mail, имя издателя, префикс Android-пакетов, отпечатки ключей Play, ссылки на магазины |
| `store/listings/<sport>.json` | тексты для магазинов на en/ru/ro: название, короткое и полное описание, категории |
| `store/answers/*.md` | готовые ответы на формы каждого магазина (приватность, разрешения, рейтинг, Data safety…) |
| `store/answers/testers-invite.md` | приглашение 12+ тестировщиков для Google Play |
| `store/screenshots.json` | какие ролики снимать для скриншотов |
| `site/` | шаблоны страниц политики конфиденциальности и условий (en/ru/ro) и стили сайта |
| `scripts/site.mjs` | `npm run site`: собирает сайт в `dist/site` |
| `scripts/store.mjs` | `npm run store`: проверяет длины текстов, пишет листы для копирования в `artifacts/store/<sport>.md` |
| `scripts/store-assets.mjs` | `npm run store:assets`: скриншоты, промо-плитки, графика для Play, значки |
| `scripts/twa.mjs` | `npm run twa`: проекты Android (Trusted Web Activity) для Bubblewrap в `android/<sport>/` |
| `store/github-pages.yml` | workflow публикации сайта на GitHub Pages при каждом push (скопировать в `.github/workflows/`) |

## Порядок

1. Заполнить `store/config.json`.
2. Опубликовать сайт (нужен для PWA, ссылок на политику и для Google Play).
3. Подготовить скриншоты.
4. Chrome Web Store, Edge, Firefox — можно параллельно.
5. Google Play — дольше всего из-за закрытого теста 14 дней.

## 1. store/config.json

| Поле | Пример | Где видно |
|---|---|---|
| `siteUrl` | `https://ivan.github.io` или `https://sportcoach.md` | сайт, ссылки в магазинах, Android |
| `contactEmail` | отдельный ящик для приложений | публично: на сайте, в политике, во всех магазинах |
| `developerName` | имя или название проекта | политика, условия, магазины |
| `androidPackagePrefix` | `io.github.ivan.sportcoach` | ID приложений в Play: `.fitness`, `.boxing`, `.rg`; после публикации не меняется |
| `policyDate` | `2026-10-22` | дата вступления политики в силу |
| `playSigningSha256` | заполняется после первой загрузки в Play | `/.well-known/assetlinks.json` |
| `storeLinks` | ссылки на страницы в магазинах | кнопки «Установить» на главной странице сайта |

Публичный e-mail увидят все: удобнее завести отдельный ящик. Пока в файле остаются значения `YOUR_…`,
`npm run site` и `npm run twa` отказываются собирать публичные файлы.

Проверка текстов: `npm run store` (лимиты: Chrome/Edge описание ≤ 132, Firefox summary ≤ 250, Play название ≤ 30,
короткое описание ≤ 80, полное ≤ 4000). Эти же проверки входят в `npm test`.

## 2. Сайт

### GitHub Pages (рекомендуется, бесплатно)

1. Создайте репозиторий на GitHub и отправьте туда проект (`git remote add origin …`, `git push -u origin master`).
   Для Google Play сайт должен открываться **в корне домена**: назовите репозиторий `<ваш-логин>.github.io`
   (сайт будет `https://<ваш-логин>.github.io/`) или подключите свой домен (Settings → Pages → Custom domain).
   Репозиторий с другим именем даёт адрес вида `https://<логин>.github.io/<репозиторий>/`: PWA и расширения работают,
   а для Google Play такой адрес не подходит.
2. Включите workflow публикации (он лежит в `store/`, чтобы не запускаться, пока конфиг не заполнен):
   `cp store/github-pages.yml .github/workflows/pages.yml && git add .github/workflows/pages.yml && git commit -m "Publish the site to GitHub Pages"`.
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. После каждого push workflow `pages` собирает приложения, проверяет конфиг и публикует `dist/site`.
   Первая сборка 3–5 минут (скачиваются модели MediaPipe).

Что будет на сайте:

| Адрес | Что |
|---|---|
| `/` | главная: три приложения, кнопки «Открыть», ссылки на магазины из `storeLinks` |
| `/fitness/`, `/boxing/`, `/rg/` | сами PWA (устанавливаются как приложения, работают офлайн) |
| `/privacy/`, `/terms/` | политика конфиденциальности и условия использования, en/ru/ro |
| `/.well-known/assetlinks.json` | привязка Android-приложений к сайту (появится после шага Play) |

Проверить локально до публикации: `npm run build && npm run site -- --preview && npm run preview -- --site`,
затем открыть http://127.0.0.1:4173/.

### Другие хостинги

`npm run build && npm run site` и загрузить папку `dist/site` целиком (вместе со скрытой папкой `.well-known`).
Netlify: перетащить папку на app.netlify.com/drop. **Cloudflare Pages не подойдёт**: лимит 25 МиБ на файл,
а модель Heavy весит 29 МиБ. Нужен HTTPS (камера и установка PWA без него не работают).

### Как давать доступ к PWA

Просто ссылкой на `/fitness/`, `/boxing/` или `/rg/`:
- Chrome и Edge на компьютере: значок установки в адресной строке или меню → «Установить приложение».
- Android (Chrome): меню ⋮ → «Установить приложение» / «Добавить на главный экран».
- iPhone/iPad (Safari): «Поделиться» → «На экран „Домой“».
- Firefox на компьютере не устанавливает PWA (работает во вкладке); для Firefox есть расширение.

Обновления PWA приходят сами: при новой версии сайта приложение показывает кнопку «Обновить».

## 3. Скриншоты и графика

1. Положите свои ролики в `work/store-clips/` с именами `fitness.webm`, `boxing.webm`, `rg.webm`
   (или поменяйте имена и момент кадра `at` в `store/screenshots.json`). Нужны ролики, где упражнение хорошо видно
   и разбор получается удачным. Снимайте только тех, кто согласен; несовершеннолетних — с согласия родителей.
2. `npm run build && npm run store:assets`
   - с обычным Chrome, чтобы читались MP4: `npm run store:assets -- --chrome /usr/bin/google-chrome`;
   - только один вид спорта или язык: `-- --only boxing --langs en,ru`;
   - на машине без видеокарты (виртуалка, сервер) быстрее с `-- --cpu`.
3. Результат в `artifacts/store/<sport>/`:

| Файл | Куда |
|---|---|
| `desktop/<lang>/1280x800-1..5.jpg` | Chrome, Edge, Firefox; планшеты в Play |
| `phone/<lang>/1080x1920-1..5.jpg` | Google Play, телефон |
| `promo-440x280-<lang>.jpg` | Chrome (обязательно), Edge |
| `marquee-1400x560-<lang>.jpg` | Chrome, Edge (необязательно) |
| `feature-1024x500-<lang>.jpg` | Google Play (обязательно) |
| `icon-128.png`, `logo-300.png`, `icon-512.png` | Chrome, Edge, Google Play |

Видео на скриншотах по умолчанию размыто (`--video blur`): скелет и цифры видны, люди не узнаваемы.
`--video show` — только для роликов, которые вы вправе публиковать. Просмотрите каждую картинку перед загрузкой.

## 4. Расширения

Пакеты: `npm run build && npm run package` → `artifacts/packages/`.

| Магазин | Взнос | Файл | Ответы | Проверка |
|---|---|---|---|---|
| Chrome Web Store (chrome.google.com/webstore/devconsole) | $5 один раз | `<sport>-chromium.zip` | `answers/chrome-web-store.md` | обычно от нескольких дней до 2–3 недель |
| Microsoft Edge Add-ons (partner.microsoft.com → Edge) | бесплатно | `<sport>-chromium.zip` | `answers/edge-addons.md` | до 7 рабочих дней |
| Firefox Add-ons (addons.mozilla.org/developers) | бесплатно | `<sport>-firefox.zip` + `sport-coach-source.zip` | `answers/firefox-amo.md` | автоматическая сразу, ручная — дни |

Каждый вид спорта — отдельный товар (3 в каждом магазине). Тексты для копирования: `artifacts/store/<sport>.md`.
После публикации впишите ссылки в `storeLinks` — они появятся на главной странице сайта.

Новая версия расширения: поднять `version` в `package.json`, `npm run build && npm run package`, загрузить новый zip
в каждый магазин (для Firefox — вместе с новым архивом исходников).

## 5. Google Play

Приложение в Play — тонкая оболочка (Trusted Web Activity), которая открывает PWA с вашего сайта во весь экран.
Код анализа не дублируется: обновили сайт — обновились и Android-приложения.

1. **Аккаунт**: play.google.com/console, взнос $25 один раз, подтверждение личности (документ), подтверждение
   телефона и, для личных аккаунтов, доступ к реальному Android-устройству. Для организации нужен D-U-N-S.
2. **Сайт уже опубликован** в корне домена (раздел 2).
3. **Сборка**: `npm run twa`, затем по `android/<sport>/BUILD.md` (JDK 17, Bubblewrap 1.27+, `npm run twa -- --keys`,
   `bubblewrap build`). Получится `app-release-bundle.aab` на каждое приложение.
4. **Play Console → Create app** для каждого из трёх; заполнить App content и Store listing по
   `answers/google-play.md` (Data safety: данные не собираются; Health apps: Activity and fitness; без рекламы).
5. **Закрытый тест**: загрузить `.aab` в Closed testing, включить Play App Signing, пригласить 12+ тестировщиков
   (одна Google-группа на все три приложения, текст в `answers/testers-invite.md`) и держать их 14 дней подряд.
6. **Привязка к сайту**: SHA-256 из App integrity → `playSigningSha256` в `store/config.json` → push.
   Без этого приложение откроется с адресной строкой браузера.
7. Через 14 дней: Dashboard → **Apply for production** (ответы-заготовки в `answers/google-play.md`),
   проверка обычно до 7 дней. После одобрения — релиз в Production.

## Перед каждой отправкой

- [ ] `npm test` и `npm run build` без ошибок, `npm run store` — тексты в лимитах.
- [ ] Сайт открывается по HTTPS, `/privacy/` и `/terms/` доступны, на главной правильный e-mail.
- [ ] Расширение установлено из zip и проверено: Chrome/Edge — `chrome://extensions` → «Загрузить распакованное»;
      Firefox — `about:debugging` → «Загрузить временное дополнение».
- [ ] Скриншоты просмотрены, на них нет узнаваемых посторонних людей и чужих материалов.
- [ ] Ответы о данных везде одинаковые: ничего не собирается и не передаётся.
- [ ] Для Play: `https://<домен>/.well-known/assetlinks.json` открывается и содержит отпечаток из App integrity.

Тексты и ответы составлены по правилам магазинов на октябрь 2026 года; формы магазинов меняются, сверяйтесь с ними
при заполнении. Это не юридическая консультация: если проект коммерческий или вы работаете с данными клиентов,
покажите политику юристу.
