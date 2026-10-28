import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.settings import Settings
from tests.conftest import make_settings
from tests.integration.test_auth import csrf, login, make_admin
from tests.integration.test_booking_service import NSK, rows, seed_resource
from tests.integration.test_max_app import BOT_TOKEN, at, auth, body, booking_day, idem

B = "/api/v1/admin/bookings"
R = "/api/v1/admin/resources"
SETTINGS = "/api/v1/admin/booking-settings"


@pytest.fixture
def settings(pg_url: str) -> Settings:
    return make_settings(pg_url, max_bot_token=BOT_TOKEN, rate_limit_booking="100/600")


@pytest.fixture
async def admin(client: AsyncClient, engine: AsyncEngine) -> uuid.UUID:
    admin_id = await make_admin(engine)
    assert (await login(client))[0] == 204
    return admin_id


def manual(starts_at: str, resource_id: uuid.UUID | None, **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "service_slug": "tires",
        "resource_id": str(resource_id) if resource_id else None,
        "starts_at": starts_at,
        "name": "Пётр",
        "phone": "8 913 000-11-22",
    }
    data.update(overrides)
    return data


async def make_booking(client: AsyncClient, starts_at: str, rid: uuid.UUID) -> dict[str, Any]:
    r = await client.post(B, json=manual(starts_at, rid), headers=csrf(client))
    assert r.status_code == 201, r.text
    result: dict[str, Any] = r.json()
    return result


async def max_booking(client: AsyncClient, starts_at: str, rid: uuid.UUID, user: int = 4242) -> str:
    r = await client.post(
        "/api/v1/max/app/bookings",
        json=body(starts_at, rid),
        headers={**auth(user), **idem()},
    )
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def outbox_kinds(engine: AsyncEngine, status: str | None = None) -> list[str]:
    sql = "SELECT kind FROM notification_outbox"
    sql += " WHERE status = :s" if status else ""
    return sorted(str(r["kind"]) for r in await rows(engine, sql + " ORDER BY kind", s=status))


# ---------- доступ ----------


async def test_every_route_requires_login(client: AsyncClient, app: FastAPI) -> None:
    checked = 0
    for path, operations in app.openapi()["paths"].items():
        if not path.startswith(("/api/v1/admin/bookings", "/api/v1/admin/resources")) and (
            "booking-settings" not in path
        ):
            continue
        concrete = path.replace("{booking_id}", str(uuid.uuid4())).replace(
            "{resource_id}", str(uuid.uuid4())
        )
        for method in set(operations) - {"head", "options"}:
            r = await client.request(method, concrete, json={})
            assert r.status_code == 401, (method, path, r.status_code)
            checked += 1
    assert checked >= 15


# ---------- ручная запись ----------


