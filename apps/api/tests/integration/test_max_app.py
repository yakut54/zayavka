import json
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.main import create_app
from app.max import init_data
from app.max.contact import sign_contact
from app.settings import Settings
from tests.conftest import make_settings
from tests.integration.test_booking_service import NSK, POLICY, seed_resource

BOT_TOKEN = "100500:TEST-BOT"
DEMO_TOKEN = "900:DEMO-ONLY"
USER = 4242
OTHER_USER = 777


@pytest.fixture
def settings(pg_url: str) -> Settings:
    return make_settings(
        pg_url,
        max_bot_token=BOT_TOKEN,
        max_demo_bridge=True,
        max_demo_bot_token=DEMO_TOKEN,
        rate_limit_booking="100/600",
    )


def signed(
    user_id: int = USER, token: str = BOT_TOKEN, *, age_s: int = 60, name: str = "Анна"
) -> str:
    user = json.dumps(
        {"id": user_id, "first_name": name}, ensure_ascii=False, separators=(",", ":")
    )
    fields = {"auth_date": str(int(time.time()) - age_s), "user": user}
    return init_data.sign(fields, token)


def auth(user_id: int = USER, **kwargs: Any) -> dict[str, str]:
    return {"X-Max-Init-Data": signed(user_id, **kwargs)}


