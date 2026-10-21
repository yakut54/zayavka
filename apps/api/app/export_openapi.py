"""Выгрузка схемы OpenAPI: python -m app.export_openapi > packages/api-client/openapi.json"""

import json
import sys

from app.main import create_app
from app.settings import Settings


def build_schema() -> dict[str, object]:
    settings = Settings(
        app_env="dev",
        database_url="postgresql+asyncpg://app:app@localhost:5432/app",
        secret_key="openapi-export-only-openapi-export-only-0123456789",  # noqa: S106
        site_origin="https://example.ru",
        admin_origin="https://admin.example.ru",
        notify_emails=["owner@example.ru"],
        privacy_policy_version="export",
        _env_file=None,
    )
    return create_app(settings).openapi()


def main() -> None:
    schema = json.dumps(build_schema(), ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.buffer.write((schema + "\n").encode())


if __name__ == "__main__":
    main()
