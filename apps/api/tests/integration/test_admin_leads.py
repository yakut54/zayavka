import csv
import io
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from tests.integration.test_auth import BASE, PASSWORD, csrf, login, make_admin
from tests.integration.test_leads import URL, payload

LEADS = "/api/v1/admin/leads"


@pytest.fixture
async def admin(client: AsyncClient, engine: AsyncEngine) -> uuid.UUID:
    admin_id = await make_admin(engine)
    assert (await login(client))[0] == 204
    return admin_id


async def seed(
    client_factory: Callable[[str], AsyncClient], count: int, **overrides: Any
) -> list[int]:
    numbers = []
    for i in range(count):
        c = client_factory(f"10.20.{i // 250}.{i % 250 + 1}")
        r = await c.post(URL, json=payload(**overrides))
        assert r.status_code == 201
        numbers.append(r.json()["public_number"])
    return numbers


async def lead_id_of(session: AsyncSession, number: int) -> str:
    row = (
        await session.execute(text("SELECT id FROM leads WHERE public_number = :n"), {"n": number})
    ).scalar_one()
    return str(row)


async def test_all_admin_endpoints_require_login(client: AsyncClient) -> None:
    fake = uuid.uuid4()
    calls = [
        ("GET", LEADS, None),
        ("GET", f"{LEADS}/export.csv", None),
        ("GET", f"{LEADS}/{fake}", None),
        ("PATCH", f"{LEADS}/{fake}", {"status": "done", "version": 1}),
        ("POST", f"{LEADS}/{fake}/notes", {"text": "x"}),
    ]
    for method, path, body in calls:
        r = await client.request(method, path, json=body)
        assert r.status_code == 401, (method, path)


async def test_every_state_changing_admin_route_enforces_csrf(
    client: AsyncClient, app: FastAPI, admin: uuid.UUID
) -> None:
    """Любой не-GET маршрут /admin (кроме login) без CSRF-токена → 403."""
    checked = 0
    for path, operations in app.openapi()["paths"].items():
        if not path.startswith("/api/v1/admin") or path.endswith("/login"):
            continue
        concrete = path.replace("{lead_id}", str(uuid.uuid4()))
        for method in set(operations) - {"get", "head", "options"}:
            r = await client.request(method, concrete, json={})
            assert r.status_code == 403, (method, path, r.status_code)
            checked += 1
    assert checked >= 5


async def test_list_default_sort_and_pagination(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    admin: uuid.UUID,
) -> None:
    await seed(client_factory, 12)
    r = await client.get(LEADS)
    body = r.json()
    assert r.status_code == 200
    assert (body["page"], body["page_size"], body["total"]) == (1, 25, 12)
    numbers = [i["public_number"] for i in body["items"]]
    assert numbers == sorted(numbers, reverse=True)
    item = body["items"][0]
    assert {"id", "name", "phone_e164", "status", "version", "created_at", "service_slug"} <= set(
        item
    )

    r = await client.get(LEADS, params={"page_size": 10, "page": 2})
    assert [i["public_number"] for i in r.json()["items"]] == [2, 1]
    r = await client.get(LEADS, params={"sort": "created_at", "page_size": 10})
    assert [i["public_number"] for i in r.json()["items"]][:3] == [1, 2, 3]
    r = await client.get(LEADS, params={"page": 99})
    assert r.json()["items"] == [] and r.json()["total"] == 12


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page_size": 9},
        {"page_size": 101},
        {"sort": "name"},
        {"status": "bogus"},
        {"date_from": "not-a-date"},
    ],
)
async def test_list_rejects_bad_params(client: AsyncClient, admin: uuid.UUID, params: Any) -> None:
    r = await client.get(LEADS, params=params)
    assert r.status_code == 422
    assert r.json()["code"] == "validation_error"


