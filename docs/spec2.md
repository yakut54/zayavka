# 0. Как работать с этим документом

Это техническое задание для **Claude Code** на **проект 2** портфолио. **Проект 2 — продолжение проекта 1** («Лендинг + приём заявок + админка», далее **ТЗ-1**). Он строится **в том же монорепозитории**, на том же бэкенде, той же базе, той же дизайн-системе и той же инфраструктуре.

**Ссылки:** запись вида «ТЗ-1 §7.3» означает раздел 7.3 первого документа. Всё, что не переопределено здесь, берётся из ТЗ-1 без изменений: стек, правила кода, формат ошибок, логирование, безопасность, 152-ФЗ, тестовая среда, CI, деплой.

**Правила для исполнителя (в дополнение к ТЗ-1 §0):**

1. **Начинать проект 2 можно только после этапов M0–M9 проекта 1** (ТЗ-1 §22): весь код написан, `make lint typecheck test` и e2e проекта 1 зелёные. Деплой на прод (M10 проекта 1 и P10 проекта 2) выполняется позже, когда владелец даст домен, SMTP и доступы к VDS. Проекты **не делаются параллельно**: они меняют одни и те же таблицы и пакеты.
2. **Ничего не ломать в проекте 1.** Все тесты и e2e-сценарии проекта 1 остаются зелёными на каждом этапе проекта 2. Изменения общих частей (таблицы, пакеты, конфиг) — только обратно совместимые, перечислены в разделе 3.
3. **Всё, что касается MAX, сверять с официальной документацией dev.max.ru на момент реализации.** В этом документе приведено то, что подтверждено документацией на 21.10.2026; там, где документация не даёт ответа, это прямо помечено как «сверить». Не придумывать эндпоинты, поля и форматы MAX — если чего-то нет в документации или в OpenAPI-схеме `github.com/max-messenger/api-schema`, остановиться и спросить.
4. Сложная логика (расчёт свободного времени, защита от двойной записи, проверка подписи MAX) пишется **через тесты сначала**: тест → реализация.
5. Остальные правила ТЗ-1 §0 действуют полностью: никаких заглушек, никаких строк текста в шаблонах, источник истины для валидации — бэкенд, тесты только на PostgreSQL.

# 1. Цель и рамки

## 1.1. Что строим

**Онлайн-запись на услуги через мини-приложение в мессенджере MAX** для того же локального бизнеса, что и в проекте 1.

- Клиент открывает бота бизнеса в MAX → нажимает кнопку запуска → в мини-приложении выбирает услугу, специалиста, день и время → оставляет имя и телефон → получает подтверждение и напоминания в чат с ботом.
- Клиент видит свои записи, может отменить или перенести запись.
- Владелец в той же админке из проекта 1 видит записи в календаре, ведёт сотрудников и их расписание, записывает клиентов вручную (по телефонному звонку), отмечает «пришёл / не пришёл».
- Если подходящего времени нет — клиент оставляет **заявку** (это заявка проекта 1 с `source = 'max'`).
- На лендинге проекта 1 появляется кнопка «Записаться онлайн» со ссылкой на бота в MAX.

## 1.2. Как это связано с проектом 1

| Часть | Из проекта 1 | Что добавляет проект 2 |
|---|---|---|
| API | FastAPI, слои, ошибки, логи, rate limit | Модуль `booking` и модуль `max` |
| БД | `leads`, `consents`, `notification_outbox`, … | Таблицы расписания и записей; расширение `notification_outbox` |
| Воркер | Обработка outbox, backoff | Отложенные напоминания, канал отправки клиенту в MAX |
| Админка | Вход, каркас, заявки | Разделы «Записи», «Сотрудники», «Настройки записи» |
| Дизайн-система | Все компоненты ТЗ-1 §10 | Компоненты для календаря, слотов, шагов |
| Сайт | Лендинг | Кнопка «Записаться онлайн» (за флагом) |
| Инфраструктура | Caddy, Compose, бэкапы | Поддомен мини-приложения, вебхук бота |

## 1.3. Честность демо (MUST)

Правила ТЗ-1 §1.2 действуют: вымышленный бренд, плашка «Демо-проект», **никаких выдуманных отзывов**. Сотрудники в демо — явно вымышленные («Мастер Анна (демо)»).

## 1.4. В рамках

- Мини-приложение MAX: запись в 5 шагов, «Мои записи», отмена, перенос, заявка, если нет времени.
- Бот: приветствие с кнопкой запуска, подтверждения, напоминания за 24 ч и за 2 ч, уведомления об отмене и переносе.
- Админка: календарь записей (день по сотрудникам), список записей, карточка записи, ручная запись, сотрудники, недельный график, исключения (выходные и особые часы), настройки записи.
- Режим демо вне MAX: мини-приложение открывается в обычном браузере с имитацией моста MAX (только при `demo: true`).

## 1.5. Вне рамок

Онлайн-оплата и предоплата, листы ожидания, групповые занятия (несколько клиентов на один слот), разные цены у разных сотрудников, обработка свободного текста в чате с ботом (бот отвечает только кнопками), программа лояльности.

# 2. Платформа MAX: что подтверждено документацией

Ниже — только факты из официальной документации dev.max.ru на 21.10.2026. Всё остальное — «сверить».

## 2.1. Публикация

- Мини-приложение работает **только внутри чат-бота** MAX; отдельно от бота его не существует.
- Подключение: на платформе для партнёров (`business.max.ru`) → «Чат-боты» → бот → «⋮ → Настройки» → вставить HTTPS-адрес мини-приложения → выбрать подпись кнопки («Открыть», «Старт», «Играть» или без подписи) → «Сохранить». В чате с ботом появляется кнопка запуска.
- **Кто может публиковать:** по текущей странице документации — резиденты РФ: юридические лица, ИП и самозанятые. Ранее (с августа 2025) доступ был только у юрлиц, правила менялись. **Сверить** на момент публикации, а также пройдёт ли верификацию организация с приостановленными операциями по счёту.
- Карточка бота проходит модерацию; токен бота выдаётся после одобрения. В мини-приложении или боте должны быть доступны пользовательское соглашение, политика конфиденциальности, сведения об операторе и контакты поддержки.
- **Если публикация недоступна** — проект всё равно сдаётся: мини-приложение работает в режиме демо вне MAX (раздел 10.9), бот проверяется тестами на имитации API. Это фиксируется в README.

## 2.2. Требования к мини-приложению

- Обычные HTML, CSS, JavaScript; только **HTTPS**.
- Адрес мини-приложения — до 1024 символов, латиница, цифры, `.` и `-`.
- Параметр запуска `startapp` — до 512 символов, только `A-Z a-z 0-9 _ -`. Конфиденциальные данные в нём не передавать.

## 2.3. Мост MAX (MAX Bridge)

Подключается скриптом:

```html
<script src="https://st.max.ru/js/max-web-app.js"></script>
```

После загрузки доступен `window.WebApp`. Используемое в проекте:

| Что | Назначение в проекте |
|---|---|
| `WebApp.initData` (строка) | Отправляется на сервер для проверки подписи. **Только это поле — источник истины о пользователе** |
| `WebApp.initDataUnsafe.user` (`id`, `first_name`, …) | Только для предзаполнения имени в UI; никаких решений на его основе |
| `WebApp.initDataUnsafe.start_param` | Параметр запуска (например, предвыбранная услуга) |
| `WebApp.platform` | `ios` / `android` / `desktop` / `web` — включение/отключение функций |
| `WebApp.requestContact()` | Получить телефон пользователя с подписью: `{ phone, authDate, hash }` |
| `WebApp.BackButton.show/hide/onClick/offClick` | Системная кнопка «Назад» на шагах записи |
| `WebApp.enableClosingConfirmation()` / `disable…` | Подтверждение закрытия, пока запись не завершена |
| `WebApp.HapticFeedback.selectionChanged()` / `notificationOccurred('success')` | Отклик при выборе времени и при успешной записи (не работает на desktop и web) |
| `WebApp.openLink(url)` / `openMaxLink(url)` | Ссылки: внешние — в браузере, `https://max.ru/...` — внутри MAX |
| `WebApp.downloadFile(url, name)` | Скачать файл календаря `.ics` (только HTTPS, по клику, не работает в браузере) |

**Чего в мосте нет** (по документации): `ready()`, `close()`, `expand()`, `MainButton`, параметров темы и событий смены темы. Поэтому: главная кнопка действия — **своя** (`BottomBar`), тема — по `prefers-color-scheme`.

Большинство методов возвращают Promise и при ошибке отклоняются объектом `{ error: { code } }`.

## 2.4. Проверка `initData` (алгоритм из документации)

1. Из `initData` получить пары `key=value` (разделитель `&`).
2. Убедиться, что `hash` встречается **ровно один раз**; сохранить и исключить его.
3. URL-декодировать значения (через раздел по `=` и `decodeURIComponent`-эквивалент; литеральный `+` **не** превращать в пробел).
4. Отсортировать пары по ключу по алфавиту.
5. Склеить в `launch_params`: `key1=value1\nkey2=value2` (разделитель — перевод строки `0x0A`).
6. `secret_key = HMAC-SHA256(key = "WebAppData", message = BOT_TOKEN)`.
7. `signature = hex(HMAC-SHA256(key = secret_key, message = launch_params))`.
8. Подлинно, если `signature` совпадает с `hash` (сравнение за постоянное время — `hmac.compare_digest`).

