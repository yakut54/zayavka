import httpx
import pytest

from app.security.ip import hash_ip
from app.services.captcha import SmartCaptchaVerifier
from app.services.ratelimit import parse_limit
from tests.unit.test_settings import build


def test_parse_limit() -> None:
    assert parse_limit("5/600") == (5, 600)


def test_hash_ip_is_keyed_and_stable() -> None:
    assert hash_ip("1.2.3.4", "k1") == hash_ip("1.2.3.4", "k1")
    assert hash_ip("1.2.3.4", "k1") != hash_ip("1.2.3.4", "k2")
    assert b"1.2.3.4" not in hash_ip("1.2.3.4", "k1")


def test_enabled_channels() -> None:
    assert build().enabled_channels == ["log"]
    assert build(smtp_host="smtp").enabled_channels == ["email"]
    both = build(smtp_host="smtp", max_bot_token="t", max_chat_id="1")
    assert both.enabled_channels == ["email", "max"]
    assert build(max_bot_token="t").enabled_channels == ["log"]


def _verifier(transport: httpx.MockTransport) -> SmartCaptchaVerifier:
    return SmartCaptchaVerifier("key", httpx.AsyncClient(transport=transport))


async def test_captcha_ok() -> None:
    v = _verifier(httpx.MockTransport(lambda r: httpx.Response(200, json={"status": "ok"})))
    assert await v.verify("t", "1.1.1.1") is True


async def test_captcha_failed() -> None:
    v = _verifier(httpx.MockTransport(lambda r: httpx.Response(200, json={"status": "failed"})))
    assert await v.verify("t", "1.1.1.1") is False


async def test_captcha_sends_secret_token_ip() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(dict(x.split("=") for x in request.content.decode().split("&")))
        return httpx.Response(200, json={"status": "ok"})

    await _verifier(httpx.MockTransport(handler)).verify("tok", "9.9.9.9")
    assert seen == {"secret": "key", "token": "tok", "ip": "9.9.9.9"}


@pytest.mark.parametrize("status", [500, 503])
async def test_captcha_fails_open_on_service_error(status: int) -> None:
    v = _verifier(httpx.MockTransport(lambda r: httpx.Response(status)))
    assert await v.verify("t", "1.1.1.1") is True


async def test_captcha_fails_open_on_network_error() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timeout")

    assert await _verifier(httpx.MockTransport(boom)).verify("t", "1.1.1.1") is True


@pytest.mark.parametrize("value", ["=1+1", "+7999", "-5", "@x", "\tx", "\rx"])
def test_csv_escape_prefixes_formulas(value: str) -> None:
    from app.services.admin_leads import escape_csv_cell

    assert escape_csv_cell(value) == "'" + value


@pytest.mark.parametrize("value", ["", "Иван", "8 (912) 345-67-89", "a=b"])
def test_csv_escape_keeps_safe_values(value: str) -> None:
    from app.services.admin_leads import escape_csv_cell

    assert escape_csv_cell(value) == value


def test_format_phone() -> None:
    from app.services.admin_leads import format_phone

    assert format_phone("+79123456789") == "8 (912) 345-67-89"
    assert format_phone("+442079460958") == "+44 20 7946 0958"
    assert format_phone("garbage") == "garbage"