async def test_manual_booking_and_slots(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    day = booking_day().date().isoformat()
    r = await client.get(f"{B}/slots", params={"service": "tires", "resource": "any", "date": day})
    assert r.status_code == 200, r.text
    assert r.json()["slots"][0]["resource_ids"] == [str(rid)]

    r = await client.post(B, json=manual(at(10), rid))
    assert r.status_code == 403  # без CSRF

    made = await make_booking(client, at(10), rid)
    assert made["source"] == "admin" and made["phone_source"] == "admin"
    assert made["client_phone_e164"] == "+79130001122" and made["has_max"] is False
    assert made["status"] == "confirmed"
    # без согласия и без сообщений клиенту; владелец получает обычное уведомление
    assert await outbox_kinds(engine) == ["booking_created_owner"]
    consents = await rows(engine, "SELECT count(*) AS n FROM consents")
    assert consents[0]["n"] == 0

    slots = (
        await client.get(
            f"{B}/slots", params={"service": "tires", "resource": str(rid), "date": day}
        )
    ).json()["slots"]
    starts = {datetime.fromisoformat(s["starts_at"]) for s in slots}
    assert datetime.fromisoformat(at(10)) not in starts and starts


async def test_manual_booking_ignores_lead_time(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine, hours=(0, 1440))
    soon = (datetime.now(UTC) + timedelta(minutes=20)).replace(second=0, microsecond=0)
    soon -= timedelta(minutes=soon.minute % 15)
    soon += timedelta(minutes=15)
    if soon.astimezone(NSK).hour >= 23:  # запись не должна переходить через полночь
        soon += timedelta(hours=2)
    r = await client.post(B, json=manual(soon.isoformat(), rid), headers=csrf(client))
    assert r.status_code == 201


async def test_manual_booking_conflict_and_validation(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    await make_booking(client, at(10), rid)
    r = await client.post(B, json=manual(at(10), rid), headers=csrf(client))
    assert r.status_code == 409 and r.json()["code"] == "slot_taken"
    assert isinstance(r.json()["slots"], list)

    r = await client.post(B, json=manual(at(12), rid, phone="123"), headers=csrf(client))
    assert r.status_code == 422
    r = await client.post(B, json=manual(at(12), rid, service_slug="nope"), headers=csrf(client))
    assert r.status_code == 422
    r = await client.post(B, json={**manual(at(12), rid), "extra": 1}, headers=csrf(client))
    assert r.status_code == 422


# ---------- список, календарь, карточка ----------


async def test_list_filters_and_range(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    first = await seed_resource(engine, name="Первый")
    second = await seed_resource(engine, name="Второй", sort_order=1)
    await make_booking(client, at(10), first)
    await make_booking(client, at(11), second)
    day = booking_day().date().isoformat()

    r = await client.get(B, params={"date_from": day, "date_to": day})
    assert r.status_code == 200 and r.json()["total"] == 2
    assert [i["starts_at"] for i in r.json()["items"]] == sorted(
        i["starts_at"] for i in r.json()["items"]
    )
    r = await client.get(B, params={"date_from": day, "date_to": day, "resource_id": str(second)})
    assert [i["resource"]["name"] for i in r.json()["items"]] == ["Второй"]
    r = await client.get(B, params={"date_from": day, "date_to": day, "q": "000-11-22"})
    assert r.json()["total"] == 2
    r = await client.get(B, params={"date_from": day, "date_to": day, "q": "нет-такого"})
    assert r.json()["total"] == 0
    r = await client.get(B, params={"date_from": day, "date_to": day, "status": "completed"})
    assert r.json()["total"] == 0
    r = await client.get(B)  # по умолчанию: ближайшие 62 дня
    assert r.json()["total"] == 2

    far = (booking_day() + timedelta(days=70)).date().isoformat()
    r = await client.get(B, params={"date_from": day, "date_to": far})
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "date_to"
    r = await client.get(B, params={"date_from": far, "date_to": day})
    assert r.status_code == 422
    for bad in ({"date_from": "0"}, {"status": "bogus"}, {"page_size": 5}, {"resource_id": "x"}):
        assert (await client.get(B, params=bad)).status_code == 422


async def test_calendar_day_view(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine, name="Мастер", hours=(540, 1080))
    off = await seed_resource(engine, name="Выключенный", active=False)
    await make_booking(client, at(10), rid)
    day = booking_day().date()
    r = await client.get(f"{B}/calendar", params={"date": day.isoformat()})
    data = r.json()
    assert r.status_code == 200 and data["date"] == day.isoformat()
    assert [x["name"] for x in data["resources"]] == ["Мастер"]
    assert data["working"] == {str(rid): [[540, 1080]]}
    assert [b["client_name"] for b in data["bookings"]] == ["Пётр"]
    assert str(off) not in data["working"]

    await client.post(
        f"{R}/{rid}/exceptions",
        json={"date": day.isoformat(), "kind": "day_off"},
        params={"force": True},
        headers=csrf(client),
    )
    data = (await client.get(f"{B}/calendar", params={"date": day.isoformat()})).json()
    assert data["working"][str(rid)] == []
    today = (await client.get(f"{B}/calendar")).json()
    assert today["date"] == datetime.now(NSK).date().isoformat()


async def test_detail_with_history_and_notes(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    made = await make_booking(client, at(10), rid)
    url = f"{B}/{made['id']}"
    r = await client.post(f"{url}/notes", json={"text": " Просил позвонить "}, headers=csrf(client))
    assert r.status_code == 201 and r.json()["payload"] == {"text": "Просил позвонить"}
    assert r.json()["actor"]["email"] == "owner@example.ru"
    r = await client.get(url)
    assert [e["type"] for e in r.json()["events"]] == ["created", "note_added"]
    assert r.json()["booking"]["id"] == made["id"]

    missing = str(uuid.uuid4())
    assert (await client.get(f"{B}/{missing}")).status_code == 404
    r = await client.post(f"{B}/{missing}/notes", json={"text": "x"}, headers=csrf(client))
    assert r.status_code == 404
    r = await client.post(f"{url}/notes", json={"text": "  "}, headers=csrf(client))
    assert r.status_code == 422


# ---------- статусы ----------


async def test_complete_and_correct_to_no_show(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    uid = await max_booking(client, at(10), rid)
    assert await outbox_kinds(engine, "pending")  # напоминания стоят в очереди
    url = f"{B}/{uid}"
    r = await client.patch(url, json={"status": "completed", "version": 1}, headers=csrf(client))
    assert r.status_code == 200 and r.json()["status"] == "completed" and r.json()["version"] == 2
    assert not [k for k in await outbox_kinds(engine, "pending") if "reminder" in k]
    r = await client.patch(url, json={"status": "no_show", "version": 2}, headers=csrf(client))
    assert r.json()["status"] == "no_show"
    r = await client.patch(url, json={"status": "no_show", "version": 3}, headers=csrf(client))
    assert r.status_code == 200 and r.json()["version"] == 3  # без изменений
    events = (await client.get(url)).json()["events"]
    assert [e["payload"].get("to") for e in events if e["type"] == "status_changed"] == [
        "completed",
        "no_show",
    ]
    r = await client.patch(
        url, json={"status": "cancelled_by_business", "version": 3}, headers=csrf(client)
    )
    assert r.status_code == 409 and r.json()["code"] == "booking_not_active"


async def test_status_version_conflict_and_validation(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    made = await make_booking(client, at(10), rid)
    url = f"{B}/{made['id']}"
    r = await client.patch(url, json={"status": "completed", "version": 5}, headers=csrf(client))
    assert r.status_code == 409 and r.json()["code"] == "version_conflict"
    for bad in ({"status": "confirmed", "version": 1}, {"status": "completed"}, {"version": 1}):
        r = await client.patch(url, json=bad, headers=csrf(client))
        assert r.status_code == 422, bad
    r = await client.patch(
        f"{B}/{uuid.uuid4()}", json={"status": "completed", "version": 1}, headers=csrf(client)
    )
    assert r.status_code == 404


async def test_cancel_by_business_notifies_client(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    uid = await max_booking(client, at(10), rid)
    r = await client.patch(
        f"{B}/{uid}",
        json={"status": "cancelled_by_business", "cancel_reason": " Мастер заболел ", "version": 1},
        headers=csrf(client),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled_by_business"
    assert r.json()["cancel_reason"] == "Мастер заболел"
    pending = await rows(
        engine,
        "SELECT kind, channel FROM notification_outbox WHERE status = 'pending' ORDER BY kind",
    )
    assert [(p["kind"], p["channel"]) for p in pending] == [
        ("booking_cancelled_client", "max_user")
    ]
    cancelled = await outbox_kinds(engine, "cancelled")
    assert cancelled.count("booking_reminder_24h") + cancelled.count("booking_reminder_2h") >= 1
    # время освободилось
    again = await client.post(B, json=manual(at(10), rid), headers=csrf(client))
    assert again.status_code == 201


async def test_cancel_without_notifying_client(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    uid = await max_booking(client, at(10), rid)
    r = await client.patch(
        f"{B}/{uid}",
        json={"status": "cancelled_by_business", "version": 1, "notify_client": False},
        headers=csrf(client),
    )
    assert r.status_code == 200 and r.json()["status"] == "cancelled_by_business"
    assert "booking_cancelled_client" not in await outbox_kinds(engine)
    bad = await client.patch(
        f"{B}/{uid}",
        json={"status": "cancelled_by_business", "version": 2, "notify_client": "no"},
        headers=csrf(client),
    )
    assert bad.status_code == 422


async def test_cancel_manual_booking_sends_nothing(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    made = await make_booking(client, at(10), rid)
    r = await client.patch(
        f"{B}/{made['id']}",
        json={"status": "cancelled_by_business", "version": 1},
        headers=csrf(client),
    )
    assert r.status_code == 200 and r.json()["cancel_reason"] is None
    assert "booking_cancelled_client" not in await outbox_kinds(engine)


# ---------- перенос ----------


async def test_admin_reschedule(client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID) -> None:
    rid = await seed_resource(engine)
    other = await seed_resource(engine, name="Другой", sort_order=1)
    uid = await max_booking(client, at(10), rid)
    base = await outbox_kinds(engine)
    r = await client.post(
        f"{B}/{uid}/reschedule",
        json={"starts_at": at(14), "resource_id": str(other), "version": 1},
        headers=csrf(client),
    )
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["id"] != uid and new["resource"]["id"] == str(other)
    assert new["rescheduled_from_id"] == uid and new["status"] == "confirmed"
    assert (await client.get(f"{B}/{uid}")).json()["booking"]["status"] == "rescheduled"
    events = (await client.get(f"{B}/{uid}")).json()["events"]
    assert events[-1]["type"] == "rescheduled" and events[-1]["actor"]["email"]
    added = [k for k in await outbox_kinds(engine, "pending") if k not in base]
    assert "booking_rescheduled_client" in added

    # повтор по устаревшей версии и по неактивной записи
    r = await client.post(
        f"{B}/{uid}/reschedule", json={"starts_at": at(15), "version": 1}, headers=csrf(client)
    )
    assert r.status_code == 409 and r.json()["code"] == "booking_not_active"
    r = await client.post(
        f"{B}/{new['id']}/reschedule",
        json={"starts_at": at(15), "version": 9},
        headers=csrf(client),
    )
    assert r.status_code == 409 and r.json()["code"] == "version_conflict"


async def test_admin_reschedule_without_notice_and_conflict(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    uid = await max_booking(client, at(10), rid)
    await make_booking(client, at(12), rid)
    before = await outbox_kinds(engine, "pending")
    r = await client.post(
        f"{B}/{uid}/reschedule",
        json={"starts_at": at(12), "resource_id": str(rid), "version": 1},
        headers=csrf(client),
    )
    assert r.status_code == 409 and r.json()["code"] == "slot_taken"
    assert (await client.get(f"{B}/{uid}")).json()["booking"]["status"] == "confirmed"

    r = await client.post(
        f"{B}/{uid}/reschedule",
        json={"starts_at": at(16), "resource_id": str(rid), "version": 1, "notify_client": False},
        headers=csrf(client),
    )
    assert r.status_code == 201
    assert "booking_rescheduled_client" not in [
        k for k in await outbox_kinds(engine, "pending") if k not in before
    ]
    r = await client.post(
        f"{B}/{uuid.uuid4()}/reschedule",
        json={"starts_at": at(16), "version": 1},
        headers=csrf(client),
    )
    assert r.status_code == 404


# ---------- сотрудники ----------


async def test_resource_crud_and_services(client: AsyncClient, admin: uuid.UUID) -> None:
    r = await client.post(R, json={"name": " Иван ", "title": "Барбер"}, headers=csrf(client))
    assert r.status_code == 201
    rid = r.json()["id"]
    assert r.json()["name"] == "Иван" and r.json()["is_active"] and r.json()["service_slugs"] == []

    r = await client.put(
        f"{R}/{rid}/services",
        json={"service_slugs": ["tires", "diagnostics", "tires"]},
        headers=csrf(client),
    )
    assert r.status_code == 200 and r.json()["service_slugs"] == ["diagnostics", "tires"]
    r = await client.put(
        f"{R}/{rid}/services", json={"service_slugs": ["nope"]}, headers=csrf(client)
    )
    assert r.status_code == 422 and r.json()["errors"][0]["code"] == "service_not_bookable"

    r = await client.patch(
        f"{R}/{rid}",
        json={"title": None, "sort_order": 5, "is_active": False},
        headers=csrf(client),
    )
    assert r.json()["title"] is None and r.json()["sort_order"] == 5 and not r.json()["is_active"]
    assert r.json()["service_slugs"] == ["diagnostics", "tires"]
    r = await client.patch(f"{R}/{rid}", json={"name": "Пётр"}, headers=csrf(client))
    assert r.json()["name"] == "Пётр" and r.json()["sort_order"] == 5

    listing = (await client.get(R)).json()
    assert [x["id"] for x in listing] == [rid]
    for bad in ({"name": ""}, {"name": "x" * 81}, {"unknown": 1}):
        assert (await client.post(R, json=bad, headers=csrf(client))).status_code == 422

    missing = uuid.uuid4()
    for method, url, payload in (
        ("PATCH", f"{R}/{missing}", {"name": "x"}),
        ("DELETE", f"{R}/{missing}", None),
        ("PUT", f"{R}/{missing}/services", {"service_slugs": []}),
        ("GET", f"{R}/{missing}/working-hours", None),
        ("GET", f"{R}/{missing}/exceptions", None),
    ):
        r = await client.request(method, url, json=payload, headers=csrf(client))
        assert r.status_code == 404, (method, url)

    assert (await client.delete(f"{R}/{rid}", headers=csrf(client))).status_code == 204
    assert (await client.get(R)).json() == []


async def test_delete_resource_with_bookings(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    made = await make_booking(client, at(10), rid)
    r = await client.delete(f"{R}/{rid}", headers=csrf(client))
    assert r.status_code == 409 and r.json()["code"] == "has_future_bookings"

    await client.patch(
        f"{B}/{made['id']}",
        json={"status": "cancelled_by_business", "version": 1},
        headers=csrf(client),
    )
    # будущих нет, но история осталась: сотрудник выключается, а не удаляется
    assert (await client.delete(f"{R}/{rid}", headers=csrf(client))).status_code == 204
    listing = (await client.get(R)).json()
    assert [(x["id"], x["is_active"]) for x in listing] == [(str(rid), False)]
    # и больше не предлагает время
    day = booking_day().date().isoformat()
    r = await client.get(
        f"{B}/slots", params={"service": "tires", "resource": str(rid), "date": day}
    )
    assert r.status_code == 422


# ---------- график ----------


async def test_working_hours_roundtrip_and_validation(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    url = f"{R}/{rid}/working-hours"
    got = (await client.get(url)).json()["days"]
    assert sorted(got) == ["1", "2", "3", "4", "5", "6", "7"] and got["3"] == [[540, 1080]]

    week = {"1": [[540, 780], [840, 1200]], "2": [[600, 900]]}
    r = await client.put(url, json={"days": week}, headers=csrf(client))
    assert r.status_code == 200
    days = (await client.get(url)).json()["days"]
    assert days["1"] == [[540, 780], [840, 1200]] and days["2"] == [[600, 900]]
    assert days["3"] == [] and days["7"] == []

    cases: list[dict[str, Any]] = [
        {"1": [[540, 700], [650, 800]]},  # пересечение
        {"1": [[800, 700]]},  # конец раньше начала
        {"1": [[0, 1441]]},  # за сутки
        {"1": [[-1, 10]]},
        {"8": [[540, 600]]},  # нет такого дня
        {"0": [[540, 600]]},
        {"x": [[540, 600]]},
    ]
    for bad in cases:
        r = await client.put(url, json={"days": bad}, headers=csrf(client))
        assert r.status_code == 422, bad
    assert (await client.get(url)).json()["days"]["1"] == [[540, 780], [840, 1200]]
    # касание интервалов допустимо
    r = await client.put(url, json={"days": {"1": [[540, 780], [780, 900]]}}, headers=csrf(client))
    assert r.status_code == 200
    assert (await client.put(url, json={"days": {}}, headers=csrf(client))).status_code == 200


async def test_schedule_conflict_flow(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)  # 09:00–18:00 каждый день
    uid = await max_booking(client, at(10), rid)
    made = await make_booking(client, at(16), rid)
    url = f"{R}/{rid}/working-hours"
    day = booking_day().isoweekday()
    short = {str(d): [[540, 780]] for d in range(1, 8)}  # до 13:00 — запись в 16:00 вне графика

    r = await client.put(url, json={"days": short}, headers=csrf(client))
    assert r.status_code == 409 and r.json()["code"] == "conflicts_with_bookings"
    listed = r.json()["bookings"]
    assert [b["id"] for b in listed] == [made["id"]]
    assert {"public_number", "starts_at", "client_name", "service_title"} <= set(listed[0])
    assert (await client.get(url)).json()["days"][str(day)] == [[540, 1080]]  # не сохранилось

    # force без отмены: график сохраняется, запись остаётся
    r = await client.put(url, json={"days": short}, params={"force": True}, headers=csrf(client))
    assert r.status_code == 200
    assert (await client.get(f"{B}/{made['id']}")).json()["booking"]["status"] == "confirmed"

    # force + cancel_conflicting: запись отменяется с причиной и уведомлением
    r = await client.put(
        url,
        json={"days": {str(d): [[540, 660]] for d in range(1, 8)}},
        params={"force": True, "cancel_conflicting": True},
        headers=csrf(client),
    )
    assert r.status_code == 200
    gone = (await client.get(f"{B}/{made['id']}")).json()
    assert gone["booking"]["status"] == "cancelled_by_business"
    assert gone["booking"]["cancel_reason"] == "Изменение графика"
    assert gone["events"][-1]["actor"] is None  # сделано системой
    still = (await client.get(f"{B}/{uid}")).json()["booking"]
    assert still["status"] == "confirmed"  # 10:00–10:55 помещается в 09:00–11:00
    # cancel_conflicting без force ничего не отменяет
    survivor = await make_booking(client, at(9), rid)
    r = await client.put(
        url,
        json={"days": {str(d): [[600, 660]] for d in range(1, 8)}},
        params={"cancel_conflicting": True},
        headers=csrf(client),
    )
    assert r.status_code == 409
    assert (await client.get(f"{B}/{survivor['id']}")).json()["booking"]["status"] == "confirmed"


# ---------- исключения ----------


async def test_exceptions_crud(client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID) -> None:
    rid = await seed_resource(engine)
    day = (booking_day() + timedelta(days=5)).date()
    url = f"{R}/{rid}/exceptions"
    r = await client.post(
        url,
        json={"date": day.isoformat(), "kind": "day_off", "note": " Отпуск "},
        headers=csrf(client),
    )
    assert r.status_code == 201 and r.json()["note"] == "Отпуск" and r.json()["intervals"] == []
    first_id = r.json()["id"]
    # на ту же дату — замена
    r = await client.post(
        url,
        json={
            "date": day.isoformat(),
            "kind": "custom_hours",
            "intervals": [{"start_min": 600, "end_min": 840}],
        },
        headers=csrf(client),
    )
    assert (
        r.status_code == 201 and r.json()["id"] == first_id and r.json()["kind"] == "custom_hours"
    )
    listing = (await client.get(url, params={"date_from": day.isoformat()})).json()
    assert [(e["date"], e["intervals"]) for e in listing] == [
        (day.isoformat(), [{"start_min": 600, "end_min": 840}])
    ]
    assert (await client.get(url, params={"date_from": "2100-01-01"})).json() == []
    assert (
        await client.get(url, params={"date_from": "2100-01-02", "date_to": "2100-01-01"})
    ).status_code == 422

    # слоты учитывают исключение
    slots = (
        await client.get(
            f"{B}/slots",
            params={"service": "tires", "resource": str(rid), "date": day.isoformat()},
        )
    ).json()["slots"]
    starts = [
        datetime.fromisoformat(s["starts_at"]).astimezone(NSK).strftime("%H:%M") for s in slots
    ]
    assert starts[0] == "10:00" and starts[-1] <= "13:15"

    invalid: list[dict[str, Any]] = [
        {"kind": "day_off", "intervals": [{"start_min": 1, "end_min": 2}]},
        {"kind": "custom_hours"},
        {"kind": "custom_hours", "intervals": [{"start_min": 5, "end_min": 5}]},
        {
            "kind": "custom_hours",
            "intervals": [{"start_min": 1, "end_min": 20}, {"start_min": 10, "end_min": 30}],
        },
        {"kind": "weekend"},
    ]
    for bad in invalid:
        r = await client.post(url, json={"date": day.isoformat(), **bad}, headers=csrf(client))
        assert r.status_code == 422, bad

    assert (await client.delete(f"{url}/{first_id}", headers=csrf(client))).status_code == 204
    assert (await client.get(url)).json() == []
    assert (await client.delete(f"{url}/{first_id}", headers=csrf(client))).status_code == 404
    other = await seed_resource(engine, name="Чужой")
    r = await client.delete(f"{R}/{other}/exceptions/{first_id}", headers=csrf(client))
    assert r.status_code == 404


async def test_exception_conflicts(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    made = await make_booking(client, at(10), rid)
    day = booking_day().date().isoformat()
    url = f"{R}/{rid}/exceptions"
    r = await client.post(url, json={"date": day, "kind": "day_off"}, headers=csrf(client))
    assert r.status_code == 409 and [b["id"] for b in r.json()["bookings"]] == [made["id"]]
    assert (await client.get(url)).json() == []

    # особые часы, в которые запись помещается, — не конфликт
    r = await client.post(
        url,
        json={
            "date": day,
            "kind": "custom_hours",
            "intervals": [{"start_min": 540, "end_min": 720}],
        },
        headers=csrf(client),
    )
    assert r.status_code == 201
    exc_id = r.json()["id"]
    # возврат к недельному графику (09–18) расширяет рабочее время — конфликтов нет
    assert (await client.delete(f"{url}/{exc_id}", headers=csrf(client))).status_code == 204

    # удаление исключения может вернуть более короткий недельный график
    await client.put(
        f"{R}/{rid}/working-hours",
        json={"days": {str(d): [[540, 600]] for d in range(1, 8)}},
        params={"force": True},
        headers=csrf(client),
    )
    r = await client.post(
        url,
        json={
            "date": day,
            "kind": "custom_hours",
            "intervals": [{"start_min": 540, "end_min": 720}],
        },
        headers=csrf(client),
    )
    assert r.status_code == 201  # теперь 10:00–10:45 (+буфер) внутри 09:00–12:00
    r = await client.delete(f"{url}/{r.json()['id']}", headers=csrf(client))
    assert r.status_code == 409 and r.json()["code"] == "conflicts_with_bookings"
    r = await client.delete(
        f"{url}/{(await client.get(url)).json()[0]['id']}",
        params={"force": True, "cancel_conflicting": True},
        headers=csrf(client),
    )
    assert r.status_code == 204
    detail = (await client.get(f"{B}/{made['id']}")).json()["booking"]
    assert detail["status"] == "cancelled_by_business"


# ---------- настройки ----------


async def test_booking_settings(client: AsyncClient, admin: uuid.UUID) -> None:
    got = (await client.get(SETTINGS)).json()
    assert got == {
        "slot_step_min": 15,
        "min_lead_min": 60,
        "horizon_days": 30,
        "cancel_deadline_min": 120,
        "reminders_enabled": True,
        "version": 1,
    }
    r = await client.patch(
        SETTINGS, json={"slot_step_min": 30, "horizon_days": 14, "version": 1}, headers=csrf(client)
    )
    assert r.status_code == 200
    assert (r.json()["slot_step_min"], r.json()["horizon_days"], r.json()["version"]) == (30, 14, 2)
    assert r.json()["min_lead_min"] == 60
    r = await client.patch(SETTINGS, json={"min_lead_min": 0, "version": 1}, headers=csrf(client))
    assert r.status_code == 409 and r.json()["code"] == "version_conflict"
    r = await client.patch(SETTINGS, json={"version": 1}, headers=csrf(client))
    assert r.status_code == 409
    r = await client.patch(SETTINGS, json={"version": 2}, headers=csrf(client))
    assert r.status_code == 200 and r.json()["version"] == 2
    for bad in (
        {"slot_step_min": 7},
        {"horizon_days": 0},
        {"horizon_days": 91},
        {"min_lead_min": -1},
    ):
        r = await client.patch(SETTINGS, json={**bad, "version": 2}, headers=csrf(client))
        assert r.status_code == 422, bad
    assert (
        await client.patch(SETTINGS, json={"horizon_days": 5}, headers=csrf(client))
    ).status_code == 422
    assert (await client.get(SETTINGS)).json()["slot_step_min"] == 30


# ---------- экспорт CSV ----------


async def test_export_csv_rules(client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID) -> None:
    rid = await seed_resource(engine)
    made = await client.post(
        B,
        json={**manual(at(10), rid), "name": "=Формула", "comment": "+7 не формула"},
        headers=csrf(client),
    )
    assert made.status_code == 201
    r = await client.get(f"{B}/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'attachment; filename="bookings-' in r.headers["content-disposition"]
    text = r.content.decode("utf-8")
    assert text.startswith("﻿Номер;Дата;Время;Сотрудник;Услуга;Клиент;Телефон;")
    line = next(row for row in text.splitlines() if "Формула" in row)
    # ячейки-формулы получают апостроф, источник и статус — по-русски
    assert "'=Формула" in line and "'+7 не формула" in line
    assert ";Админка;Подтверждена;" in line
    # фильтры те же, что у списка
    none = await client.get(f"{B}/export.csv", params={"q": "несуществующий"})
    assert none.content.decode("utf-8").count("\n") == 1


async def test_export_csv_errors(client: AsyncClient, admin: uuid.UUID) -> None:
    too_long = await client.get(
        f"{B}/export.csv", params={"date_from": "2030-01-01", "date_to": "2030-06-01"}
    )
    assert too_long.status_code == 422
    for method in ("post", "put", "patch", "delete"):
        r = await getattr(client, method)(f"{B}/export.csv", headers=csrf(client))
        assert r.status_code == 405, method
    anonymous = await client.get(f"{B}/export.csv", headers={"Cookie": ""})
    assert anonymous.status_code in (401, 403)


async def test_demo_bookings_are_marked_and_exported_as_demo(
    client: AsyncClient, engine: AsyncEngine, admin: uuid.UUID
) -> None:
    rid = await seed_resource(engine)
    uid = await max_booking(client, at(10), rid)
    real = (await client.get(f"{B}/{uid}")).json()["booking"]
    assert real["has_max"] is True and real["is_demo"] is False
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE bookings SET max_user_id = -7 WHERE id = :id"), {"id": uid}
        )
    demo = (await client.get(f"{B}/{uid}")).json()["booking"]
    assert demo["has_max"] is True and demo["is_demo"] is True
    export = (await client.get(f"{B}/export.csv")).content.decode("utf-8")
    assert ";Демо;" in export
