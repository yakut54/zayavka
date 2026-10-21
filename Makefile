# На Windows make нет: те же команды запускаются через scripts/uv.sh (uv в docker).
UV = scripts/uv.sh

dev:
	docker compose -f infra/compose.dev.yml up --build
test: test-api test-web
test-api:
	$(UV) run pytest --cov=app --cov-fail-under=90
test-web:
	pnpm -r --if-present test
lint:
	$(UV) run ruff check .
	$(UV) run ruff format --check .
	pnpm lint
typecheck:
	$(UV) run mypy --strict app
	pnpm -r typecheck
openapi:
	$(UV) run python -m app.export_openapi > packages/api-client/openapi.json
	pnpm --filter @app/api-client generate
contract:
	scripts/contract.sh
migrate:
	docker compose -f infra/compose.dev.yml exec api alembic upgrade head
