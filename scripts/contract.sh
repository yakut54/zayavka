#!/usr/bin/env bash
# Контрактные тесты schemathesis против запущенного API (dev compose или тестовый стенд).
# Нужен админ: python -m app.cli create-admin --email $CONTRACT_EMAIL --stdin
# Для прогона поднимите лимиты: RATE_LIMIT_LEADS=1000000/60 RATE_LIMIT_LOGIN=1000000/60.
set -euo pipefail
cd "$(dirname "$0")/.."
API="${API_URL:-http://localhost:8000}"
DOCKER_API="${API_URL_FROM_DOCKER:-http://host.docker.internal:8000}"
EMAIL="${CONTRACT_EMAIL:-contract@example.ru}"
PASSWORD="${CONTRACT_PASSWORD:-contract-pass-123}"
BODY="$(mktemp)"; trap 'rm -f "$BODY"' EXIT
printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD" > "$BODY"
RESPONSE=$(curl -s -i -X POST "$API/api/v1/admin/auth/login" -H 'content-type: application/json' --data-binary @"$BODY" | tr -d '\r')
SESSION=$(echo "$RESPONSE" | grep -i '^set-cookie: session=' | sed 's/.*session=\([^;]*\);.*/\1/')
CSRF=$(echo "$RESPONSE" | grep -i '^set-cookie: csrf=' | sed 's/.*csrf=\([^;]*\);.*/\1/')
[ -n "$SESSION" ] || { echo "login failed: создайте админа $EMAIL" >&2; exit 1; }
# logout/revoke-all/password убивают сессию прогона; positive_data_acceptance не применим
# к бизнес-валидации (политика, телефон); ignored_auth — прогон идёт с валидной сессией.
scripts/uv.sh run schemathesis run "$DOCKER_API/openapi.json" --url "$DOCKER_API" \
  -H "Cookie: session=$SESSION; csrf=$CSRF" -H "X-CSRF-Token: $CSRF" \
  --exclude-path-regex '/(logout|revoke-all|password)$' \
  --checks all --exclude-checks ignored_auth,positive_data_acceptance --max-examples 40
