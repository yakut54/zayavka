# Заявочка (zayavka)

White-label лендинг с приёмом заявок и админкой. Полное ТЗ — `spec.md`.

## Запуск dev

    cp .env.example .env
    docker compose -f infra/compose.dev.yml up -d --build
    # api: http://localhost:8000/docs, Mailpit: http://localhost:8025

## Проверки (Windows без make)

    scripts/uv.sh run pytest --cov=app --cov-fail-under=90   # нужен Docker (testcontainers)
    pnpm install && pnpm lint && pnpm format:check

## Статус этапов

- [x] M0 скелет
- [x] M1 ядро API (миграции: `docker compose -f infra/compose.dev.yml exec api alembic upgrade head`)
- [x] M2 приём заявок
- [x] M3 уведомления (воркер `python -m app.worker`, CLI `python -m app.cli anonymize-expired`)
- [x] M4 авторизация админки (CLI: `python -m app.cli create-admin --email ...`, `reset-password`)
