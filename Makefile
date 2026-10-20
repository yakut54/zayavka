# Windows без make: те же команды запускаются вручную, см. README.
UV = docker run --rm -v "$(CURDIR)/apps/api:/app" -w /app ghcr.io/astral-sh/uv:python3.14-bookworm uv

dev:
	docker compose -f infra/compose.dev.yml up --build
test: test-api test-web
test-api:
	cd apps/api && uv run pytest --cov --cov-fail-under=90
test-web:
	pnpm -r test
lint:
	cd apps/api && uv run ruff check . && uv run ruff format --check .
	pnpm -r lint
typecheck:
	cd apps/api && uv run mypy --strict app
	pnpm -r typecheck
openapi:
	cd apps/api && uv run python -m app.export_openapi > ../../packages/api-client/openapi.json
migrate:
	docker compose exec api uv run alembic upgrade head
