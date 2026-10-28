# Заявочка (zayavka)

White-label лендинг с приёмом заявок и админкой. Полное ТЗ — `docs/spec.md` (PDF-версия рядом).

## Запуск dev

    cp .env.example .env
    docker compose -f infra/compose.dev.yml up -d --build
    docker compose -f infra/compose.dev.yml exec api alembic upgrade head
    # api: http://localhost:8000/docs, Mailpit: http://localhost:8025

Создать администратора (пароль вводится интерактивно, минимум 12 символов):

    docker compose -f infra/compose.dev.yml exec api python -m app.cli create-admin --email owner@example.ru

Сбросить пароль (заодно завершает все сессии): `python -m app.cli reset-password --email ...`.

## Проверки

На Windows нет `make` и `uv`, поэтому Python-инструменты запускаются в docker через `scripts/uv.sh`:

    scripts/uv.sh run pytest --cov=app --cov-fail-under=90   # нужен Docker (testcontainers, PostgreSQL 18)
    scripts/uv.sh run ruff check . && scripts/uv.sh run mypy --strict app
    scripts/contract.sh                                      # schemathesis против запущенного API
    pnpm install
    pnpm lint            # eslint + stylelint + prettier
    pnpm -r typecheck    # tsc / vue-tsc
    pnpm -r test         # vitest с покрытием
    pnpm i18n:check      # ключи словаря: лишние и отсутствующие
    pnpm --filter @app/ui build-storybook && pnpm --filter @app/ui test-storybook:ci   # axe по всем историям

`PW_CHANNEL=chrome` заставляет Playwright использовать установленный Chrome вместо скачанного Chromium.

## Отступления от ТЗ

- В Vue-пакетах (`packages/ui`, `apps/*`) отключён `exactOptionalPropertyTypes`: `defineProps` типизирует
  необязательные пропсы без `undefined`, и с этим флагом нельзя передать `:prop="maybeUndefined"`. Остальные строгие
  флаги (`strict`, `noUncheckedIndexedAccess`) включены везде (`packages/config/tsconfig.vue.json`).
- Тексты «успешного» и «текущего» цвета (`--color-success`, `--color-warning`, `--color-danger`) темнее значений из
  ТЗ (`green-700`, `amber-700`, `red-700`): иначе они не проходят контраст WCAG AA, который проверяет
  `tokens.contrast.test.ts`. Граница полей — `gray-500` (3:1).
- Прогон axe по Storybook сделан скриптом `packages/ui/scripts/axe-stories.mjs`, а не `@storybook/test-runner`:
  test-runner 0.26 несовместим с Storybook 10.6 (`module.register()` в Jest).

## Статус этапов

- [x] M0 скелет
- [x] M1 ядро API
- [x] M2 приём заявок
- [x] M3 уведомления (воркер `python -m app.worker`, CLI `python -m app.cli anonymize-expired`)
- [x] M4 авторизация админки
- [x] M5 API админки (`make openapi` — схема и типизированный клиент `packages/api-client`)
- [x] M6 дизайн-система (`packages/ui`, `packages/i18n`)
- [x] M7 публичный сайт (`apps/site`, e2e: `pnpm e2e`, Lighthouse: `pnpm exec lhci autorun`)
- [x] M8 админка (`apps/admin`)
- [x] M9 качество (CI, Dependabot, gitleaks)

## Проект 2: онлайн-запись через мини-приложение MAX (docs/spec2.md)

Статус: P0–P9 готовы; P10 (прод) ждёт домен, SMTP, VDS и токен бота. Журналы — `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/QUESTIONS.md`.

- `apps/max-app` — мини-приложение (SPA, роутер в памяти, мост MAX только через `useMaxBridge()`):
  `pnpm --filter @app/max-app dev` (порт 5175, `/api` проксируется на :8000).
  Демо-режим вне MAX включается сборкой с `VITE_DEMO=true` и `MAX_DEMO_BRIDGE=true` на API;
  в обычной сборке его кода нет (`pnpm --filter @app/max-app check-bundle`).
- Админка: разделы «Записи», «Сотрудники», «Настройки записи» (`apps/admin`).
- Ссылка на бота: `apps/max-app/max.config.ts` (`botLink`) и `max.botUsername` в конфиге сайта; кнопки записи на лендинге включает `max.bookingEnabled`.
- E2E: статика (`pnpm --filter @app/site build && pnpm --filter @app/admin build && VITE_DEMO=true pnpm --filter @app/max-app build`),
  `docker compose -p zayavka-test -f infra/compose.test.yml up -d --build --wait`, затем `pnpm --filter @app/e2e e2e`.
  Окружение включает заглушку Bot API (`e2e/max-api-stub`, :19000), мини-приложение на :8082.
  Контрактный прогон (schemathesis) меняет данные стенда — перед e2e пересоздайте его (`down -v`).
- Если Playwright не может скачать браузеры: `PW_CHANNEL=chrome` использует установленный Chrome.
