from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self
from zoneinfo import ZoneInfo

from pydantic import PostgresDsn, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["dev", "test", "prod"]
    database_url: PostgresDsn
    secret_key: SecretStr
    site_origin: str
    admin_origin: str
    notify_emails: Annotated[list[str], NoDecode]
    privacy_policy_version: str
    session_ttl_hours: int = 168
    lead_retention_days: int = 365
    rate_limit_leads: str = "5/600"
    rate_limit_login: str = "10/900"
    smtp_host: str | None = None
    smtp_port: int = 465
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str | None = None
    max_bot_token: SecretStr | None = None
    max_chat_id: str | None = None
    smartcaptcha_server_key: SecretStr | None = None
    log_level: str = "INFO"
    services_file: Path = Path(__file__).parent.parent / "services.json"
    business_timezone: str = "Asia/Novosibirsk"

    @field_validator("notify_emails", mode="before")
    @classmethod
    def split_emails(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [e.strip() for e in v.split(",") if e.strip()]
        return v

    @field_validator("business_timezone")
    @classmethod
    def check_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (KeyError, ValueError) as exc:
            raise ValueError(f"unknown timezone: {v}") from exc
        return v

    @model_validator(mode="after")
    def check_prod(self) -> Self:
        if not self.is_prod:
            return self
        if len(self.secret_key.get_secret_value().encode()) < 32:
            raise ValueError("SECRET_KEY must be at least 32 bytes in prod")
        missing = [
            name
            for name, value in (
                ("SMTP_HOST", self.smtp_host),
                ("SMTP_USER", self.smtp_user),
                ("SMTP_PASSWORD", self.smtp_password),
                ("SMTP_FROM", self.smtp_from),
            )
            if not value
        ]
        if missing:
            raise ValueError(f"missing required prod settings: {', '.join(missing)}")
        return self

    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"

    @property
    def secure_cookies(self) -> bool:
        return self.is_prod

    @property
    def session_cookie_name(self) -> str:
        return "__Host-session" if self.is_prod else "session"

    @property
    def csrf_cookie_name(self) -> str:
        return "__Host-csrf" if self.is_prod else "csrf"

    @property
    def enabled_channels(self) -> list[str]:
        channels = ["email"] if self.smtp_host else ["log"]
        if self.max_bot_token and self.max_chat_id:
            channels.append("max")
        return channels

    @property
    def sqlalchemy_url(self) -> str:
        return str(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
