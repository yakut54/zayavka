import pytest
from pydantic import ValidationError

from app.settings import Settings

BASE: dict[str, object] = {
    "app_env": "dev",
    "database_url": "postgresql+asyncpg://app:app@db:5432/app",
    "secret_key": "x" * 64,
    "site_origin": "https://example.ru",
    "admin_origin": "https://admin.example.ru",
    "notify_emails": "a@example.ru, b@example.ru",
    "privacy_policy_version": "2026-10-20",
}
PROD_SMTP: dict[str, object] = {
    "smtp_host": "smtp.example.ru",
    "smtp_user": "u",
    "smtp_password": "p",
    "smtp_from": "Заявки <noreply@example.ru>",
}


def build(**overrides: object) -> Settings:
    return Settings(_env_file=None, **{**BASE, **overrides})  # type: ignore[arg-type]


def test_notify_emails_split_by_comma() -> None:
    assert build().notify_emails == ["a@example.ru", "b@example.ru"]


def test_notify_emails_accepts_list() -> None:
    assert build(notify_emails=["a@example.ru"]).notify_emails == ["a@example.ru"]


def test_prod_requires_smtp() -> None:
    with pytest.raises(ValidationError, match="SMTP_HOST"):
        build(app_env="prod")


def test_prod_requires_long_secret() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        build(app_env="prod", secret_key="short", **PROD_SMTP)


def test_prod_valid() -> None:
    settings = build(app_env="prod", **PROD_SMTP)
    assert settings.is_prod
    assert settings.sqlalchemy_url.startswith("postgresql+asyncpg://")


def test_dev_does_not_require_smtp() -> None:
    assert not build().is_prod
