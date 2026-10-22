# Google Play: ответы для Play Console

Приложение для Play — это Trusted Web Activity (TWA): оболочка Android, которая открывает PWA с вашего сайта в Chrome
без адресной строки. Сборка описана в `store/README.md`, раздел «Google Play», и в `android/<sport>/BUILD.md`
(после `npm run twa`). Три отдельных приложения, пакеты `<androidPackagePrefix>.fitness`, `.boxing`, `.rg`.

## Создание приложения

| Поле | Значение |
|---|---|
| App name | `playTitle` из листинга (≤ 30) |
| Default language | English (United States) – en-US |
| App or game | App |
| Free or paid | Free |

## App content (Policy → App content)

**Privacy policy**: `<SITE>privacy/`

**Ads**: No, my app does not contain ads.

**App access**: All functionality in my app is available without any access restrictions.

**Content rating** (анкета IARC):
- Category: «All other app types» (не игра, не соцсеть, не магазин).
- Violence, fear, sexuality, language, controlled substances, crude humour, gambling: **No** на всё.
  Boxing Coach разбирает видео тренировок самого пользователя и не показывает сцен насилия.
- Users can interact or exchange content: **No** (отчёты не передаются другим пользователям).
- Shares user's location: **No**. Digital purchases: **No**. Web browser or search engine: **No**
  (TWA открывает только сайт самого приложения).
- Ожидаемый результат: IARC 3+ / PEGI 3 / Everyone.

**Target audience and content**:
- Age groups: рекомендуем **18 and over** (тренеры, родители, взрослые спортсмены). Можно добавить 13–15 и 16–17:
  приложение не собирает данных, но тогда Google внимательнее проверяет листинг. Группы младше 13 не выбирать:
  это включает требования программы Families.
- Could your store listing unintentionally appeal to children? **No**.

**News app**: No. **COVID-19 contact tracing and status**: No. **Government app**: No.

**Financial features**: My app doesn't provide any financial features.

**Health apps** (обязательная декларация):
- Отметить **Activity and fitness** (все три приложения: анализ техники тренировок).
- Health Connect: не используется. Medical device / clinical: No. Human subjects research: No.

**Advertising ID**: No (TWA от Bubblewrap не подключает рекламные библиотеки).

**Data safety**:
- Does your app collect or share any of the required user data types? → **No**.
  Видео, кадры камеры и отчёты обрабатываются только на устройстве и не отправляются с него; по правилам Play такие
  данные не считаются собранными.
- Результат в карточке: «No data collected», «No data shared with third parties».
- Account creation: My app does not allow users to create an account.

## Store listing (Grow → Store presence → Main store listing)

| Поле | Значение |
|---|---|
| App name | `playTitle` (≤ 30) |
| Short description | `playShort` (≤ 80) |
| Full description | `description` (≤ 4000) |
| App icon | `artifacts/store/<sport>/icon-512.png` (512×512, PNG) |
| Feature graphic | `feature-1024x500-<lang>.jpg` (обязательно) |
| Phone screenshots | `phone/<lang>/1080x1920-1..5.jpg` (нужно 2–8) |
| 7" и 10" tablet screenshots | можно взять `desktop/<lang>/1280x800-*.jpg` (необязательно) |
| Category | `categories.play` (Health & Fitness / Sports) |
| Tags | Fitness, Workout / Boxing, Martial arts / Gymnastics |
| Contact e-mail | контактный e-mail (обязательно, публичный) |
| Website | `<SITE>` |

Переводы: Store listing → Manage translations → Russian (ru-RU), Romanian (ro) с текстами из листинга.

## Тестирование перед продакшеном (новые личные аккаунты)

Для личных аккаунтов, созданных после 13.11.2023, Google требует закрытый тест: **не меньше 12 тестировщиков, которые
остаются подписаны 14 дней подряд**, по каждому приложению. Только после этого доступна кнопка «Apply for production».

План:
1. Testing → Closed testing → Create track. Загрузить `.aab`, указать «What's new».
2. Testers: создать Google-группу (например, `sport-coach-testers@googlegroups.com`) и добавить её во все три трека:
   одна группа и одни и те же люди закрывают требование сразу для трёх приложений.
3. Разослать ссылку на участие (opt-in URL) из Play Console; текст приглашения — `store/answers/testers-invite.md`.
   Нужно 12+ человек; лучше позвать 15–20, потому что кто-то отпишется, и тогда 14 дней начнутся заново.
4. Каждые несколько дней выпускать маленькое обновление (новая версия `.aab`) и собирать отзывы: Google смотрит
   на вовлечённость тестировщиков.
5. Через 14 дней: Dashboard → Apply for production. Примерные ответы:
   - Recruiting testers: friends, athletes and coaches from our club, invited through a Google Group.
   - Engagement: testers analysed their own training videos in all three modes and reported results in a feedback form.
   - Feedback summary / changes: опишите реальные исправления по отзывам.
   - Target audience: amateur athletes, coaches and parents who want to check technique from video.
   - Value: on-device video analysis of technique, no account, no upload, works offline.
   - Expected installs in year 1: честная оценка (например, 100–1 000).

## Подпись и привязка к сайту

- При первой загрузке `.aab` включите **Play App Signing** (по умолчанию). Google переподписывает приложение своим ключом.
- Test and release → App integrity → App signing: скопируйте **SHA-256 certificate fingerprint** ключа подписи
  приложения (и ключа загрузки) в `store/config.json → playSigningSha256.<sport>`.
- `npm run site` добавит их в `/.well-known/assetlinks.json`; опубликуйте сайт заново.
- Если файл не найден или отпечаток не совпадает, приложение откроется с адресной строкой браузера сверху.
  Проверка: https://developers.google.com/digital-asset-links/tools/generator (домен + пакет + отпечаток).

## Требования Android, о которых стоит помнить

- С 31.08.2026 новые приложения и обновления должны быть собраны с targetSdk 36 (Android 16). Bubblewrap 1.27
  и новее ставит 36 сам; со старой версией Play Console отклонит загрузку (`npm i -g @bubblewrap/cli@latest`).
- Разрешения: TWA не запрашивает камеру через Android; доступ к камере спрашивает Chrome для сайта приложения.
  Уведомления и геолокация отключены (`enableNotifications: false`, без location delegation).
