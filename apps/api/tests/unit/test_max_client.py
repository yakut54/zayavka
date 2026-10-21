import json
import ssl
import time
from pathlib import Path

import certifi
import httpx
import pytest
import respx

from app.max import keyboards
from app.max.client import (
    MaxApiError,
    MaxAuthError,
    MaxClient,
    TokenBucket,
    build_ssl_context,
)

BASE = "https://platform-api2.max.ru"
TOKEN = "bot-token-123"


def make_client(**kwargs: object) -> MaxClient:
    return MaxClient(BASE, TOKEN, **kwargs)  # type: ignore[arg-type]


@respx.mock
async def test_send_message_url_header_and_body() -> None:
    route = respx.post(f"{BASE}/messages").respond(200, json={"message": {}})
    client = make_client()
    keyboard = keyboards.my_bookings("example_bot")
    await client.send_message(4242, "Привет", keyboard)
    request = route.calls.last.request
    assert request.url.params["user_id"] == "4242"
    assert request.headers["Authorization"] == TOKEN  # «как есть», без Bearer
    body = json.loads(request.content)
    assert body == {"text": "Привет", "attachments": [keyboard]}
    assert "format" not in body  # простой текст: разметка не интерпретируется
    await client.aclose()


@respx.mock
async def test_send_message_without_keyboard_and_long_text_is_cut() -> None:
    route = respx.post(f"{BASE}/messages").respond(200, json={})
    client = make_client()
    await client.send_message(1, "я" * 5000)
    body = json.loads(route.calls.last.request.content)
    assert len(body["text"]) == 4000 and "attachments" not in body
    await client.aclose()


@respx.mock
async def test_unauthorized_is_not_retryable() -> None:
    respx.post(f"{BASE}/messages").respond(401, json={"code": "verify.token", "message": "bad"})
    with pytest.raises(MaxAuthError) as info:
        await make_client().send_message(1, "x")
    assert info.value.retryable is False and info.value.status == 401
    assert info.value.code == "verify.token"


@pytest.mark.parametrize(
    ("status", "retryable"),
    [(400, False), (403, False), (404, False), (429, True), (500, True), (503, True)],
)
@respx.mock
async def test_error_statuses(status: int, retryable: bool) -> None:
    respx.post(f"{BASE}/messages").respond(status, json={"code": "x", "message": "m"})
    with pytest.raises(MaxApiError) as info:
        await make_client().send_message(1, "x")
    assert info.value.retryable is retryable and info.value.status == status


@respx.mock
async def test_error_with_non_json_body() -> None:
    respx.post(f"{BASE}/messages").respond(502, text="<html>bad gateway</html>")
    with pytest.raises(MaxApiError) as info:
        await make_client().send_message(1, "x")
    assert info.value.retryable and info.value.code is None


@respx.mock
async def test_timeout_and_network_errors_are_retryable() -> None:
    client = make_client()
    respx.post(f"{BASE}/messages").mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(MaxApiError, match="timeout") as info:
        await client.send_message(1, "x")
    assert info.value.retryable
    respx.post(f"{BASE}/messages").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(MaxApiError, match="ConnectError") as info:
        await client.send_message(1, "x")
    assert info.value.retryable


@respx.mock
async def test_service_calls() -> None:
    respx.get(f"{BASE}/me").respond(200, json={"user_id": 1, "username": "example_bot"})
    respx.get(f"{BASE}/subscriptions").respond(
        200, json={"subscriptions": [{"url": "https://x/hook", "time": 1}]}
    )
    sub = respx.post(f"{BASE}/subscriptions").respond(200, json={"success": True})
    unsub = respx.delete(f"{BASE}/subscriptions").respond(200, json={"success": True})
    client = make_client()
    assert (await client.get_me())["username"] == "example_bot"
    assert (await client.get_subscriptions())[0]["url"] == "https://x/hook"
    await client.subscribe("https://x/hook", "secret_12345")
    assert json.loads(sub.calls.last.request.content) == {
        "url": "https://x/hook",
        "secret": "secret_12345",
        "update_types": ["bot_started", "message_created"],
    }
    await client.unsubscribe("https://x/hook")
    assert unsub.calls.last.request.url.params["url"] == "https://x/hook"
    for call in (sub.calls.last, unsub.calls.last):
        assert call.request.headers["Authorization"] == TOKEN


@respx.mock
async def test_empty_success_body_is_ok() -> None:
    respx.delete(f"{BASE}/subscriptions").respond(200)
    await make_client().unsubscribe("https://x")


async def test_token_bucket_limits_rate() -> None:
    bucket = TokenBucket(rate=100, burst=1)
    started = time.monotonic()
    for _ in range(11):
        await bucket.acquire()
    elapsed = time.monotonic() - started
    assert elapsed >= 0.09  # 10 ожиданий по 10 мс: не быстрее заданной скорости
    assert elapsed < 1.0


async def test_token_bucket_allows_burst() -> None:
    bucket = TokenBucket(rate=20)
    started = time.monotonic()
    for _ in range(20):
        await bucket.acquire()
    assert time.monotonic() - started < 0.2


def test_tls_verification_is_never_disabled() -> None:
    assert build_ssl_context(None) is True
    context = build_ssl_context(Path(certifi.where()))
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname


def test_keyboard_shape_follows_schema() -> None:
    keyboard = keyboards.my_bookings("example_bot")
    assert keyboard == {
        "type": "inline_keyboard",
        "payload": {
            "buttons": [
                [
                    {
                        "type": "open_app",
                        "text": "Мои записи",
                        "web_app": "example_bot",
                        "payload": "my",
                    }
                ]
            ]
        },
    }
    button = keyboards.book_now("example_bot")["payload"]["buttons"][0][0]
    assert button["type"] == "open_app" and "payload" not in button


def test_open_app_limits() -> None:
    button = keyboards.open_app_button("т" * 300, "bot", "p" * 600)
    assert len(button["text"]) == 128 and len(button["payload"]) == 512
