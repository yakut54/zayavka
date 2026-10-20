# Заявочка (zayavka)

White-label лендинг с приёмом заявок и админкой. Полное ТЗ — `spec.md`.

## Запуск dev

    cp .env.example .env
    docker compose -f infra/compose.dev.yml up -d --build
    # api: http://localhost:8000/docs, Mailpit: http://localhost:8025

## Проверки (Windows без make)

    docker run --rm -v "${PWD}/apps/api:/app" -w /app ghcr.io/astral-sh/uv:python3.14-bookworm uv run pytest --cov=app --cov-fail-under=90
    pnpm install && pnpm lint && pnpm format:check

## Статус этапов

- [x] M0 скелет