Дополнительно (политика проекта): `auth_date` (Unix-секунды) не старше **24 часов** — иначе `401 max_init_data_expired`, мини-приложение просит перезапустить его из чата.

Каждый параметр должен встречаться ровно один раз — дубликаты любого ключа → отказ.

## 2.5. Проверка телефона из `requestContact()`

Документация описывает проверку как `HMAC_SHA256(authDate + phone + userId, botToken)`, при этом `+` из телефона удаляется. **Сверить** в документации, что является ключом, а что сообщением, и формат результата; написать тест на пример из документации, если он там есть. Если подпись не проходит — телефон считается введённым вручную (`phone_source = 'manual'`), запись не блокируется.

## 2.6. Bot API

- Базовый адрес: `https://platform-api2.max.ru/`. Документация требует обращаться к этому домену и **доверять сертификату Минцифры**. В образ API добавить корневой сертификат НУЦ Минцифры в доверенные (скачать с официального сайта Госуслуг/Минцифры при сборке образа, проверить отпечаток). **Отключать проверку TLS запрещено.**
- Авторизация: заголовок `Authorization: <token>`.
- Лимит: **30 запросов в секунду** на `platform-api2.max.ru`. Воркер держит не больше 20 rps (раздел 8.4).
- Отправка: `POST /messages?user_id=<id>` (или `chat_id=<id>`), тело: `text` (до 4000 символов), `format` (`markdown` | `html`, необязательно), `attachments`, `notify`.
- Клавиатура: вложение `{"type": "inline_keyboard", "payload": {"buttons": [[...], ...]}}` — массив рядов. Типы кнопок: `callback`, `link`, `request_contact`, `request_geo_location`, `open_app`, `message`, `clipboard`. До 210 кнопок, до 30 рядов, до 7 в ряду; для `link`, `open_app`, `request_geo_location`, `request_contact` — до 3 в ряду. Кнопка `link` — поле `url` (до 2048 символов). **Поля кнопки `open_app` — сверить** в OpenAPI-схеме.
- Вебхук: `POST /subscriptions` с `url` (только `https://`), `update_types` (например `["message_created", "bot_started"]`), `secret` (`^[a-zA-Z0-9_-]{5,256}$`). MAX присылает секрет в заголовке `X-Max-Bot-Api-Secret`. Обработчик обязан ответить `200` за 30 секунд; иначе до 10 повторов с растущим интервалом (60 с, 150 с, 375 с, …); если 8 часов нет успешного ответа — бот отписывается от вебхука. Список подписок: `GET /subscriptions`.
- Long Polling (`GET /updates`) — только для разработки.

# 3. Изменения в проекте 1 (обратно совместимые)

Это единственные изменения общих частей. Каждое — отдельная миграция или отдельный коммит с тестами.

1. **`notification_outbox`:**
   - добавить значение статуса `cancelled` (CHECK обновляется миграцией);
   - добавить канал `max_user` (сообщение конкретному клиенту в MAX);
   - добавить виды `kind`: `booking_created_owner`, `booking_confirmed_client`, `booking_reminder_24h`, `booking_reminder_2h`, `booking_cancelled_client`, `booking_cancelled_owner`, `booking_rescheduled_client`, `bot_welcome`;
   - добавить колонку `dedupe_key text NULL` с уникальным индексом `WHERE dedupe_key IS NOT NULL` — чтобы одна и та же задача (например, напоминание по одной записи) не создавалась дважды.
2. **Каталог услуг `services.json`** (ТЗ-1 §12.1): у каждой услуги появляются поля `bookable: boolean` (по умолчанию `false`), `durationMin` (5–480, кратно 5), `bufferMin` (0–120, время на уборку/подготовку после услуги). Схема конфига `defineSiteConfig` расширяется; для `bookable: true` поля длительности обязательны.
3. **`leads.source = 'max'`** уже предусмотрен в ТЗ-1 — используется для заявок из мини-приложения.
4. **Настройки API** — новые переменные (раздел 4).
5. **Админка** — новые пункты меню, существующие экраны не меняются.
6. **Сайт** — новая необязательная секция/кнопка «Записаться онлайн» за флагом `max.bookingEnabled`.
7. **Caddy** — новый поддомен для мини-приложения.
8. **Воркер** — новые задачи по расписанию; существующие не меняются.

# 4. Конфигурация

## 4.1. Новые переменные окружения API

| Переменная | Пример | Обязательна | Описание |
|---|---|---|---|
| `BUSINESS_TZ` | `Asia/Novosibirsk` | да | Часовой пояс бизнеса (IANA). Совпадает с `contacts.timezone` из конфига сайта; при расхождении сборка падает |
| `MAX_BOT_TOKEN` | — | для бота | Токен бота (уже был в ТЗ-1 как необязательный) |
| `MAX_WEBHOOK_SECRET` | 48 символов `[A-Za-z0-9_-]` | для бота | Секрет вебхука |
| `MAX_API_BASE` | `https://platform-api2.max.ru` | нет | Базовый адрес Bot API |
| `MINIAPP_ORIGIN` | `https://max.example.ru` | да | Адрес мини-приложения |
| `MAX_INIT_DATA_TTL_HOURS` | `24` | нет | Срок годности `initData` |
| `MAX_DEMO_BRIDGE` | `false` | нет | Разрешить вход с подписью тестового токена в режиме демо (раздел 10.9). В `prod` с реальным ботом — `false` |
| `MAX_DEMO_BOT_TOKEN` | — | при демо | Отдельный тестовый «токен» для подписи демо-`initData`. **Никогда не совпадает с настоящим токеном** |

Правило запуска (MUST): в `prod` при `MAX_DEMO_BRIDGE=true` должен быть задан `MAX_DEMO_BOT_TOKEN`, и он не равен `MAX_BOT_TOKEN`; иначе приложение не стартует.

## 4.2. Конфиг сайта/мини-приложения

`site.config.ts` дополняется:

```ts
max: {
  bookingEnabled: true,
  botUsername: 'example_bot',          // для ссылок «Записаться онлайн»
  miniAppUrl: 'https://max.example.ru',
  supportContact: 'content.max.support', // ключ i18n: контакты поддержки
},
```

Формат ссылки-приглашения на бота и мини-приложение с параметром `startapp` — **сверить** в документации MAX; генерируется одной функцией `buildMaxBotLink(startParam?)`.

# 5. Предметная модель записи

## 5.1. Понятия

- **Ресурс** (`resource`) — то, что занято во время услуги: мастер, пост автосервиса, кабинет. В интерфейсе называется «Сотрудник» (подпись настраивается в i18n: «Мастер», «Пост»).
- **Услуга** — из каталога `services.json` (только `bookable: true`). Длительность и буфер — оттуда.
- **Недельный график** — интервалы работы ресурса по дням недели (несколько интервалов в день — для перерыва на обед).
- **Исключение** — на конкретную дату: выходной или особые часы вместо недельного графика.
- **Запись** (`booking`) — клиент, ресурс, услуга, время начала и конца.
- **Слот** — допустимое время начала записи.

## 5.2. Правила (MUST)

1. Запись занимает ресурс на `[начало; начало + длительность + буфер)`. Буфер в интерфейсе клиенту не показывается: клиент видит «10:00–11:00», а ресурс занят до 11:15.
2. Время начала выровнено по шагу `slot_step_min` от начала рабочего интервала (по умолчанию 15 минут).
3. Нельзя записаться раньше чем через `min_lead_min` от текущего момента (по умолчанию 60) и дальше чем на `horizon_days` (по умолчанию 30) дней вперёд.
4. Запись целиком (с буфером) помещается в рабочий интервал ресурса в этот день.
5. Две **подтверждённые** записи одного ресурса не пересекаются — это гарантирует база данных (раздел 6), а не только код.
6. «Любой свободный специалист» — сервер сам выбирает ресурс: среди тех, кто оказывает услугу и свободен в это время, — с наименьшим числом записей в этот день, при равенстве — по `sort_order`.
7. Клиент может отменить или перенести запись не позже чем за `cancel_deadline_min` (по умолчанию 120) до начала. Позже — только через звонок; в интерфейсе показывается телефон бизнеса.
8. Все времена хранятся в UTC, все расчёты дня и рабочих часов — в `BUSINESS_TZ` через `zoneinfo`. Никаких ручных смещений `+7`.
9. Временного резерва слота нет. Если двое выбрали одно время, второй получает `409 slot_taken` и обновлённый список времени. Это осознанное решение: для объёма одного бизнеса удержание слота добавляет сложность без пользы.

# 6. База данных

Общие правила — ТЗ-1 §6.1. Новое расширение: `btree_gist` (для ограничений исключения).

**`resources`**

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | uuid | PK, default `uuidv7()` |
| `name` | text | NOT NULL, длина 1–80 |
| `title` | text | NULL, длина ≤ 80 — «Барбер», «Пост №2» |
| `is_active` | boolean | NOT NULL, default true |
| `sort_order` | integer | NOT NULL, default 0 |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

**`resource_services`** — кто какие услуги оказывает

| Поле | Тип | Ограничения |
|---|---|---|
| `resource_id` | uuid | FK → resources ON DELETE CASCADE |
| `service_slug` | text | NOT NULL |

PK `(resource_id, service_slug)`. Проверка, что slug есть в каталоге и `bookable` — в сервисе (каталог не в БД).