def booking_day() -> datetime:
    return (datetime.now(NSK) + timedelta(days=3)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def at(hours: int, minutes: int = 0) -> str:
    moment = booking_day().replace(hour=hours, minute=minutes)
    return moment.astimezone(UTC).isoformat()


def body(starts_at: str, resource_id: uuid.UUID | None, **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "service_slug": "tires",
        "resource_id": str(resource_id) if resource_id else None,
        "starts_at": starts_at,
        "name": "Анна",
        "phone": "8 999 123-45-67",
        "consent": True,
        "policy_version": POLICY,
    }
    data.update(overrides)
    return data


def idem() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def book(
    client: AsyncClient, starts_at: str, rid: uuid.UUID | None, user: int = USER, **overrides: Any
) -> Any:
    return await client.post(
        "/api/v1/max/app/bookings",
        json=body(starts_at, rid, **overrides),
        headers={**auth(user), **idem()},
    )


# ---------- аутентификация ----------


async def test_missing_header(client: AsyncClient) -> None:
    response = await client.get("/api/v1/max/app/bootstrap")
    assert response.status_code == 401
    assert response.json()["code"] == "max_init_data_missing"
    assert response.headers["content-type"].startswith("application/problem+json")


@pytest.mark.parametrize(
    ("headers", "code"),
    [
        ({"X-Max-Init-Data": "auth_date=1&hash=abc"}, "max_init_data_invalid"),
        (auth(token="1:OTHER"), "max_init_data_invalid"),
        (auth(age_s=25 * 3600), "max_init_data_expired"),
    ],
)
async def test_bad_init_data(client: AsyncClient, headers: dict[str, str], code: str) -> None:
    response = await client.get("/api/v1/max/app/bootstrap", headers=headers)
    assert (response.status_code, response.json()["code"]) == (401, code)


async def test_user_id_is_taken_only_from_signed_data(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    rid = await seed_resource(engine)
    response = await client.post(
        "/api/v1/max/app/bookings",
        json=body(at(12), rid, max_user_id=OTHER_USER),
        headers={**auth(USER), **idem()},
    )
    assert response.status_code == 422  # лишнее поле запрещено
    assert (await book(client, at(12), rid)).status_code == 201
    async with engine.connect() as conn:
        stored = (await conn.execute(text("SELECT max_user_id FROM bookings"))).scalar_one()
    assert stored == USER


# ---------- bootstrap и доступность ----------


async def test_bootstrap(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine, name="Анна", services=("tires", "diagnostics"))
    await seed_resource(engine, name="Без услуг", services=())
    response = await client.get("/api/v1/max/app/bootstrap", headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["user"] == {"first_name": "Анна"}
    assert data["business"]["timezone"] == "Asia/Novosibirsk"
    assert {s["slug"] for s in data["services"]} == {
        "diagnostics",
        "maintenance",
        "brakes",
        "tires",
    }
    tires = next(s for s in data["services"] if s["slug"] == "tires")
    assert tires["duration_min"] == 45 and tires["price_from"] == 2000
    assert [r["id"] for r in data["resources"]] == [str(rid)]
    assert data["resources"][0]["service_slugs"] == ["diagnostics", "tires"]
    assert data["settings"] == {"cancel_deadline_min": 120, "horizon_days": 30}
    assert data["legal"]["policy_version"] == POLICY
    assert data["legal"]["privacy_url"].endswith("/privacy")
    assert data["legal"]["terms_url"] is None


async def test_availability_days_and_slots(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    day = booking_day().date()
    response = await client.get(
        "/api/v1/max/app/availability/days",
        params={
            "service": "tires",
            "resource": "any",
            "from": day.isoformat(),
            "to": (day + timedelta(days=2)).isoformat(),
        },
        headers=auth(),
    )
    assert response.status_code == 200
    assert [d["available"] for d in response.json()] == [True, True, True]

    slots = await client.get(
        "/api/v1/max/app/availability/slots",
        params={"service": "tires", "resource": str(rid), "date": day.isoformat()},
        headers=auth(),
    )
    data = slots.json()
    assert data["date"] == day.isoformat()
    first = data["slots"][0]
    assert set(first) == {"starts_at", "ends_at"}  # ресурсы и буфер не раскрываются
    started = datetime.fromisoformat(first["starts_at"])
    assert datetime.fromisoformat(first["ends_at"]) - started == timedelta(minutes=45)
    assert started.astimezone(NSK).strftime("%H:%M") == "09:00"


@pytest.mark.parametrize(
    ("params", "field", "code"),
    [
        ({"service": "consult", "resource": "any"}, "service_slug", "service_not_bookable"),
        ({"service": "tires", "resource": "nobody"}, "resource", "invalid_format"),
        (
            {"service": "tires", "resource": str(uuid.uuid4())},
            "resource_id",
            "resource_not_available",
        ),
    ],
)
async def test_availability_errors(
    client: AsyncClient, engine: AsyncEngine, params: dict[str, str], field: str, code: str
) -> None:
    await seed_resource(engine)
    day = booking_day().date().isoformat()
    response = await client.get(
        "/api/v1/max/app/availability/slots", params={**params, "date": day}, headers=auth()
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": field, "code": code}]


async def test_availability_days_range_limit(client: AsyncClient, engine: AsyncEngine) -> None:
    await seed_resource(engine)
    day = booking_day().date()
    response = await client.get(
        "/api/v1/max/app/availability/days",
        params={
            "service": "tires",
            "from": day.isoformat(),
            "to": (day + timedelta(days=31)).isoformat(),
        },
        headers=auth(),
    )
    assert response.status_code == 422


# ---------- записи ----------


async def test_create_booking_and_idempotent_repeat(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    rid = await seed_resource(engine)
    headers = {**auth(), "Idempotency-Key": str(uuid.uuid4())}
    payload = body(at(12), rid)
    first = await client.post("/api/v1/max/app/bookings", json=payload, headers=headers)
    assert first.status_code == 201
    view = first.json()
    assert view["status"] == "confirmed" and view["can_change"] is True
    assert view["service"] == {"slug": "tires", "title": "Шиномонтаж"}
    assert view["resource"]["id"] == str(rid) and view["version"] == 1
    again = await client.post("/api/v1/max/app/bookings", json=payload, headers=headers)
    assert again.status_code == 200 and again.json()["id"] == view["id"]


async def test_taken_slot_returns_409_with_fresh_slots(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    rid = await seed_resource(engine)
    assert (await book(client, at(12), rid)).status_code == 201
    response = await book(client, at(12), rid, user=OTHER_USER)
    assert response.status_code == 409
    problem = response.json()
    assert problem["code"] == "slot_taken"
    offered = [s["starts_at"] for s in problem["slots"]]
    assert offered and at(12) not in offered


@pytest.mark.parametrize(
    ("headers_extra", "overrides", "status"),
    [
        ({"Idempotency-Key": "not-a-uuid"}, {}, 422),
        ({}, {"consent": False}, 422),
        ({}, {"policy_version": "old"}, 422),
        ({}, {"phone": "123"}, 422),
        ({}, {"name": "A"}, 422),
        ({}, {"service_slug": "consult"}, 422),
    ],
)
async def test_create_validation(
    client: AsyncClient,
    engine: AsyncEngine,
    headers_extra: dict[str, str],
    overrides: dict[str, Any],
    status: int,
) -> None:
    rid = await seed_resource(engine)
    response = await client.post(
        "/api/v1/max/app/bookings",
        json=body(at(12), rid, **overrides),
        headers={**auth(), **idem(), **headers_extra},
    )
    assert response.status_code == status


async def test_missing_idempotency_key(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    response = await client.post("/api/v1/max/app/bookings", json=body(at(12), rid), headers=auth())
    assert response.status_code == 422


async def test_contact_proof_decides_phone_source(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    auth_date = str(int(time.time()))
    good = {
        "phone": "79997654321",
        "authDate": auth_date,
        "hash": sign_contact("79997654321", auth_date, USER, BOT_TOKEN),
    }
    assert (await book(client, at(12), rid, contact_proof=good)).status_code == 201
    forged = {**good, "hash": sign_contact("79997654321", auth_date, USER, "1:FAKE")}
    assert (await book(client, at(14), rid, contact_proof=forged)).status_code == 201
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text("SELECT client_phone_e164, phone_source FROM bookings ORDER BY starts_at")
            )
        ).all()
    assert [tuple(r) for r in rows] == [
        ("+79997654321", "max_contact"),
        ("+79991234567", "manual"),  # подпись не сошлась — берём введённый вручную
    ]


async def test_list_get_cancel_and_ownership(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    created = (await book(client, at(12), rid)).json()
    other = (await book(client, at(15), rid, user=OTHER_USER)).json()

    listing = await client.get("/api/v1/max/app/bookings", headers=auth())
    assert listing.status_code == 200
    page = listing.json()
    assert (page["total"], page["page"]) == (1, 1)
    assert [i["id"] for i in page["items"]] == [created["id"]]
    past = (await client.get("/api/v1/max/app/bookings?scope=past", headers=auth())).json()
    assert past["total"] == 0

    one = await client.get(f"/api/v1/max/app/bookings/{created['id']}", headers=auth())
    assert one.status_code == 200
    foreign = await client.get(f"/api/v1/max/app/bookings/{other['id']}", headers=auth())
    assert (foreign.status_code, foreign.json()["code"]) == (403, "not_owner")
    missing = await client.get(f"/api/v1/max/app/bookings/{uuid.uuid4()}", headers=auth())
    assert (missing.status_code, missing.json()["code"]) == (404, "not_found")

    stale = await client.post(
        f"/api/v1/max/app/bookings/{created['id']}/cancel", json={"version": 9}, headers=auth()
    )
    assert (stale.status_code, stale.json()["code"]) == (409, "version_conflict")
    cancelled = await client.post(
        f"/api/v1/max/app/bookings/{created['id']}/cancel", json={"version": 1}, headers=auth()
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled_by_client"
    assert cancelled.json()["can_change"] is False
    again = await client.post(
        f"/api/v1/max/app/bookings/{created['id']}/cancel", json={"version": 2}, headers=auth()
    )
    assert (again.status_code, again.json()["code"]) == (409, "booking_not_active")
    steal = await client.post(
        f"/api/v1/max/app/bookings/{other['id']}/cancel", json={"version": 1}, headers=auth()
    )
    assert steal.status_code == 403


async def test_too_late_to_cancel(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    created = (await book(client, at(12), rid)).json()
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE booking_settings SET cancel_deadline_min = 10080"))
    response = await client.post(
        f"/api/v1/max/app/bookings/{created['id']}/cancel", json={"version": 1}, headers=auth()
    )
    assert (response.status_code, response.json()["code"]) == (409, "too_late_to_change")
    view = (await client.get(f"/api/v1/max/app/bookings/{created['id']}", headers=auth())).json()
    assert view["can_change"] is False


async def test_reschedule(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    created = (await book(client, at(12), rid)).json()
    key = str(uuid.uuid4())
    payload = {"starts_at": at(12, 30), "resource_id": str(rid), "version": 1}
    response = await client.post(
        f"/api/v1/max/app/bookings/{created['id']}/reschedule",
        json=payload,
        headers={**auth(), "Idempotency-Key": key},
    )
    assert response.status_code == 201
    new = response.json()
    assert new["id"] != created["id"] and new["status"] == "confirmed"
    repeat = await client.post(
        f"/api/v1/max/app/bookings/{created['id']}/reschedule",
        json=payload,
        headers={**auth(), "Idempotency-Key": key},
    )
    assert repeat.status_code == 200 and repeat.json()["id"] == new["id"]
    old = (await client.get(f"/api/v1/max/app/bookings/{created['id']}", headers=auth())).json()
    assert old["status"] == "rescheduled"
    other_user = await client.get(f"/api/v1/max/app/bookings/{new['id']}", headers=auth(OTHER_USER))
    assert other_user.status_code == 403


async def test_calendar_file(client: AsyncClient, engine: AsyncEngine) -> None:
    rid = await seed_resource(engine)
    created = (await book(client, at(12), rid)).json()
    url = f"/api/v1/max/app/bookings/{created['id']}/calendar.ics"
    response = await client.get(url, headers=auth())
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    assert "attachment" in response.headers["content-disposition"]
    assert "BEGIN:VEVENT" in response.text and "SUMMARY:Шиномонтаж" in response.text
    assert (await client.get(url, headers=auth(OTHER_USER))).status_code == 403


async def test_lead_from_mini_app_has_max_source(client: AsyncClient, engine: AsyncEngine) -> None:
    payload = {
        "name": "Анна",
        "phone": "+79991234567",
        "service_slug": "tires",
        "consent": True,
        "policy_version": POLICY,
        "elapsed_ms": 5000,
    }
    response = await client.post("/api/v1/max/app/leads", json=payload, headers=auth())
    assert response.status_code == 201 and response.json()["public_number"] >= 1
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT source FROM leads"))).scalar_one() == "max"
    no_auth = await client.post("/api/v1/max/app/leads", json=payload)
    assert no_auth.status_code == 401


# ---------- демо-режим ----------


async def test_demo_session_gives_working_negative_user(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    rid = await seed_resource(engine)
    response = await client.post("/api/v1/max/app/demo-session", json={"first_name": "Гость"})
    assert response.status_code == 200
    raw = response.json()["init_data"]
    fields, _ = init_data.parse_fields(raw)
    assert json.loads(fields["user"])["id"] < 0
    headers = {"X-Max-Init-Data": raw}
    boot = await client.get("/api/v1/max/app/bootstrap", headers=headers)
    assert boot.status_code == 200 and boot.json()["user"]["first_name"] == "Гость"
    created = await client.post(
        "/api/v1/max/app/bookings", json=body(at(12), rid), headers={**headers, **idem()}
    )
    assert created.status_code == 201
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT max_user_id FROM bookings"))).scalar_one() < 0


async def test_demo_session_is_rate_limited(client: AsyncClient) -> None:
    for _ in range(5):
        assert (
            await client.post("/api/v1/max/app/demo-session", json={"first_name": "Гость"})
        ).status_code == 200
    limited = await client.post("/api/v1/max/app/demo-session", json={"first_name": "Гость"})
    assert limited.status_code == 429 and "retry-after" in limited.headers


@pytest_asyncio.fixture
async def no_demo_client(engine: AsyncEngine, pg_url: str) -> AsyncIterator[AsyncClient]:
    application: FastAPI = create_app(make_settings(pg_url, max_bot_token=BOT_TOKEN))
    async with application.router.lifespan_context(application):
        transport = ASGITransport(app=application, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


async def test_demo_is_absent_when_bridge_is_off(no_demo_client: AsyncClient) -> None:
    response = await no_demo_client.post(
        "/api/v1/max/app/demo-session", json={"first_name": "Гость"}
    )
    assert response.status_code == 404
    demo_signed = {"X-Max-Init-Data": signed(-5, DEMO_TOKEN)}
    rejected = await no_demo_client.get("/api/v1/max/app/bootstrap", headers=demo_signed)
    assert (rejected.status_code, rejected.json()["code"]) == (401, "max_init_data_invalid")
    ok = await no_demo_client.get("/api/v1/max/app/bootstrap", headers=auth())
    assert ok.status_code == 200
