#!/usr/bin/env bash
# Запуск uv внутри docker (на Windows нет uv). Пример: scripts/uv.sh run pytest
# DOCKER_NETWORK=host — для CI: порты стенда слушают только 127.0.0.1.
# Docker-сокет и TESTCONTAINERS_* нужны, чтобы testcontainers поднимал PostgreSQL рядом.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MSYS_NO_PATHCONV=1 exec docker run --rm ${DOCKER_NETWORK:+--network "$DOCKER_NETWORK"} \
  -v "$ROOT/apps/api:/app" -w /app \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e UV_LINK_MODE=copy \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  -e TESTCONTAINERS_RYUK_DISABLED=true \
  ghcr.io/astral-sh/uv:python3.14-bookworm uv "$@"