**`working_hours`** — недельный график

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | uuid | PK |
| `resource_id` | uuid | FK → resources ON DELETE CASCADE |
| `weekday` | smallint | CHECK 1–7 (ISO: 1 = понедельник) |
| `start_min` | smallint | CHECK 0–1439 — минуты от полуночи по `BUSINESS_TZ` |
| `end_min` | smallint | CHECK 1–1440, `end_min > start_min` |

Ограничение: `EXCLUDE USING gist (resource_id WITH =, weekday WITH =, int4range(start_min, end_min) WITH &&)` — интервалы одного дня не пересекаются.

Минуты вместо типа `time`: для `int4range` есть ограничение исключения, для `time` — нет готового типа диапазона.

**`schedule_exceptions`**

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | uuid | PK |
| `resource_id` | uuid | FK → resources ON DELETE CASCADE |
| `date` | date | NOT NULL — дата в `BUSINESS_TZ` |
| `kind` | text | CHECK in (`day_off`, `custom_hours`) |
| `intervals` | jsonb | NOT NULL, default `'[]'` — `[{start_min, end_min}]`; для `day_off` пустой, для `custom_hours` не пустой (проверка в сервисе + CHECK `jsonb_typeof = 'array'`) |
| `note` | text | NULL, ≤ 200 |

UNIQUE `(resource_id, date)`.

**`booking_settings`** — одна строка

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | smallint | PK, CHECK `id = 1` |
| `slot_step_min` | smallint | CHECK in (5, 10, 15, 20, 30, 60), default 15 |
| `min_lead_min` | integer | CHECK 0–10080, default 60 |
| `horizon_days` | smallint | CHECK 1–90, default 30 |
| `cancel_deadline_min` | integer | CHECK 0–10080, default 120 |
| `reminders_enabled` | boolean | default true |
| `version` | integer | default 1 |
| `updated_at` | timestamptz | NOT NULL |

Миграция вставляет строку по умолчанию.

**`bookings`**

| Поле | Тип | Ограничения |
|---|---|---|
| `id` | uuid | PK |
| `public_number` | bigint | GENERATED ALWAYS AS IDENTITY, UNIQUE |
| `resource_id` | uuid | FK → resources, NOT NULL |
| `service_slug` | text | NOT NULL |
| `service_title_snapshot` | text | NOT NULL — название на момент записи (каталог может измениться) |
| `duration_min` / `buffer_min` | smallint | NOT NULL — копия на момент записи |
| `price_from_snapshot` | integer | NULL |
| `starts_at` / `ends_at` | timestamptz | NOT NULL; CHECK `ends_at > starts_at` |
| `blocked` | tstzrange | NOT NULL — `[starts_at; ends_at + buffer)`; CHECK `lower(blocked) = starts_at AND NOT isempty(blocked)` |
| `status` | booking_status | NOT NULL, default `confirmed` |
| `client_name` | text | NOT NULL, длина 2–100 |
| `client_phone_e164` | text | NOT NULL, тот же CHECK, что в `leads` |
| `phone_source` | text | CHECK in (`max_contact`, `manual`, `admin`) |
| `max_user_id` | bigint | NULL — клиент в MAX |
| `source` | text | CHECK in (`max`, `admin`) |
| `comment` | text | NULL, ≤ 500 |
| `consent_id` | uuid | FK → consents, NULL; CHECK `source = 'admin' OR consent_id IS NOT NULL` |
| `idempotency_key` | text | NULL |
| `rescheduled_from_id` | uuid | FK → bookings, NULL |
| `cancel_reason` | text | NULL, ≤ 300 |
| `cancelled_at` | timestamptz | NULL |
| `version` | integer | NOT NULL, default 1 |
| `anonymized_at` | timestamptz | NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

Тип `booking_status`: `confirmed`, `cancelled_by_client`, `cancelled_by_business`, `completed`, `no_show`, `rescheduled`.

**Защита от двойной записи (MUST):**

```sql
ALTER TABLE bookings ADD CONSTRAINT ex_bookings_no_overlap
  EXCLUDE USING gist (resource_id WITH =, blocked WITH &&)
  WHERE (status = 'confirmed');
```

`blocked` хранится отдельной колонкой, а не вычисляется: выражение `ends_at + interval` для `timestamptz` в PostgreSQL не является IMMUTABLE и не может использоваться в генерируемой колонке или ограничении исключения.

Нарушение ограничения (SQLSTATE `23P01`) сервис превращает в `409 slot_taken`.

Индексы: `(resource_id, starts_at)`, `(max_user_id, starts_at DESC) WHERE max_user_id IS NOT NULL`, UNIQUE `(max_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

**`booking_events`** — история, как `lead_events` в ТЗ-1: `id`, `booking_id`, `actor_user_id` (NULL — клиент или система), `actor` (`client` | `admin` | `system`), `type` (`created`, `cancelled`, `rescheduled`, `status_changed`, `note_added`), `payload`, `created_at`.

**`max_updates`** — защита от повторной обработки вебхука

| Поле | Тип | Ограничения |
|---|---|---|
| `body_sha256` | bytea | PK |
| `received_at` | timestamptz | NOT NULL |

Хранится 7 дней, чистит воркер. Если в схеме Bot API есть уникальный идентификатор события — использовать его вместо хеша тела (**сверить**).

# 7. Бэкенд

## 7.1. Новые модули

```text
apps/api/app/
├─ booking/
│  ├─ slots.py          # чистые функции расчёта свободного времени (без БД)
│  ├─ repository.py
│  ├─ service.py        # создание, отмена, перенос, выбор ресурса
│  └─ schedule.py       # график, исключения, конфликты
├─ max/
│  ├─ init_data.py      # проверка initData (§2.4)
│  ├─ contact.py        # проверка requestContact (§2.5)
│  ├─ client.py         # HTTP-клиент Bot API (httpx, таймауты, лимит rps)
│  ├─ keyboards.py      # сборка клавиатур
│  ├─ webhook.py        # разбор событий
│  └─ messages/         # Jinja2-шаблоны текстов бота (*.txt.j2)
├─ routes/
│  ├─ max_app.py        # API мини-приложения
│  ├─ max_webhook.py
│  ├─ admin_bookings.py
│  ├─ admin_resources.py
│  └─ admin_booking_settings.py
└─ cli.py               # + max-subscribe, max-check
```

## 7.2. Расчёт свободного времени (`booking/slots.py`)

Чистая функция без обращения к БД — так её легко покрыть тестами, включая генеративные:

```python
@dataclass(frozen=True)
class SlotQuery:
    day: date                         # день в BUSINESS_TZ
    tz: ZoneInfo
    now: datetime                     # aware, UTC
    duration: timedelta
    buffer: timedelta
    step: timedelta
    min_lead: timedelta
    horizon_end: datetime             # aware, UTC

def free_slots(
    q: SlotQuery,
    work: list[tuple[int, int]],      # интервалы дня в минутах: недельный график или исключение
    busy: list[tuple[datetime, datetime]],  # blocked-интервалы подтверждённых записей, UTC
) -> list[datetime]:
    ...
