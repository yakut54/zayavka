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