async def test_filter_by_status_and_search(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    c = client_factory("10.30.0.1")
    await c.post(URL, json=payload(name="Анна Смирнова", phone="+7 (912) 111-22-33"))
    await c.post(URL, json=payload(name="Борис Иванов", phone="+7 (913) 444-55-66"))
    await c.post(URL, json=payload(name="Клара_Under 100%", phone="+7 (914) 777-88-99"))
    await session.execute(text("UPDATE leads SET status = 'done' WHERE name = 'Борис Иванов'"))
    await session.commit()

    def names(r: Any) -> list[str]:
        return sorted(i["name"] for i in r.json()["items"])

    assert names(await client.get(LEADS, params={"status": "done"})) == ["Борис Иванов"]
    assert names(await client.get(LEADS, params={"status": "new"})) == [
        "Анна Смирнова",
        "Клара_Under 100%",
    ]
    assert names(await client.get(LEADS, params={"q": "смирн"})) == ["Анна Смирнова"]
    assert names(await client.get(LEADS, params={"q": "444-55"})) == ["Борис Иванов"]
    assert names(await client.get(LEADS, params={"q": "+7 913"})) == ["Борис Иванов"]
    # поиск по номеру заявки (цифры могут совпасть и с телефонами)
    assert "Клара_Under 100%" in names(await client.get(LEADS, params={"q": "3"}))
    # спецсимволы LIKE экранируются
    assert names(await client.get(LEADS, params={"q": "%"})) == ["Клара_Under 100%"]
    assert names(await client.get(LEADS, params={"q": "_"})) == ["Клара_Under 100%"]
    assert names(await client.get(LEADS, params={"q": "нет такого"})) == []
    both = await client.get(LEADS, params={"status": "new", "q": "Борис"})
    assert both.json()["total"] == 0


async def test_filter_by_dates_in_business_timezone(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    c = client_factory("10.31.0.1")
    for name in ("Ранний", "Поздний", "Вне"):
        await c.post(URL, json=payload(name=name))
    # Asia/Novosibirsk = UTC+7: 2026-03-10 00:30 местного = 2026-03-09 17:30 UTC
    await session.execute(
        text("UPDATE leads SET created_at = TIMESTAMPTZ '2026-03-09 17:30+00' WHERE name='Ранний'")
    )
    await session.execute(
        text("UPDATE leads SET created_at = TIMESTAMPTZ '2026-03-10 16:59+00' WHERE name='Поздний'")
    )
    await session.execute(
        text("UPDATE leads SET created_at = TIMESTAMPTZ '2026-03-10 17:00+00' WHERE name='Вне'")
    )
    await session.commit()

    def names(r: Any) -> list[str]:
        return sorted(i["name"] for i in r.json()["items"])

    day = {"date_from": "2026-03-10", "date_to": "2026-03-10"}
    assert names(await client.get(LEADS, params=day)) == ["Поздний", "Ранний"]
    assert names(await client.get(LEADS, params={"date_from": "2026-03-11"})) == ["Вне"]
    assert names(await client.get(LEADS, params={"date_to": "2026-03-09"})) == []


async def test_lead_detail_with_events(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1, message="Нужна консультация")
    lead_id = await lead_id_of(session, number)
    r = await client.get(f"{LEADS}/{lead_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["lead"]["public_number"] == number
    assert body["lead"]["message"] == "Нужна консультация"
    assert body["lead"]["phone_e164"] == "+79123456789"
    assert [(e["type"], e["actor"], e["payload"]) for e in body["events"]] == [
        ("created", None, {})
    ]


async def test_lead_detail_404(client: AsyncClient, admin: uuid.UUID) -> None:
    r = await client.get(f"{LEADS}/{uuid.uuid4()}")
    assert r.status_code == 404 and r.json()["code"] == "not_found"
    assert (await client.get(f"{LEADS}/not-a-uuid")).status_code == 422


async def test_change_status_flow_and_history(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    r = await client.patch(
        f"{LEADS}/{lead_id}", json={"status": "in_progress", "version": 1}, headers=csrf(client)
    )
    assert r.status_code == 200
    assert (r.json()["status"], r.json()["version"]) == ("in_progress", 2)
    assert r.json()["updated_at"] > r.json()["created_at"]

    events = (await client.get(f"{LEADS}/{lead_id}")).json()["events"]
    assert [e["type"] for e in events] == ["created", "status_changed"]
    assert events[1]["payload"] == {"from": "new", "to": "in_progress"}
    assert events[1]["actor"]["id"] == str(admin)


async def test_status_update_with_stale_version_conflicts(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    ok = await client.patch(
        f"{LEADS}/{lead_id}", json={"status": "done", "version": 1}, headers=csrf(client)
    )
    assert ok.status_code == 200
    stale = await client.patch(
        f"{LEADS}/{lead_id}", json={"status": "spam", "version": 1}, headers=csrf(client)
    )
    assert stale.status_code == 409 and stale.json()["code"] == "version_conflict"
    assert (await client.get(f"{LEADS}/{lead_id}")).json()["lead"]["status"] == "done"
    # даже тот же статус при старой версии — конфликт
    same = await client.patch(
        f"{LEADS}/{lead_id}", json={"status": "done", "version": 1}, headers=csrf(client)
    )
    assert same.status_code == 409


async def test_same_status_is_noop(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    r = await client.patch(
        f"{LEADS}/{lead_id}", json={"status": "new", "version": 1}, headers=csrf(client)
    )
    assert r.status_code == 200 and r.json()["version"] == 1
    events = (await client.get(f"{LEADS}/{lead_id}")).json()["events"]
    assert [e["type"] for e in events] == ["created"]


async def test_patch_validation_and_404(client: AsyncClient, admin: uuid.UUID) -> None:
    r = await client.patch(
        f"{LEADS}/{uuid.uuid4()}", json={"status": "done", "version": 1}, headers=csrf(client)
    )
    assert r.status_code == 404
    for body in (
        {"status": "bogus", "version": 1},
        {"status": "done"},
        {"status": "done", "version": 0},
    ):
        r = await client.patch(f"{LEADS}/{uuid.uuid4()}", json=body, headers=csrf(client))
        assert r.status_code == 422


async def test_parallel_status_changes_one_wins(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    import asyncio

    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    headers = csrf(client)
    results = await asyncio.gather(
        client.patch(f"{LEADS}/{lead_id}", json={"status": "done", "version": 1}, headers=headers),
        client.patch(f"{LEADS}/{lead_id}", json={"status": "spam", "version": 1}, headers=headers),
    )
    assert sorted(r.status_code for r in results) == [200, 409]


async def test_add_note(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    r = await client.post(
        f"{LEADS}/{lead_id}/notes",
        json={"text": "  Позвонил, договорились  "},
        headers=csrf(client),
    )
    assert r.status_code == 201
    assert r.json()["type"] == "note_added"
    assert r.json()["payload"] == {"text": "Позвонил, договорились"}
    assert r.json()["actor"]["email"] == "owner@example.ru"
    events = (await client.get(f"{LEADS}/{lead_id}")).json()["events"]
    assert [e["type"] for e in events] == ["created", "note_added"]


async def test_note_validation(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    for text_value, code in (("", "too_short"), ("   ", "too_short"), ("x" * 2001, "too_long")):
        r = await client.post(
            f"{LEADS}/{lead_id}/notes", json={"text": text_value}, headers=csrf(client)
        )
        assert r.status_code == 422
        assert r.json()["errors"] == [{"field": "text", "code": code}]
    assert (
        await client.post(
            f"{LEADS}/{lead_id}/notes", json={"text": "x" * 2000}, headers=csrf(client)
        )
    ).status_code == 201
    r = await client.post(f"{LEADS}/{uuid.uuid4()}/notes", json={"text": "x"}, headers=csrf(client))
    assert r.status_code == 404


# --- CSV ------------------------------------------------------------------


def parse_csv(raw: bytes) -> list[list[str]]:
    assert raw.startswith(b"\xef\xbb\xbf")
    return list(csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))


async def test_export_csv_format(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    c = client_factory("10.40.0.1")
    await c.post(
        URL,
        json=payload(name='Иван; с "кавычками"', message="строка 1\nстрока 2", email=None),
    )
    await session.execute(text("UPDATE leads SET created_at = TIMESTAMPTZ '2026-03-09 17:30+00'"))
    await session.commit()

    r = await client.get(f"{LEADS}/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"].startswith('attachment; filename="leads-')
    assert r.headers["content-disposition"].endswith('.csv"')
    assert r.content.startswith("﻿Номер;Дата;Имя;Телефон;Email;Услуга;Статус;Сообщение".encode())
    header, row = parse_csv(r.content)
    assert header == ["Номер", "Дата", "Имя", "Телефон", "Email", "Услуга", "Статус", "Сообщение"]
    assert row == [
        "1",
        "2026-03-10 00:30",
        'Иван; с "кавычками"',
        "8 (912) 345-67-89",
        "",
        "Компьютерная диагностика",
        "Новая",
        "строка 1\nстрока 2",
    ]


async def test_export_csv_escapes_formulas(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    admin: uuid.UUID,
) -> None:
    c = client_factory("10.41.0.1")
    for name in ('=HYPERLINK("http://evil")', "+cmd|calc", "-1+1", "@SUM(A1)"):
        await c.post(URL, json=payload(name=name, message=name))
    r = await client.get(f"{LEADS}/export.csv")
    rows = parse_csv(r.content)[1:]
    assert len(rows) == 4
    for row in rows:
        assert row[2].startswith("'") and row[7].startswith("'")
    assert any(row[2] == '\'=HYPERLINK("http://evil")' for row in rows)


async def test_export_csv_respects_filters_and_empty(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    c = client_factory("10.42.0.1")
    await c.post(URL, json=payload(name="Один"))
    await c.post(URL, json=payload(name="Два"))
    await session.execute(text("UPDATE leads SET status='done' WHERE name='Два'"))
    await session.commit()
    rows = parse_csv((await client.get(f"{LEADS}/export.csv", params={"status": "done"})).content)
    assert [r[2] for r in rows[1:]] == ["Два"] and rows[1][6] == "Выполнена"
    rows = parse_csv((await client.get(f"{LEADS}/export.csv", params={"q": "zzz"})).content)
    assert len(rows) == 1


async def test_export_csv_streams_many_rows(
    client: AsyncClient, session: AsyncSession, admin: uuid.UUID
) -> None:
    await session.execute(
        text(
            "INSERT INTO consents (policy_version, consent_text_sha256, ip_hash, user_agent)"
            " VALUES ('v', '\\x00', '\\x00', 'ua')"
        )
    )
    await session.execute(
        text(
            "INSERT INTO leads (name, phone_e164, consent_id)"
            " SELECT 'Лид ' || g, '+79123456789', (SELECT id FROM consents)"
            " FROM generate_series(1, 1200) g"
        )
    )
    await session.commit()
    rows = parse_csv((await client.get(f"{LEADS}/export.csv")).content)
    assert len(rows) == 1201


async def test_admin_auth_still_works_with_leads_cookie_flow(
    client: AsyncClient, admin: uuid.UUID
) -> None:
    assert (await client.get(f"{BASE}/me")).status_code == 200
    assert PASSWORD


@pytest.mark.parametrize(
    ("params"),
    [{"date_to": "0"}, {"date_from": "1700000000"}, {"date_from": "2026-3-1"}, {"q": "a\x00b"}],
)
async def test_list_and_export_reject_unsafe_filters(
    client: AsyncClient, admin: uuid.UUID, params: dict[str, str]
) -> None:
    for path in (LEADS, f"{LEADS}/export.csv"):
        r = await client.get(path, params=params)
        assert r.status_code == 422, (path, params)


async def test_nul_and_surrogates_are_422_not_500(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    note = await client.post(
        f"{LEADS}/{lead_id}/notes", json={"text": "a\u0000b"}, headers=csrf(client)
    )
    assert note.status_code == 422
    raw = b'{"text": "\ud800"}'
    r = await client.post(
        f"{LEADS}/{lead_id}/notes",
        content=raw,
        headers={**csrf(client), "Content-Type": "application/json"},
    )
    assert r.status_code == 422
    public = await client_factory("10.50.0.1").post(URL, json=payload(name="Ив\u0000ан"))
    assert public.status_code == 422
    assert public.json()["errors"] == [{"field": "name", "code": "invalid_format"}]


async def test_wrong_body_type_is_422_and_bad_json_is_400(
    client: AsyncClient, admin: uuid.UUID
) -> None:
    path = f"{LEADS}/{uuid.uuid4()}"
    r = await client.patch(path, json=[None, None], headers=csrf(client))
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "body", "code": "invalid_format"}]
    r = await client.patch(
        path, content="{oops", headers={**csrf(client), "Content-Type": "application/json"}
    )
    assert r.status_code == 400


async def test_405_has_allow_header(client: AsyncClient) -> None:
    r = await client.request("TRACE", "/api/v1/healthz")
    assert r.status_code == 405
    assert r.headers["allow"] == "GET"
    assert r.headers["content-type"].startswith("application/problem+json")


async def test_405_allow_lists_every_documented_method(
    client: AsyncClient, admin: uuid.UUID
) -> None:
    r = await client.request("OPTIONS", f"{LEADS}/{uuid.uuid4()}")
    assert r.status_code == 405
    assert r.headers["allow"] == "GET, PATCH"
    r = await client.request("PATCH", f"{LEADS}/export.csv", headers=csrf(client))
    assert r.status_code == 405 and r.headers["allow"] == "GET"


async def test_huge_page_number_is_422_not_500(client: AsyncClient, admin: uuid.UUID) -> None:
    r = await client.get(LEADS, params={"page": 127940675533589394})
    assert r.status_code == 422


async def test_booleans_are_not_accepted_as_integers(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    session: AsyncSession,
    admin: uuid.UUID,
) -> None:
    (number,) = await seed(client_factory, 1)
    lead_id = await lead_id_of(session, number)
    r = await client.patch(
        f"{LEADS}/{lead_id}", json={"status": "done", "version": True}, headers=csrf(client)
    )
    assert r.status_code == 422
    r = await client_factory("10.60.0.1").post(URL, json=payload(elapsed_ms=False))
    assert r.status_code == 422