```

Алгоритм:

1. Для каждого рабочего интервала `(start_min, end_min)` построить aware-datetime в `tz` на дату `day`, перевести в UTC.
2. Вычесть занятые интервалы → список свободных отрезков.
3. В каждом свободном отрезке перебрать моменты `t = начало_рабочего_интервала + k·step`, которые лежат внутри отрезка (выравнивание — от начала **рабочего** интервала, а не свободного отрезка, чтобы сетка времени была стабильной).
4. Оставить `t`, для которых `[t; t + duration + buffer)` целиком в свободном отрезке, `t ≥ now + min_lead`, `t < horizon_end`.
5. Вернуть отсортированный список без дубликатов.

Рабочие интервалы дня: если на дату есть исключение — `day_off` → пусто, `custom_hours` → его интервалы; иначе — недельный график по `day.isoweekday()`.

Для «любого специалиста» слоты считаются по каждому ресурсу, затем объединяются: `{время → [ресурсы]}`.

Доступность дней (для полосы дат) — тот же расчёт по каждому дню диапазона, ответ — только флаг «есть ли время». Расчёт выполняется одним запросом занятых интервалов на весь диапазон, а не запросом на каждый день.

## 7.3. Создание записи (`BookingService.create`)

Порядок:

1. Rate limit: `booking:<max_user_id>` — 10 попыток за 10 минут (механизм ТЗ-1 §7.6).
2. Идемпотентность: если запись с `(max_user_id, idempotency_key)` уже есть — вернуть её (`200`), ничего не создавать.
3. Валидация: услуга существует и `bookable`; ресурс (если указан) активен и оказывает услугу; согласие и версия политики — как ТЗ-1 §7.4 п. 4; телефон — нормализация `phonenumbers`; подпись `requestContact` — если передана (§2.5).
4. Время: `starts_at` есть среди свободных слотов на эту дату для указанного ресурса (или для любого) — повторный расчёт на сервере. Нет → `409 slot_taken`.
5. Если ресурс «любой» — выбрать по правилу §5.2 п. 6.
6. Транзакция: `consents` → `bookings` → `booking_events(created)` → outbox: `booking_confirmed_client` (сразу), `booking_created_owner` (сразу), `booking_reminder_24h` и `booking_reminder_2h` (с `next_attempt_at` = начало − 24 ч / − 2 ч; только если это время ещё в будущем и `reminders_enabled`). У напоминаний `dedupe_key = 'reminder_24h:<booking_id>'`.
7. Если на шаге 6 нарушено ограничение `ex_bookings_no_overlap` (гонка) → откат → `409 slot_taken`.

## 7.4. Отмена и перенос

- **Отмена клиентом:** проверить владельца (`max_user_id`), статус `confirmed`, срок `cancel_deadline_min`, `version`. Статус → `cancelled_by_client`; все `pending`-задачи outbox по этой записи → `cancelled`; задача `booking_cancelled_owner`.
- **Перенос клиентом:** в **одной** транзакции создать новую запись (как §7.3, без нового согласия — ссылка на `consent_id` старой) со ссылкой `rescheduled_from_id`, старой поставить статус `rescheduled`, перенести напоминания. Порядок: сначала смена статуса старой (освобождает её время), потом вставка новой — так можно перенести запись на соседнее время, пересекающееся со старым.
- **Отмена бизнесом** (из админки): статус `cancelled_by_business`, обязательная причина, сообщение клиенту `booking_cancelled_client` (если есть `max_user_id`).

## 7.5. Аутентификация мини-приложения

- Каждый запрос мини-приложения несёт заголовок `X-Max-Init-Data: <WebApp.initData>`.
- Зависимость `current_max_user` проверяет подпись (§2.4) и срок, возвращает `MaxUser(id, first_name)`. Результат кэшируется в памяти процесса на 60 секунд по SHA-256 строки, чтобы не пересчитывать HMAC на каждый запрос.
- Cookie и CSRF в мини-приложении не используются: заголовок с подписью нельзя подставить с чужого сайта.
- Ошибки: нет заголовка → `401 max_init_data_missing`; неверная подпись → `401 max_init_data_invalid`; истёк → `401 max_init_data_expired`.
- В логах `initData` и `user.id` не пишутся; пишется только хеш `user.id`.

## 7.6. Вебхук бота

`POST /api/v1/max/webhook`:

1. Проверить `X-Max-Bot-Api-Secret` против `MAX_WEBHOOK_SECRET` через `hmac.compare_digest`. Не совпало → `401`, тело не разбирать.
2. Ограничение тела — 256 КБ.
3. Дедупликация через `max_updates` (`INSERT … ON CONFLICT DO NOTHING`). Уже было → `200`.
4. `bot_started` → задача outbox `bot_welcome` для этого пользователя. **Сообщение не отправляется прямо в обработчике** — только через outbox (ответ вебхуку должен уйти быстро).
5. `message_created` (клиент написал текст) → задача outbox с коротким ответом «Я умею только записывать — нажмите кнопку ниже» и кнопкой запуска мини-приложения. Не чаще раза в 10 минут на пользователя.
6. Любые другие типы — `200` без действий.
7. Ответ всегда `200`, если секрет верный, даже при ошибке разбора (ошибка — в лог уровня `error`), иначе MAX будет повторять и через 8 часов отпишет бота.

CLI:

```bash
# подписка на вебхук: идемпотентно; если URL совпадает, но секрет сменили — переподписать
docker compose exec api python -m app.cli max-subscribe
# проверка: токен валиден (GET /me), подписка есть, сертификат доверен
docker compose exec api python -m app.cli max-check
```

Почему `max-subscribe` пересоздаёт подписку при каждом запуске: `GET /subscriptions`, скорее всего, не возвращает секрет, поэтому по совпадению URL нельзя понять, актуален ли он. Если оставить старую подписку после смены `MAX_WEBHOOK_SECRET`, все вебхуки будут отвергаться, и через 8 часов MAX отпишет бота. Порядок: `GET /subscriptions` → если есть подписка на наш URL — удалить её (метод удаления — **сверить** в документации) → `POST /subscriptions` с текущим секретом. Если удаления в API нет — повторный `POST` с тем же URL. Отправить тестовое событие самому себе через Bot API нельзя, поэтому работу вебхука после подписки проверяют по первому реальному `bot_started` в логах (нажать «Старт» в чате с ботом).

## 7.7. Тексты сообщений бота

- Шаблоны Jinja2 `app/max/messages/*.txt.j2`, один файл на вид сообщения. Тексты в шаблонах — это единственное место, где тексты бэкенда пишутся по-русски напрямую; для тестов каждый шаблон рендерится с образцовыми данными (snapshot-тест).
- **Формат — простой текст без `format`.** Имя клиента и комментарий — пользовательские данные; с `markdown`/`html` их пришлось бы экранировать, и ошибка экранирования ломала бы сообщение или позволяла подделать разметку.
- Длина итогового текста ≤ 4000 — проверка перед отправкой, обрезка комментария с «…».
- Каждое сообщение клиенту содержит кнопку `open_app` «Мои записи» (поля кнопки — **сверить**).

Примеры (финальные формулировки — в шаблонах):

```text
Вы записаны ✅
Стрижка мужская, 25 октября (суббота), 10:00–11:00
Специалист: Анна
Адрес: …
Отменить или перенести можно до 08:00 25 октября — кнопка «Мои записи».
```

```text
Напоминаем: завтра в 10:00 — Стрижка мужская.
Если планы изменились, перенесите или отмените запись — кнопка «Мои записи».
```

Дата и время в текстах — в `BUSINESS_TZ`, формат через `babel` (`format_datetime` с локалью `ru`), день недели прописью.

# 8. Уведомления и воркер

## 8.1. Канал `max_user`

```python
class MaxUserChannel:
    name = "max_user"
    async def send(self, kind: str, booking: BookingView) -> None:
        text = render(f"{kind}.txt.j2", booking=booking, business=business_info)
        await self.client.send_message(user_id=booking.max_user_id, text=text,
                                       keyboard=keyboards.my_bookings())
```

- Если у записи нет `max_user_id` (ручная запись из админки) — задача сразу `cancelled` с причиной `no_max_user`.
- Ответ Bot API `401` (неверный токен) → задача не повторяется, статус `failed`, лог `error`.
- Отправка клиенту, который не запускал бота, может быть невозможна — поведение API **сверить**; ошибку такого рода не повторять.

## 8.2. Перед отправкой напоминания

Воркер заново читает запись: если статус уже не `confirmed` или время записи изменилось — задача `cancelled`, сообщение не отправляется. Это вторая линия защиты на случай, если отмена задач при смене статуса не сработала.

## 8.3. Владельцу

`booking_created_owner` и `booking_cancelled_owner` — через каналы ТЗ-1 §9.1 (email и, если настроен, чат владельца в MAX). В письме: номер записи, услуга, специалист, дата и время, имя, телефон, ссылка на запись в админке.

## 8.4. Ограничение скорости к Bot API

В `max/client.py` — асинхронный ограничитель «token bucket» на 20 запросов в секунду на процесс; воркер в проде один. Ответ `429` от MAX → повтор задачи через backoff (ТЗ-1 §9.2).

## 8.5. Новые фоновые задачи (раз в час)

- Перевод прошедших записей: `confirmed` с `ends_at < now() − 12 ч` → `completed`, если администратор не отметил `no_show` (статус «пришёл» по умолчанию).
- Очистка `max_updates` старше 7 дней.
- Обезличивание записей старше `LEAD_RETENTION_DAYS` — как заявки (ТЗ-1 §14 п. 7), плюс `max_user_id → NULL`, `comment → NULL`.

# 9. Контракт API

Префикс `/api/v1`. Формат ошибок — ТЗ-1 §7.3. Новые коды ошибок:

| HTTP | code | Когда |
|---|---|---|
| 401 | `max_init_data_missing` / `max_init_data_invalid` / `max_init_data_expired` | Проблема с подписью мини-приложения |
| 403 | `not_owner` | Чужая запись |
| 409 | `slot_taken` | Время уже занято |
| 409 | `too_late_to_change` | Прошёл срок отмены/переноса |
| 409 | `booking_not_active` | Запись уже отменена/завершена |
| 409 | `conflicts_with_bookings` | Изменение графика задевает существующие записи; в ответе список `bookings` |
| 409 | `has_future_bookings` | Нельзя удалить сотрудника с будущими записями |
| 422 | `service_not_bookable`, `resource_not_available`, `slot_out_of_range` | Коды ошибок полей |

## 9.1. Мини-приложение (заголовок `X-Max-Init-Data`)

| Метод | Путь | Вход | Ответ |
|---|---|---|---|
| GET | `/max/app/bootstrap` | — | `200 {user: {first_name}, business: {name, phone, address, timezone}, services: [...], resources: [...], settings: {cancel_deadline_min, horizon_days}, legal: {policy_version, privacy_url, consent_url, terms_url, operator, support}}` |
| GET | `/max/app/availability/days` | `service`, `resource` (`any` или uuid), `from`, `to` (≤ 31 день) | `200 [{date, available}]` |
| GET | `/max/app/availability/slots` | `service`, `resource`, `date` | `200 {date, slots: [{starts_at, ends_at}]}` (без буфера; для `any` ресурсы не раскрываются) |
| POST | `/max/app/bookings` | `BookingCreate` + заголовок `Idempotency-Key` (UUID) | `201 BookingView` / `200` (повтор) / `409` / `422` / `429` |
| GET | `/max/app/bookings` | `scope=upcoming\|past`, `page` | `200 {items, page, total}` — только свои |
| GET | `/max/app/bookings/{id}` | — | `200 BookingView` / `403` / `404` |
| POST | `/max/app/bookings/{id}/cancel` | `{version}` | `200 BookingView` / `409` |
| POST | `/max/app/bookings/{id}/reschedule` | `{starts_at, resource_id \| null, version}` + `Idempotency-Key` | `201 BookingView` (новая) / `409` |
| GET | `/max/app/bookings/{id}/calendar.ics` | — | `text/calendar` (только своя запись) |
| POST | `/max/app/leads` | как `LeadCreate` ТЗ-1, `source = max` | `201 {public_number}` |
| POST | `/max/app/demo-session` | `{first_name}`; **без** `X-Max-Init-Data`; только при `MAX_DEMO_BRIDGE=true`, иначе `404` | `200 {init_data}` (§10.9) |

```python
class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    service_slug: str
    resource_id: UUID | None             # None = любой специалист
    starts_at: AwareDatetime
    name: Annotated[str, StringConstraints(min_length=2, max_length=100)]
    phone: Annotated[str, StringConstraints(max_length=32)]
    contact_proof: ContactProof | None = None   # {phone, authDate, hash} из requestContact
    comment: Annotated[str, StringConstraints(max_length=500)] | None = None
    consent: Literal[True]
    policy_version: str
```

`BookingView`: `id`, `public_number`, `status`, `service {slug, title}`, `resource {id, name, title}`, `starts_at`, `ends_at`, `can_change` (до дедлайна и `confirmed`), `change_deadline`, `version`.

## 9.2. Вебхук

`POST /max/webhook` — §7.6. Не входит в OpenAPI-схему клиента.

## 9.3. Админка (cookie + CSRF, как ТЗ-1 §8.2)

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/admin/bookings` | `date_from`, `date_to` (≤ 62 дня), `resource_id`, `status`, `q`, `page` |
| GET | `/admin/bookings/calendar` | `date` → `{resources, bookings, working: {resource_id: [[start,end]]}}` для дневного вида |
| GET | `/admin/bookings/{id}` | Запись + история |
| POST | `/admin/bookings` | Ручная запись: `{service_slug, resource_id, starts_at, name, phone, comment, notify_client: false}`; `consent_id` не нужен (`source = admin`) |
| PATCH | `/admin/bookings/{id}` | `{status: completed \| no_show \| cancelled_by_business, cancel_reason?, version}` |
| POST | `/admin/bookings/{id}/reschedule` | `{starts_at, resource_id, version, notify_client: true}` |
| POST | `/admin/bookings/{id}/notes` | `{text}` |
| GET | `/admin/bookings/slots` | Как в мини-приложении, но с параметром `ignore_lead_time=true` (администратор может записать на ближайшее время) |
| GET / POST | `/admin/resources` | Список / создание `{name, title, sort_order}` |
| PATCH / DELETE | `/admin/resources/{id}` | Изменение / удаление (`409 has_future_bookings`; вместо удаления — `is_active=false`) |
| PUT | `/admin/resources/{id}/services` | `{service_slugs: [...]}` — замена целиком |
| GET / PUT | `/admin/resources/{id}/working-hours` | Неделя целиком `{days: {1: [[540, 780], [840, 1200]], …}}`; параметр `force` — см. ниже |
| GET / POST | `/admin/resources/{id}/exceptions` | Список на диапазон дат / создание `{date, kind, intervals, note}` |
| DELETE | `/admin/resources/{id}/exceptions/{eid}` | Удаление |
| GET / PATCH | `/admin/booking-settings` | Настройки с `version` |

**Конфликты графика:** если новый график или исключение оставляет существующие подтверждённые записи вне рабочего времени — `409 conflicts_with_bookings` со списком записей. Повторный запрос с `force: true` и `cancel_conflicting: true` сохраняет график и отменяет эти записи с причиной «Изменение графика» и уведомлением клиентов; с `force: true` без отмены — график сохраняется, записи остаются (администратор договорится сам). Выбор делает человек в диалоге (раздел 11.6).

# 10. Мини-приложение (`apps/max-app`)

## 10.1. Технически

- Vue 3 + TypeScript + Vite, **SPA без пререндера** (вне MAX его не индексируют).
- Пакеты `@app/ui`, `@app/i18n`, `@app/api-client` — те же, что в проекте 1.
- **Роутер — `createMemoryHistory()`** (MUST). Параметры запуска MAX передаются во фрагменте адреса (после `#`); hash-роутер их перезапишет, а изменение пути может сломать повторную загрузку. Память роутера не трогает адрес вообще.
- Мост MAX подключается тегом `<script>` в `index.html` до основного бандла. Вся работа с ним — **только через адаптер** `useMaxBridge()` (§10.3); прямые обращения к `window.WebApp` вне адаптера запрещены правилом ESLint `no-restricted-globals`/`no-restricted-properties`.
- `@tanstack/vue-query` для данных; состояние шагов записи — Pinia-стор `useBookingDraft`.
- Мобильная вёрстка с учётом безопасных зон: `padding-bottom: max(var(--space-4), env(safe-area-inset-bottom))` у нижней панели; `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- Тема — светлая/тёмная по `prefers-color-scheme` (мост не даёт тему).
- Бюджет: JS первой загрузки ≤ 150 КБ gzip; первый экран с данными < 1,5 с на мобильном профиле Lighthouse.

## 10.2. Поддомен и заголовки

- `max.example.ru` (переменная `MINIAPP_ORIGIN`), отдаётся Caddy, `/api/*` проксируется на API, как в ТЗ-1 §3.1.
- CSP: `script-src 'self' https://st.max.ru`; `connect-src 'self'`; `img-src 'self' data:`.
- `frame-ancestors`: мини-приложение может открываться во встроенном окне веб-версии MAX. Начальное значение — `frame-ancestors 'self' https://*.max.ru`; **сверить** на веб-версии MAX и desktop-клиенте, сузить до конкретных доменов.
- `<meta name="robots" content="noindex">`.

## 10.3. Адаптер `useMaxBridge()`

```ts
export interface MaxBridge {
  readonly available: boolean          // window.WebApp есть и initData не пустой
  readonly initData: string
  readonly platform: 'ios' | 'android' | 'desktop' | 'web' | 'unknown'
  readonly startParam: string | null
  readonly userFirstName: string | null
  requestContact(): Promise<ContactProof | null>   // null — отказ или недоступно
  backButton: { show(): void; hide(): void; onClick(cb: () => void): () => void }
  closingConfirmation(enabled: boolean): void
  haptic: { selection(): void; success(): void; error(): void }  // на desktop/web — no-op
  openLink(url: string): void          // внешние → openLink, max.ru → openMaxLink
  downloadFile(url: string, name: string): Promise<boolean>     // false — не поддерживается
}
```

- Каждый вызов метода моста — в `try/catch`; отказ промиса `{error: {code}}` логируется в консоль только в dev и превращается в «недоступно», а не в падение интерфейса.
- Функции, которых нет на платформе (`HapticFeedback`, `downloadFile` в браузере), заменяются no-op / `false` по `platform`.
- `BackButton`: адаптер хранит ссылку на колбэк и возвращает функцию отписки (документация требует `offClick` с той же ссылкой).

## 10.4. Экраны и шаги

Шаги записи: **Услуга → Специалист → Дата → Время → Контакты → Подтверждение**. Вверху каждого шага — `StepHeader` «Шаг 2 из 5» + заголовок шага. Внизу — `BottomBar` с главной кнопкой. Системная кнопка MAX «Назад» показывается со второго шага и ведёт на предыдущий шаг; на первом шаге скрыта.

Выбор на любом шаге сохраняется в `useBookingDraft`; при возврате назад выбранное остаётся. Если на шаге «Специалист» меняется выбор — выбранные дата и время сбрасываются (они зависят от специалиста). Если меняется услуга — сбрасываются специалист, дата, время.

### Запуск (`/`)

| Состояние | Что видит пользователь |
|---|---|
| Загрузка | `Skeleton` заголовка и трёх карточек |
| Открыто вне MAX (нет `initData`) и не демо | `EmptyState`: «Откройте приложение в MAX» + кнопка-ссылка на бота (`buildMaxBotLink()`) |
| `401 max_init_data_expired` | `EmptyState`: «Сессия устарела. Закройте и откройте приложение из чата с ботом» |
| Ошибка сети | `ErrorState` с «Повторить» |
| Успех | Главный экран |

### Главный экран

- Шапка: название бизнеса, адрес одной строкой, `Badge` «Демо» при `demo`.
- `Tabs`: «Записаться» / «Мои записи» (с числом предстоящих в `Badge`).
- Вкладка «Записаться» = шаг 1.
- В подвале — ссылки «Политика конфиденциальности», «Пользовательское соглашение», «Об операторе и поддержка» (требование MAX), открываются через `openLink`.
- Если `start_param` содержит slug услуги (`s_<slug>`) — услуга предвыбрана, открывается шаг 2.

### Шаг 1. Услуга

- Список `SelectableCard` (роль `radio` в `radiogroup`): название, длительность «1 ч» / «45 мин» (через `Text` с плюрализацией), цена «от 1 500 ₽».
- Выбор → сразу переход к шагу 2 (без кнопки «Далее»), `haptic.selection()`.
- Пусто (нет услуг с `bookable`) → `EmptyState` «Онлайн-запись пока недоступна» + кнопка «Позвонить» (`tel:` через `openLink`).

### Шаг 2. Специалист

- Первая карточка — «Любой свободный специалист» (подпись «Подберём ближайшее время»).
- Далее — сотрудники, которые оказывают услугу: имя, должность.
- Если сотрудник один — шаг пропускается автоматически, выбирается он.

### Шаг 3. Дата

- `DateStrip` — горизонтальная лента дней на `horizon_days` вперёд: день недели, число, месяц при смене месяца. Дни без свободного времени — недоступны (визуально и `aria-disabled`), но видимы.
- Данные — `availability/days` порциями по 14 дней; следующая порция подгружается при прокрутке ленты к концу.
- По умолчанию выбран ближайший доступный день; выбор даты → шаг 4.
- Нет ни одного доступного дня → `EmptyState` «Свободного времени нет» + кнопки «Выбрать другого специалиста» и «Оставить заявку» (экран заявки).

### Шаг 4. Время

- Вверху — выбранная дата (нажатие возвращает на шаг 3).
- `SlotGrid` — кнопки времени группами «Утро» (до 12:00), «День» (12–17), «Вечер» (после 17); пустые группы не показываются. Сетка 4 колонки, кнопка не меньше 44×44 px.
- Выбор → подсветка, `haptic.selection()`, `BottomBar` «Далее: 10:00–11:00».
- Данные устаревают за 60 с (`staleTime`); при возврате на экран — обновляются.
- Время в интерфейсе — в часовом поясе **бизнеса**, с подписью часового пояса, если он отличается от часового пояса устройства («время новосибирское»).

### Шаг 5. Контакты

- `Field` «Имя» — предзаполнено `first_name` из MAX, редактируемое.
- Телефон:
  - кнопка `secondary` «Поделиться номером из MAX» → `requestContact()`; успех — номер подставляется, поле только для чтения с кнопкой «Изменить»; отказ или ошибка — toast «Не удалось получить номер, введите вручную»;
  - либо `PhoneInput` вручную (ТЗ-1 §10.3).
- `Textarea` «Комментарий» (необязательно, ≤ 500, счётчик).
- `Checkbox` согласия на обработку ПДн со ссылками — **не отмечен по умолчанию** (ТЗ-1 §14).
- `BottomBar` «Далее» — валидирует форму (`useForm` ТЗ-1 §10.3).

### Шаг 6. Подтверждение

- Сводка: услуга, специалист (или «Любой свободный»), дата и время, длительность, цена «от», имя, телефон, комментарий. Каждый пункт — ссылка «Изменить» на свой шаг.
- Текст о правилах: «Отменить или перенести можно до 08:00 25 октября».
- `BottomBar` `primary` «Записаться».
- Пока запись не создана — включено подтверждение закрытия (`closingConfirmation(true)`).
- Отправка: кнопка в `loading`; `Idempotency-Key` генерируется **один раз** при входе на шаг и переиспользуется при повторной отправке.

| Результат | Поведение |
|---|---|
| `201` | Экран успеха, `haptic.success()`, `closingConfirmation(false)`, черновик очищается |
| `409 slot_taken` | Toast «Это время только что заняли», переход на шаг 4 с обновлённым списком |
| `422` | Ошибки раскладываются по полям шага 5, переход на шаг 5 |
| `429` | `Alert` с временем ожидания |
| Сеть/таймаут 15 с | `Alert` «Нет соединения» + «Повторить» (тот же `Idempotency-Key` — повтор не создаст вторую запись) |

### Экран успеха

- Иконка, `Heading` «Вы записаны», номер записи, сводка.
- «Сообщение с подтверждением пришло в чат с ботом».
- Кнопки: `secondary` «Добавить в календарь» (только `ios`/`android`, через `downloadFile` на `calendar.ics`), `ghost` «Мои записи».
- Фокус — на заголовок.

### Мои записи

- Подвкладки «Предстоящие» / «Прошедшие».
- Карточка: дата и время крупно, услуга, специалист, `Badge` статуса, номер.
- Для `can_change = true`: кнопки «Перенести» и `danger ghost` «Отменить».
- Для `can_change = false` у предстоящей: текст «Изменить запись можно по телефону» + кнопка «Позвонить».
- Пусто: «У вас пока нет записей» + кнопка «Записаться».
- **Отмена:** `Dialog` «Отменить запись на 25 октября, 10:00?» / «Отменить запись» / «Не отменять» → успех: toast «Запись отменена», карточка переходит в «Прошедшие» со статусом. `409 too_late_to_change` → toast и обновление карточки.
- **Перенос:** открываются шаги 3–4 (дата и время) с той же услугой и специалистом, переключатель «Другой специалист» возвращает на шаг 2; подтверждение «Перенести с 25.10 10:00 на 26.10 12:00?»; результат как у создания.

### Заявка, если нет времени

Форма ТЗ-1 §12.3 в укороченном виде: имя (предзаполнено), телефон (с кнопкой «Поделиться номером»), сообщение (предзаполнено: «Хочу записаться на <услугу>, не нашёл подходящего времени»), согласие. Отправка на `/max/app/leads`. Успех — «Заявка № N принята, администратор свяжется с вами».

## 10.5. Состояния ошибок API

Глобальный обработчик: `401 max_init_data_*` → экран «Сессия устарела» (без бесконечных повторов); `5xx` → `ErrorState` текущего экрана; сетевые ошибки → `Alert` с «Повторить». Тексты — по коду ошибки через i18n.

## 10.6. Доступность

Требования ТЗ-1 §16. Дополнительно: лента дат и сетка времени управляются стрелками клавиатуры (`roving tabindex`), у недоступных дней и времени — `aria-disabled` и пояснение для скринридера.

## 10.7. Аналитика

Нет. Мини-приложение не загружает сторонних скриптов, кроме моста MAX.

## 10.8. Кнопка на лендинге

В проекте 1 при `max.bookingEnabled`: в `HeroSection` вторая кнопка становится «Записаться онлайн» (ссылка `buildMaxBotLink()`), в `ServicesSection` у услуг с `bookable` кнопка «Записаться» ведёт на бота с `startapp=s_<slug>`. Кнопка «Оставить заявку» остаётся.

## 10.9. Режим демо вне MAX

Нужен, чтобы портфолио работало, даже если бот ещё не опубликован, и чтобы e2e-тесты шли без MAX.

- Включается, только если в сборке `demo: true` и на сервере `MAX_DEMO_BRIDGE=true`.
- Если при запуске `window.WebApp` отсутствует, мини-приложение показывает экран «Демо-режим: открыто вне MAX» с полем «Ваше имя» и кнопкой «Продолжить».
- По кнопке фронтенд запрашивает `POST /max/app/demo-session {first_name}` → сервер возвращает `initData`, **подписанный `MAX_DEMO_BOT_TOKEN`**, со случайным отрицательным `user.id` (не пересекается с настоящими id MAX), `auth_date = now`.
- Проверка подписи на сервере: сначала настоящим токеном, при неудаче и включённом демо — демо-токеном. Пользователи демо помечены, их записи видны в админке с `Badge` «Демо».
- Имитация моста: `requestContact` → `null` (только ручной ввод), haptic — no-op, `BackButton` — своя кнопка в шапке.
- Эндпоинт `demo-session` ограничен rate limit (5 в 10 минут на IP) и **отсутствует**, если `MAX_DEMO_BRIDGE=false` (`404`).
- Тест: в сборке без `demo` нет кода демо-моста (поиск по бандлу).

# 11. Админка: новые разделы

Каркас, вход, общие правила — ТЗ-1 §13. Меню дополняется пунктами **«Записи»**, **«Сотрудники»**, **«Настройки записи»**. Счётчик в меню у «Записи» — число записей на сегодня.

## 11.1. «Записи» — календарь дня (`/bookings`)

- Панель: кнопки «‹» / «Сегодня» / «›», выбор даты (`Input type=date`), переключатель вида «День» / «Список», кнопка `primary` «Записать клиента».
- **`TimeGrid`** — колонки = активные сотрудники, строки = время с шагом `slot_step_min`, диапазон — от самого раннего начала до самого позднего конца работы за день (± 1 ч).
  - Нерабочее время — серый фон с штриховкой.
  - Запись — блок на всю длительность (буфер — бледным хвостом), внутри: время, услуга, имя; цвет по статусу.
  - Клик по записи → `Drawer` с карточкой (§11.3).
  - Клик по свободной ячейке → `Drawer` ручной записи с предзаполненными сотрудником и временем.
  - Линия «сейчас» на текущем дне, автопрокрутка к ней.
  - На мобильном — по одному сотруднику, переключение `Select`.
- Обновление каждые 60 с, пока вкладка активна. Дата и вид — в URL.

## 11.2. «Записи» — список (`/bookings?view=list`)

`DataTable`: №, дата и время, сотрудник, услуга, клиент, телефон, источник (`Badge` «MAX» / «Админка» / «Демо»), статус. Фильтры: период, сотрудник, статус, поиск по имени/телефону/номеру. Экспорт CSV по правилам ТЗ-1 §8.2.

## 11.3. Карточка записи (`Drawer`)

- Заголовок «Запись № 45», `Badge` статуса, источник.
- Дата, время, длительность, услуга, сотрудник.
- Клиент: имя, телефон с «Позвонить»/«Скопировать», пометка «номер подтверждён MAX», комментарий.
- Действия для `confirmed`:
  - «Пришёл» (→ `completed`), «Не пришёл» (→ `no_show`) — доступны с момента начала записи;
  - «Перенести» → выбор даты/времени (те же компоненты, слоты через `/admin/bookings/slots`), чекбокс «Уведомить клиента в MAX» (включён, если есть `max_user_id`);
  - `danger` «Отменить» → `Dialog` с обязательным полем «Причина» и чекбоксом «Уведомить клиента».
- Заметки и история — как у заявок (ТЗ-1 §13.5).
- `409 version_conflict` — как в ТЗ-1.

## 11.4. Ручная запись

`Drawer` «Записать клиента»: услуга → сотрудник → дата → время (свободные слоты, без ограничения `min_lead`) → имя → телефон → комментарий. Согласие не требуется (данные вносит сотрудник со слов клиента; основание обработки — договор, это отмечено в шаблоне политики). Успех → запись на календаре, toast.

## 11.5. «Сотрудники» (`/resources`)

- Список: имя, должность, услуги (`Badge` списком), статус «Активен / Скрыт», порядок (кнопки «вверх/вниз», `aria-label`).
- «Добавить сотрудника» → `Drawer`: имя, должность, услуги (группа `Checkbox` по каталогу `bookable`).
- Карточка сотрудника — вкладки «Профиль», «График», «Исключения».
- Удаление: при будущих записях — `Dialog` «У сотрудника 3 будущие записи. Скрыть сотрудника?» (скрытый не показывается клиентам, записи остаются).

## 11.6. График (`WeekScheduleEditor`)

- 7 строк (Пн–Вс), у каждой — переключатель «Рабочий день» и список интервалов `TimeRangeInput` «с 09:00 по 13:00», кнопки «+ интервал» и «удалить».
- Валидация на клиенте: начало < конца, интервалы дня не пересекаются, шаг 5 минут.
- «Скопировать понедельник на будни» и «Сбросить изменения».
- «Сохранить» → `PUT working-hours`. При `409 conflicts_with_bookings` — `Dialog` со списком затронутых записей и тремя действиями: «Отменить эти записи и уведомить клиентов», «Сохранить и оставить записи», «Не сохранять».

## 11.7. Исключения

Список на 60 дней вперёд + «Добавить»: дата, тип («Выходной» / «Особые часы» с интервалами), примечание. Конфликты — тот же диалог, что в §11.6.

## 11.8. «Настройки записи» (`/booking-settings`)

Шаг времени (`Select`: 5/10/15/20/30/60 мин), «Записываться не ранее чем за» (часы/минуты), «Горизонт записи» (дней), «Отмена и перенос не позднее чем за», «Напоминания клиентам» (переключатель). Пояснения под каждым полем. Сохранение с `version`.

# 12. Дизайн-система: новые компоненты (`packages/ui`)

Требования ТЗ-1 §10.1 действуют полностью: токены, `Text`, i18n-ключи, истории в Storybook на каждое состояние, тесты, axe.

| Компонент | Ключевые пропсы | Поведение и доступность |
|---|---|---|
| `Tabs` | `items: {id, label: MessageKey, badge?: number}[]`, `v-model` | `role="tablist"`, стрелки влево/вправо, `aria-selected`, панели `role="tabpanel"` |
| `StepHeader` | `step`, `total`, `title: MessageKey` | «Шаг 2 из 5» + полоса прогресса (`role="progressbar"`, `aria-valuenow`) |
| `SelectableCard` | `v-model`, `value`, `title`, `subtitle`, `meta`, `disabled` | Карточка-радио: нативный `input type=radio` внутри, вся карточка кликабельна |
| `DateStrip` | `days: {date, available}[]`, `v-model`, `@reach-end` | `role="listbox"` горизонтальный, стрелки, `aria-disabled`, автопрокрутка к выбранному |
| `SlotGrid` | `groups: {label, slots: {value, label}[]}[]`, `v-model` | Кнопки-радио в `radiogroup` по группам, сетка 4 колонки (3 на узких экранах) |
| `BottomBar` | слоты `primary`, `secondary` | Липкая панель снизу, учёт `safe-area-inset-bottom`, тень при прокрутке контента под ней |
| `ListItem` | `title`, `subtitle`, `meta`, `to` / `@click`, слоты | Строка списка, вся кликабельна |
| `TimeRangeInput` | `v-model: [startMin, endMin]`, `step` | Два `input type=time` со связанной проверкой; ошибка через `Field` |
| `WeekScheduleEditor` | `v-model: Record<1..7, [number, number][]>` | Описан в §11.6 |
| `TimeGrid` | `columns`, `startMin`, `endMin`, `step`, `events`, `unavailable`, `now`, слот события | Описан в §11.1; клавиатура: Tab по событиям, Enter открывает; у каждого события `aria-label` «10:00–11:00, Стрижка, Иван» |
| `Duration` | `minutes` | `Text` с плюрализацией: «45 мин», «1 ч», «1 ч 30 мин» |
| `Money` | `amount`, `from?: boolean` | `Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 0})`, «от 1 500 ₽» |
| `DateTimeText` | `value`, `format: 'date' \| 'time' \| 'datetime' \| 'weekday-date'`, `tz` | `Intl.DateTimeFormat('ru-RU', {timeZone: tz})` |

`Duration`, `Money`, `DateTimeText` используются во **всех** местах вывода длительности, денег и дат — в мини-приложении, админке и сайте. Форматирование вручную запрещено.

# 13. i18n

Новые разделы словаря: `max.*` (мини-приложение), `booking.*` (общие понятия записи: статусы, правила), `admin.bookings.*`, `admin.resources.*`, `admin.bookingSettings.*`, `errors.api.slot_taken` и другие коды §9. Плюрализация длительности и количества («3 записи»). Подпись ресурса («Сотрудник» / «Мастер» / «Пост») — ключ `booking.resourceLabel.*`, выбирается в конфиге.

Проверки ТЗ-1 §11.4 распространяются на `apps/max-app`.

# 14. Персональные данные и правила MAX

Всё из ТЗ-1 §14, плюс:

1. Согласие на обработку ПДн в мини-приложении — тот же порядок: чекбокс не отмечен, версия политики фиксируется в `consents`.
2. `max_user_id` — персональные данные (идентификатор пользователя): в логах только хеш, при обезличивании → `NULL`.
3. Телефон из `requestContact` запрашивается только по нажатию кнопки, с пояснением «Номер нужен, чтобы администратор мог с вами связаться».
4. В мини-приложении доступны: политика конфиденциальности, пользовательское соглашение, сведения об операторе (наименование, ИНН/ОГРН, адрес) и контакты поддержки — требование размещения в MAX. В демо — тестовые данные с пометкой.
5. Сообщения бота — только о записях клиента. Рассылок и рекламы нет.
6. Текст политики дополняется разделом про MAX: какие данные приходят из MAX (имя, идентификатор, телефон по согласию), цели, срок хранения. Это шаблон, который владелец бизнеса проверяет с юристом.

# 15. Безопасность — дополнения

| Угроза | Мера |
|---|---|
| Подделка пользователя мини-приложения | Проверка подписи `initData` на **каждом** запросе; `initDataUnsafe` не используется на сервере |
| Повтор старой подписи | Срок `auth_date` 24 ч |
| Доступ к чужой записи | Проверка `max_user_id` в каждом запросе к записи → `403 not_owner`; тест на каждый эндпоинт |
| Поддельный вебхук | Секрет в `X-Max-Bot-Api-Secret`, сравнение за постоянное время |
| Утечка токена бота | Только в env; в логах маскируется; токен не попадает во фронтенд-сборку (тест поиском по бандлу) |
| Двойная запись при гонке | Ограничение исключения в БД + `Idempotency-Key` |
| Спам записями | Rate limit на пользователя MAX; в демо — на IP |
| Демо-подпись в проде | Отдельный демо-токен, проверка при старте (§4.1), `demo-session` выключен без флага |
| Инъекция разметки в сообщения бота | Простой текст без `format` |
| Отключение проверки TLS к MAX | Запрещено; сертификат Минцифры добавляется в доверенные в образе |

# 16. Тестовая среда — дополнения

Инфраструктура тестов — ТЗ-1 §17. Пороги покрытия: `booking/` и `max/` ≥ 95%.

## 16.1. Расчёт слотов

- **Таблица случаев** (pytest `parametrize`): обычный день; перерыв на обед; интервал короче услуги; буфер не помещается в конец дня; запись впритык к другой; исключение-выходной; особые часы; `min_lead` отсекает утро; горизонт; шаг 15/30/60; длительность не кратна шагу.
- **Генеративные тесты** (`hypothesis`) — инварианты на случайных графиках и записях:
  - каждый слот + длительность + буфер внутри рабочего интервала;
  - ни один слот не пересекается с занятыми интервалами;
  - каждый слот выровнен по шагу от начала рабочего интервала;
  - все слоты ≥ `now + min_lead` и < горизонта;
  - результат отсортирован и без дубликатов;
  - (полнота) если момент удовлетворяет всем условиям — он есть в результате.
- **Часовые пояса:** `Asia/Novosibirsk`, `Europe/Moscow`, `Europe/Kaliningrad`, `Asia/Vladivostok`; день записи на стыке суток UTC (работа до 23:00 по Владивостоку = следующий день UTC).

## 16.2. Запись

- Две параллельные попытки (`asyncio.gather`, две отдельные сессии БД) на одно время одного сотрудника → ровно одна `201`, другая `409 slot_taken`.
- То же для «любого специалиста» при двух сотрудниках → обе успешны, разные сотрудники; при одном → одна `409`.
- Повтор с тем же `Idempotency-Key` → `200`, в БД одна запись.
- Перенос на пересекающееся со старым время того же сотрудника → успех.
- Отмена после дедлайна → `409 too_late_to_change`; чужая запись → `403`.
- После отмены задачи напоминаний в outbox → `cancelled`; воркер не шлёт напоминание отменённой записи, даже если задача осталась `pending` (§8.2).
- Изменение графика с конфликтом → `409` со списком; с `force` и `cancel_conflicting` → записи отменены, клиентам поставлены уведомления.
- Ограничение `ex_bookings_no_overlap` проверяется напрямую SQL-вставкой в обход сервиса.

## 16.3. MAX

- `initData`: тестовые векторы строятся по алгоритму §2.4 тестовым токеном; случаи — верная подпись; изменённое значение; отсутствующий `hash`; два `hash`; дубликат любого ключа; значение с `+` и с `%2B`; просроченный `auth_date`; подпись чужим токеном. Если в документации MAX есть пример с известным результатом — добавить его как отдельный тест.
- `requestContact`: верная и неверная подпись (по уточнённой формуле §2.5).
- Вебхук: без секрета/с неверным → `401`; повтор того же тела → одно действие; `bot_started` → одна задача `bot_welcome`; неизвестный тип → `200`.
- Клиент Bot API — через `respx` (имитация HTTP): отправляемые URL, заголовок `Authorization`, тело, клавиатура; ответы `429`, `401`, `500`, таймаут; соблюдение 20 rps.
- Шаблоны сообщений — snapshot-тесты; длина ≤ 4000; данные клиента выводятся как есть, без интерпретации разметки.

## 16.4. Фронтенд

- `useMaxBridge` — тесты с поддельным `window.WebApp`: отсутствие моста, отказ `requestContact`, отписка `BackButton`, no-op haptic на `web`.
- `useBookingDraft` — сбросы зависимых шагов, `Idempotency-Key` не меняется при повторной отправке.
- Компоненты §12 — истории и тесты по ТЗ-1 §17.3; `DateStrip`, `SlotGrid`, `TimeGrid` — клавиатура.

## 16.5. E2E (Playwright)

Окружение `compose.test.yml` + сервис `max-app` + **заглушка Bot API** `e2e/max-api-stub` — маленькое FastAPI-приложение, которое принимает `POST /messages`, `GET /me`, `POST/GET /subscriptions`, отвечает по схеме MAX и сохраняет все запросы; тесты читают их через `GET /__requests` и очищают через `DELETE /__requests`. `MAX_API_BASE` в тестовом окружении указывает на заглушку. Мост MAX в браузере подменяется: `page.route('https://st.max.ru/**')` отдаёт тестовый скрипт, создающий `window.WebApp` с `initData`, подписанным тестовым токеном.

Сценарии:

1. Запись: услуга → любой специалист → ближайший день → первое время → контакты вручную → «Записаться» → экран успеха → в имитации Bot API пришёл `POST /messages` с подтверждением; в Mailpit — письмо владельцу.
2. Гонка из UI: два контекста браузера выбирают одно время, первый записывается, второй получает toast «время заняли» и обновлённый список.
3. Мои записи → отмена → статус «Отменена», владельцу письмо об отмене.
4. Перенос на другой день → старая запись «Перенесена», новая предстоящая.
5. Нет времени → «Оставить заявку» → заявка видна в админке проекта 1 с источником MAX.
6. Админка: создать сотрудника, назначить услуги, задать график → в мини-приложении появились слоты.
7. Админка: выходной на день с записью → диалог конфликта → «Отменить и уведомить» → клиенту отправлено сообщение.
8. Админка: календарь дня показывает запись из сценария 1; «Пришёл» → статус.
9. Открытие вне MAX без демо → экран «Откройте приложение в MAX»; с демо → демо-вход и запись.
10. Все экраны мини-приложения и новые экраны админки — axe без нарушений; мобильный вьюпорт 390×844.
11. **Регрессия:** все e2e-сценарии проекта 1 проходят.

# 17. Инфраструктура и деплой

## 17.1. Compose

- Новый статический фронтенд `max-app` собирается в образ Caddy вместе с сайтом и админкой (ТЗ-1 §19).
- Воркер — без изменений в compose (новые задачи — в коде).
- В образ API добавляются корневые сертификаты Минцифры (`update-ca-certificates`), отпечаток проверяется при сборке.

## 17.2. Caddyfile — новый блок

```text
max.{$SITE_DOMAIN} {
  import security_headers
  encode zstd gzip
  header Content-Security-Policy "default-src 'self'; script-src 'self' https://st.max.ru; connect-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'self' https://*.max.ru; base-uri 'self'; form-action 'self'"
  handle /api/* {
    reverse_proxy api:8000
  }
  handle {
    root * /srv/max-app
    try_files {path} /index.html
    file_server
  }
}
```

## 17.3. Порядок запуска в проде

1. Выполнить деплой обновления (ТЗ-1 §20, обновление) — миграции применятся автоматически.
2. DNS: A-запись `max.example.ru` → IP VDS.
3. Проверить `https://max.example.ru` в браузере (в демо-режиме, если включён).
4. На `business.max.ru`: верифицировать организацию, создать бота, заполнить карточку (политика, соглашение, оператор, поддержка), подключить мини-приложение по адресу `https://max.example.ru`, выбрать подпись кнопки, отправить на модерацию.
5. После одобрения — записать `MAX_BOT_TOKEN` и `MAX_WEBHOOK_SECRET` в `.env`, перезапустить `api` и `worker`.
6. `make max-check` → `make max-subscribe`.
7. С телефона: открыть бота → «Старт» → приветствие с кнопкой → запись → подтверждение в чате → запись в админке.
8. Включить `max.bookingEnabled` на сайте и пересобрать.

# 18. План реализации

Каждый этап — DoD + зелёные `make lint typecheck test` + **зелёные e2e проекта 1**.

| Этап | Содержание | Definition of Done |
|---|---|---|
| **P0. Подготовка** | Проверить, что этапы M0–M9 проекта 1 закрыты; расширение каталога услуг; миграция outbox (§3) | Тесты проекта 1 зелёные; новые поля каталога валидируются |
| **P1. Модель** | Таблицы §6, `btree_gist`, ограничения | up/down/up; прямой SQL-тест ограничения исключения |
| **P2. Слоты** | `booking/slots.py` через тесты | Все тесты §16.1, включая генеративные |
| **P3. Запись** | Сервис записи, отмены, переноса; идемпотентность | Тесты §16.2 |
| **P4. MAX-ядро** | `init_data.py`, `contact.py`, зависимость `current_max_user`, API мини-приложения §9.1, демо-сессия | Тесты §16.3 (initData, contact) и API |
| **P5. Бот** | Клиент Bot API, клавиатуры, шаблоны, вебхук, канал `max_user`, напоминания, CLI | Тесты §16.3 (вебхук, клиент, шаблоны); ручная проверка на long polling в dev, если есть токен |
| **P6. Админ-API** | §9.3, конфликты графика | Тесты; schemathesis |
| **P7. UI-компоненты** | §12 | Storybook, axe, покрытие ≥ 90% |
| **P8. Мини-приложение** | §10 целиком | E2E 1–5, 9 |
| **P9. Админка** | §11 | E2E 6–8 |
| **P10. Прод** | Caddy, сертификат Минцифры, деплой §17.3 | Чек-лист §19 |

# 19. Чек-лист приёмки

- [ ] Все тесты и e2e проекта 1 по-прежнему зелёные; после деплоя — все пункты чек-листа проекта 1 выполняются.
- [ ] Запись с телефона в MAX (или в демо-режиме, если публикация недоступна) проходит от начала до конца.
- [ ] Две одновременные записи на одно время невозможны (проверено тестом и вручную в двух окнах).
- [ ] Подтверждение и напоминания приходят в чат; после отмены напоминание не приходит.
- [ ] Отмена и перенос работают до дедлайна и блокируются после.
- [ ] Владелец получает письма о новых записях и отменах.
- [ ] Календарь в админке совпадает с записями; ручная запись, «пришёл/не пришёл», перенос, отмена с уведомлением работают.
- [ ] Изменение графика с конфликтами показывает диалог и ведёт себя по выбору.
- [ ] Время везде показывается в часовом поясе бизнеса.
- [ ] Чекбокс согласия в мини-приложении не отмечен по умолчанию.
- [ ] В мини-приложении доступны политика, соглашение, оператор, поддержка.
- [ ] Токена бота нет во фронтенд-сборке и в логах.
- [ ] Вебхук отвергает запросы без секрета.
- [ ] README дополнен: настройка бота и мини-приложения в MAX, режим демо, команды `max-check` и `max-subscribe`, что делать при смене токена или секрета.

# 20. Типичные ошибки, которых нельзя допускать

1. Доверять `initDataUnsafe` на сервере или брать `user_id` из тела запроса.
2. Hash-роутер в мини-приложении (ломает параметры запуска во фрагменте адреса).
3. Защита от двойной записи только в коде, без ограничения в БД.
4. Вычислять время в «смещении +7» вместо `zoneinfo`.
5. Отправлять сообщения бота прямо в обработчике вебхука или запроса.
6. Отвечать вебхуку не-`200` на ошибки разбора — MAX будет повторять и через 8 часов отпишет бота.
7. Новый `Idempotency-Key` при повторной отправке той же записи.
8. Напоминание об отменённой записи.
9. `markdown`/`html` в сообщениях с данными клиента без экранирования.
10. Отключение проверки TLS к Bot API вместо установки сертификата Минцифры.
11. Придуманные поля кнопки `open_app`, эндпоинты и типы событий MAX, которых нет в документации и OpenAPI-схеме.
12. Сломанные тесты проекта 1.
13. Выдуманные сотрудники, отзывы и «реальные клиенты» в демо без пометки.
