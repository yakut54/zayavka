from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.booking.ics import build_ics
from app.catalog import load_business
from app.domain.errors import MaxInitDataInvalid
from app.max import init_data
from app.max.auth import MaxAuthenticator
from app.settings import Settings
from tests.unit.test_settings import PROD_SMTP, build

SERVICES_JSON = Path(__file__).parents[2] / "services.json"


def test_business_is_loaded_from_services_json() -> None:
    business = load_business(SERVICES_JSON)
    assert business.name == "Гараж 24"
    assert business.timezone == "Asia/Novosibirsk"
    assert business.site_url.startswith("https://")


def test_ics_escapes_text_and_uses_crlf() -> None:
    start = datetime(2030, 1, 7, 3, 0, tzinfo=UTC)
    text = build_ics(
        uid="abc@booking",
        title="Шиномонтаж; быстро, дёшево",
        starts_at=start,
        ends_at=datetime(2030, 1, 7, 3, 45, tzinfo=UTC),
        created_at=start,
        location="ул. Примерная, 1",
        description="Строка 1\nСтрока 2 \\ слэш",
    )
    assert text.startswith("BEGIN:VCALENDAR\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert "DTSTART:20300107T030000Z\r\n" in text
    assert "DTEND:20300107T034500Z\r\n" in text
    assert "SUMMARY:Шиномонтаж\\; быстро\\, дёшево" in text
    assert "DESCRIPTION:Строка 1\\nСтрока 2 \\\\ слэш" in text
    assert "\n" not in text.replace("\r\n", "")


def test_ics_folds_long_lines_by_octets() -> None:
    start = datetime(2030, 1, 7, 3, 0, tzinfo=UTC)
    text = build_ics(
        uid="u",
        title="Ж" * 100,
        starts_at=start,
        ends_at=start,
        created_at=start,
        location="",
        description="",
    )
    for line in text.split("\r\n"):
        assert len(line.encode()) <= 75
    unfolded = text.replace("\r\n ", "")
    assert "SUMMARY:" + "Ж" * 100 in unfolded


def test_prod_requires_miniapp_origin() -> None:
    with pytest.raises(ValidationError, match="MINIAPP_ORIGIN"):
        build(app_env="prod", **{k: v for k, v in PROD_SMTP.items() if k != "miniapp_origin"})


def test_prod_demo_bridge_requires_distinct_demo_token() -> None:
    with pytest.raises(ValidationError, match="MAX_DEMO_BOT_TOKEN is required"):
        build(app_env="prod", max_demo_bridge=True, **PROD_SMTP)
    with pytest.raises(ValidationError, match="must differ"):
        build(
            app_env="prod",
            max_demo_bridge=True,
            max_demo_bot_token="same:token",
            max_bot_token="same:token",
            **PROD_SMTP,
        )
    ok = build(
        app_env="prod",
        max_demo_bridge=True,
        max_demo_bot_token="demo:token",
        max_bot_token="real:token",
        **PROD_SMTP,
    )
    assert ok.max_demo_bridge


def _settings(**overrides: object) -> Settings:
    return build(**overrides)


def test_authenticator_prefers_real_token_and_marks_demo() -> None:
    auth = MaxAuthenticator(
        _settings(max_bot_token="real:token", max_demo_bridge=True, max_demo_bot_token="demo:token")
    )
    raw = auth.demo_session("Гость")
    assert raw is not None
    user = auth.authenticate(raw)
    assert user.is_demo and user.id < 0
    assert auth.bot_token_for(user) == "demo:token"
    assert auth.authenticate(raw) is user  # повтор берётся из кэша


def test_authenticator_without_token_rejects_everything() -> None:
    auth = MaxAuthenticator(_settings())
    assert auth.demo_session("Гость") is None
    raw = init_data.sign(
        {"auth_date": str(int(datetime.now(UTC).timestamp())), "user": '{"id":1}'}, "any:token"
    )
    with pytest.raises(MaxInitDataInvalid):
        auth.authenticate(raw)


def test_authenticator_cache_is_bounded() -> None:
    auth = MaxAuthenticator(_settings(max_bot_token="real:token"))
    now = str(int(datetime.now(UTC).timestamp()))
    for number in range(1030):
        raw = init_data.sign({"auth_date": now, "user": f'{{"id":{number}}}'}, "real:token")
        auth.authenticate(raw)
    assert len(auth._cache) <= 1024
