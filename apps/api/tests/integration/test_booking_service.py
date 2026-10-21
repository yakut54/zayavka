import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.booking.service import BookingResult, BookingService, Client, NewBooking
from app.catalog import CatalogService
from app.domain.errors import (
    BookingNotActive,
    BookingNotFound,
    NotOwner,
    RateLimited,
    SlotTaken,
    TooLateToChange,
    ValidationFailed,
    VersionConflict,
)
from tests.conftest import make_settings

NSK = ZoneInfo("Asia/Novosibirsk")
DAY = date(2030, 1, 7)  # понедельник
POLICY = "2026-10-20"
USER = 1001


def at(hours: int, minutes: int = 0, day: date = DAY) -> datetime:
    return datetime(day.year, day.month, day.day, hours, minutes, tzinfo=NSK).astimezone(UTC)


@dataclass
class Clock:
    now: datetime = datetime(2030, 1, 1, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now


CATALOG = {
    "tires": CatalogService("tires", "Шиномонтаж", 2000, True, 45, 10),
    "diagnostics": CatalogService("diagnostics", "Диагностика", 1500, True, 60, 15),
    "consult": CatalogService("consult", "Консультация", None, False, None, 0),
}


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def svc(engine: AsyncEngine, pg_url: str, clock: Clock) -> BookingService:
    return BookingService(
        async_sessionmaker(engine, expire_on_commit=False),
        make_settings(pg_url, rate_limit_booking="50/600"),
        catalog=CATALOG,
        consent_text_sha256=b"\x01" * 32,
        clock=clock,
    )


async def seed_resource(
    engine: AsyncEngine,
    *,
    name: str = "Мастер",
    sort_order: int = 0,
    services: tuple[str, ...] = ("tires",),
    hours: tuple[int, int] = (540, 1080),
    active: bool = True,
) -> uuid.UUID:
    async with engine.begin() as conn:
        rid = (
            await conn.execute(
                text(
                    "INSERT INTO resources (name, sort_order, is_active)"
                    " VALUES (:n, :o, :a) RETURNING id"
                ),
                {"n": name, "o": sort_order, "a": active},
            )
        ).scalar_one()
        for slug in services:
            await conn.execute(
                text("INSERT INTO resource_services VALUES (:r, :s)"), {"r": rid, "s": slug}
            )
        for weekday in range(1, 8):
            await conn.execute(
                text(
                    "INSERT INTO working_hours (resource_id, weekday, start_min, end_min)"
                    " VALUES (:r, :d, :s, :e)"
                ),
                {"r": rid, "d": weekday, "s": hours[0], "e": hours[1]},
            )
    return rid


def new(
    starts_at: datetime,
    resource_id: uuid.UUID | None,
    *,
    service: str = "tires",
    user: int | None = USER,
    key: str | None = None,
    **overrides: object,
) -> NewBooking:
    values: dict[str, object] = {
        "service_slug": service,
        "resource_id": resource_id,
        "starts_at": starts_at,
        "client": Client(
            name="Иван", phone="+7 999 123-45-67", phone_source="max_contact", max_user_id=user
        ),
        "source": "max",
        "policy_version": POLICY,
        "ip_hash": b"\x02" * 32,
        "user_agent": "test",
        "idempotency_key": key,
    }
    values.update(overrides)
    return NewBooking(**values)  # type: ignore[arg-type]


async def rows(engine: AsyncEngine, sql: str, **params: object) -> list[dict[str, object]]:
    async with engine.connect() as conn:
        return [dict(r._mapping) for r in await conn.execute(text(sql), params)]


async def outbox(engine: AsyncEngine) -> list[dict[str, object]]:
    return await rows(
        engine,
        "SELECT kind, channel, status, dedupe_key, next_attempt_at, payload"
        " FROM notification_outbox ORDER BY kind, channel",
    )


def local_times(slots: list[object]) -> list[str]:
    return [s.starts_at.astimezone(NSK).strftime("%H:%M") for s in slots]  # type: ignore[attr-defined]


# ---------- свободное время ----------


async def test_slots_follow_schedule_and_hide_buffer(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    slots = await svc.slots("tires", rid, DAY)
    times = local_times(slots)
    assert times[0] == "09:00"
    assert times[-1] == "17:00"  # 45 мин + буфер 10 помещаются до 18:00
    assert slots[0].ends_at - slots[0].starts_at == timedelta(minutes=45)


async def test_schedule_exception_changes_the_day(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO schedule_exceptions (resource_id, date, kind, intervals)"
                " VALUES (:r, :d, 'custom_hours', CAST(:i AS jsonb))"
            ),
            {"r": rid, "d": DAY, "i": '[{"start_min": 720, "end_min": 780}]'},
        )
        await conn.execute(
            text(
                "INSERT INTO schedule_exceptions (resource_id, date, kind)"
                " VALUES (:r, :d, 'day_off')"
            ),
            {"r": rid, "d": DAY + timedelta(days=1)},
        )
    assert local_times(await svc.slots("tires", rid, DAY)) == ["12:00"]
    assert await svc.slots("tires", rid, DAY + timedelta(days=1)) == []


async def test_any_resource_merges_slots_and_hides_who(
    engine: AsyncEngine, svc: BookingService
) -> None:
    first = await seed_resource(engine, name="Анна", hours=(540, 600 + 15))
    second = await seed_resource(engine, name="Борис", sort_order=1, hours=(600, 720))
    slots = await svc.slots("tires", None, DAY)
    assert local_times(slots)[:3] == ["09:00", "09:15", "10:00"]
    by_time = {s.starts_at.astimezone(NSK).strftime("%H:%M"): set(s.resource_ids) for s in slots}
    assert by_time["09:00"] == {first}
    assert by_time["10:00"] == {second}


async def test_unknown_or_inactive_resource_is_not_available(
    engine: AsyncEngine, svc: BookingService
) -> None:
    inactive = await seed_resource(engine, active=False)
    other = await seed_resource(engine, services=("diagnostics",))
    for rid in (inactive, other, uuid.uuid4()):
        with pytest.raises(ValidationFailed) as info:
            await svc.slots("tires", rid, DAY)
        assert info.value.errors[0].code == "resource_not_available"


async def test_service_must_be_bookable(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine)
    for slug in ("consult", "nope"):
        with pytest.raises(ValidationFailed) as info:
            await svc.slots(slug, rid, DAY)
        assert info.value.errors[0].code == "service_not_bookable"


async def test_available_days_flags(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine, hours=(540, 600))
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO schedule_exceptions (resource_id, date, kind) VALUES (:r, :d, 'day_off')"
            ),
            {"r": rid, "d": DAY + timedelta(days=1)},
        )
    days = await svc.available_days("tires", rid, DAY, DAY + timedelta(days=2))
    assert days == [
        (DAY, True),
        (DAY + timedelta(days=1), False),
        (DAY + timedelta(days=2), True),
    ]
    await svc.create(new(at(9), rid))  # единственный слот дня
    assert (await svc.available_days("tires", rid, DAY, DAY)) == [(DAY, False)]


async def test_available_days_rejects_long_ranges(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine)
    with pytest.raises(ValidationFailed):
        await svc.available_days("tires", rid, DAY, DAY + timedelta(days=31))
    with pytest.raises(ValidationFailed):
        await svc.available_days("tires", rid, DAY, DAY - timedelta(days=1))


# ---------- создание ----------


async def test_create_writes_booking_event_consent_and_outbox(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    result = await svc.create(new(at(10), rid))
    assert result.created is True
    booking = result.booking
    assert (booking.status.value, booking.version, booking.public_number) == ("confirmed", 1, 1)
    assert booking.ends_at - booking.starts_at == timedelta(minutes=45)
    assert booking.blocked.upper - booking.starts_at == timedelta(minutes=55)
    assert booking.client_phone_e164 == "+79991234567"
    assert booking.service_title_snapshot == "Шиномонтаж" and booking.price_from_snapshot == 2000
    assert booking.consent_id is not None
    assert result.resource.name == "Мастер"

    assert [e["type"] for e in await rows(engine, "SELECT type FROM booking_events")] == ["created"]
    assert (await rows(engine, "SELECT policy_version FROM consents"))[0][
        "policy_version"
    ] == POLICY

    box = await outbox(engine)
    assert [(b["kind"], b["channel"]) for b in box] == [
        ("booking_confirmed_client", "max_user"),
        ("booking_created_owner", "log"),
        ("booking_reminder_24h", "max_user"),
        ("booking_reminder_2h", "max_user"),
    ]
    reminders = {b["kind"]: b for b in box if str(b["kind"]).startswith("booking_reminder")}
    assert reminders["booking_reminder_24h"]["next_attempt_at"] == booking.starts_at - timedelta(
        hours=24
    )
    assert reminders["booking_reminder_2h"]["next_attempt_at"] == booking.starts_at - timedelta(
        hours=2
    )
    assert reminders["booking_reminder_2h"]["dedupe_key"] == f"reminder_2h:{booking.id}"
    assert all(b["payload"] == {"booking_id": str(booking.id)} for b in box)

    assert at(10) not in [s.starts_at for s in await svc.slots("tires", rid, DAY)]


async def test_reminders_in_the_past_are_not_scheduled(
    engine: AsyncEngine, svc: BookingService, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    clock.now = at(10) - timedelta(hours=3)
    await svc.create(new(at(10), rid))
    kinds = [b["kind"] for b in await outbox(engine)]
    assert "booking_reminder_2h" in kinds and "booking_reminder_24h" not in kinds


async def test_reminders_can_be_disabled(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine)
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE booking_settings SET reminders_enabled = false"))
    await svc.create(new(at(10), rid))
    assert [b["kind"] for b in await outbox(engine)] == [
        "booking_confirmed_client",
        "booking_created_owner",
    ]


async def test_admin_booking_without_max_user_has_no_client_messages(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    cmd = new(
        at(10),
        rid,
        user=None,
        source="admin",
        policy_version=None,
        client=Client(name="Пётр", phone="89990001122", phone_source="admin"),
    )
    result = await svc.create(cmd)
    assert result.booking.consent_id is None and result.booking.source == "admin"
    assert [b["kind"] for b in await outbox(engine)] == ["booking_created_owner"]
    assert (await rows(engine, "SELECT actor FROM booking_events"))[0]["actor"] == "admin"


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"service": "consult"}, "service_slug", "service_not_bookable"),
        ({"policy_version": "old"}, "consent", "consent_required"),
        ({"client": Client("Иван", "123", "manual", USER)}, "phone", "phone_invalid"),
    ],
)
async def test_create_validation(
    engine: AsyncEngine, svc: BookingService, overrides: dict[str, object], field: str, code: str
) -> None:
    rid = await seed_resource(engine)
    with pytest.raises(ValidationFailed) as info:
        await svc.create(new(at(10), rid, **overrides))
    assert [(e.field, e.code) for e in info.value.errors] == [(field, code)]


async def test_resource_must_offer_the_service(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine, services=("diagnostics",))
    with pytest.raises(ValidationFailed) as info:
        await svc.create(new(at(10), rid))
    assert info.value.errors[0].code == "resource_not_available"


async def test_time_outside_lead_or_horizon_is_out_of_range(
    engine: AsyncEngine, svc: BookingService, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    clock.now = at(9, 30)
    for starts in (at(10), at(8), at(10, day=DAY + timedelta(days=60))):
        with pytest.raises(ValidationFailed) as info:
            await svc.create(new(starts, rid))
        assert info.value.errors[0].code == "slot_out_of_range"
    clock.now = at(8, 45)  # ровно через min_lead (60 мин) — можно
    await svc.create(new(at(9, 45), rid))


async def test_admin_may_book_inside_lead_time(
    engine: AsyncEngine, svc: BookingService, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    clock.now = at(9, 40)
    cmd = new(
        at(10),
        rid,
        user=None,
        source="admin",
        policy_version=None,
        ignore_lead_time=True,
        client=Client("Пётр", "89990001122", "admin"),
    )
    assert (await svc.create(cmd)).created


async def test_not_on_grid_or_busy_time_is_slot_taken(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    await svc.create(new(at(10), rid))
    for starts in (at(10, 20), at(10, 15), at(10)):
        with pytest.raises(SlotTaken) as info:
            await svc.create(new(starts, rid, user=2))
        offered = [s["starts_at"] for s in info.value.extra["slots"]]
        assert at(10).isoformat() not in offered and offered


async def test_parallel_requests_for_one_time_give_exactly_one_booking(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    results = await asyncio.gather(
        svc.create(new(at(10), rid, user=1)),
        svc.create(new(at(10), rid, user=2)),
        return_exceptions=True,
    )
    assert sum(isinstance(r, BookingResult) for r in results) == 1
    errors = [r for r in results if isinstance(r, Exception)]
    assert len(errors) == 1 and isinstance(errors[0], SlotTaken)
    assert errors[0].extra["slots"]
    assert (await rows(engine, "SELECT count(*) AS n FROM bookings"))[0]["n"] == 1


async def test_parallel_any_specialist_two_resources_both_succeed(
    engine: AsyncEngine, svc: BookingService
) -> None:
    await seed_resource(engine, name="Анна", sort_order=0)
    await seed_resource(engine, name="Борис", sort_order=1)
    results = await asyncio.gather(
        svc.create(new(at(10), None, user=1)),
        svc.create(new(at(10), None, user=2)),
        return_exceptions=True,
    )
    assert all(isinstance(r, BookingResult) for r in results)
    assert len({r.resource.id for r in results if isinstance(r, BookingResult)}) == 2


async def test_parallel_any_specialist_one_resource_one_conflict(
    engine: AsyncEngine, svc: BookingService
) -> None:
    await seed_resource(engine)
    results = await asyncio.gather(
        svc.create(new(at(10), None, user=1)),
        svc.create(new(at(10), None, user=2)),
        return_exceptions=True,
    )
    assert sum(isinstance(r, BookingResult) for r in results) == 1
    assert sum(isinstance(r, SlotTaken) for r in results) == 1


async def test_any_specialist_prefers_less_loaded_then_sort_order(
    engine: AsyncEngine, svc: BookingService
) -> None:
    anna = await seed_resource(engine, name="Анна", sort_order=0)
    boris = await seed_resource(engine, name="Борис", sort_order=1)
    tie = await svc.create(new(at(9), None, user=1))
    assert tie.resource.id == anna  # поровну — по sort_order
    second = await svc.create(new(at(12), None, user=2))
    assert second.resource.id == boris  # у Анны уже есть запись в этот день
    third = await svc.create(new(at(14), None, user=3))
    assert third.resource.id == anna


async def test_idempotency_key_returns_the_same_booking(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    first = await svc.create(new(at(10), rid, key="k1"))
    again = await svc.create(new(at(10), rid, key="k1"))
    assert (first.created, again.created) == (True, False)
    assert first.booking.id == again.booking.id
    assert (await rows(engine, "SELECT count(*) AS n FROM bookings"))[0]["n"] == 1
    assert len(await outbox(engine)) == 4  # повтор ничего не добавил


async def test_parallel_requests_with_one_key_create_one_booking(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    results = await asyncio.gather(
        svc.create(new(at(10), rid, key="same")),
        svc.create(new(at(10), rid, key="same")),
    )
    assert results[0].booking.id == results[1].booking.id
    assert sorted(r.created for r in results) == [False, True]
    assert (await rows(engine, "SELECT count(*) AS n FROM bookings"))[0]["n"] == 1


async def test_booking_rate_limit(engine: AsyncEngine, pg_url: str, clock: Clock) -> None:
    limited = BookingService(
        async_sessionmaker(engine, expire_on_commit=False),
        make_settings(pg_url, rate_limit_booking="2/600"),
        catalog=CATALOG,
        consent_text_sha256=b"\x01" * 32,
        clock=clock,
    )
    rid = await seed_resource(engine)
    await limited.create(new(at(9), rid))
    await limited.create(new(at(11), rid))
    with pytest.raises(RateLimited):
        await limited.create(new(at(13), rid))
    await limited.create(new(at(13), rid, user=2))  # у другого пользователя своё окно


# ---------- отмена ----------


async def test_cancel_frees_slot_and_cancels_pending_tasks(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    booking = (await svc.create(new(at(10), rid))).booking
    result = await svc.cancel(booking.id, USER, booking.version)
    assert result.booking.status.value == "cancelled_by_client"
    assert result.booking.version == 2 and result.booking.cancelled_at is not None

    box = await outbox(engine)
    by_kind = {b["kind"]: b["status"] for b in box}
    assert by_kind["booking_reminder_24h"] == by_kind["booking_reminder_2h"] == "cancelled"
    assert by_kind["booking_confirmed_client"] == "cancelled"
    assert by_kind["booking_cancelled_owner"] == "pending"
    assert [
        e["type"]
        for e in await rows(engine, "SELECT type FROM booking_events ORDER BY created_at, id")
    ] == ["created", "cancelled"]
    assert at(10) in [s.starts_at for s in await svc.slots("tires", rid, DAY)]


async def test_cancel_checks(engine: AsyncEngine, svc: BookingService, clock: Clock) -> None:
    rid = await seed_resource(engine)
    booking = (await svc.create(new(at(10), rid))).booking
    with pytest.raises(NotOwner):
        await svc.cancel(booking.id, 999, booking.version)
    with pytest.raises(BookingNotFound):
        await svc.cancel(uuid.uuid4(), USER, 1)
    with pytest.raises(VersionConflict):
        await svc.cancel(booking.id, USER, 5)
    clock.now = at(10) - timedelta(minutes=119)  # дедлайн по умолчанию — за 120 минут
    with pytest.raises(TooLateToChange):
        await svc.cancel(booking.id, USER, booking.version)
    clock.now = at(10) - timedelta(minutes=120)  # ровно в дедлайн — ещё можно
    await svc.cancel(booking.id, USER, booking.version)
    with pytest.raises(BookingNotActive):
        await svc.cancel(booking.id, USER, 2)


# ---------- перенос ----------


async def test_reschedule_to_overlapping_time_of_same_resource(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    old = (await svc.create(new(at(10), rid))).booking
    result = await svc.reschedule(
        old.id, USER, starts_at=at(10, 30), resource_id=rid, version=old.version
    )
    assert result.created is True
    new_booking = result.booking
    assert new_booking.id != old.id and new_booking.rescheduled_from_id == old.id
    assert new_booking.consent_id == old.consent_id
    assert new_booking.client_name == old.client_name and new_booking.version == 1

    statuses = {r["id"]: r["status"] for r in await rows(engine, "SELECT id, status FROM bookings")}
    assert statuses[old.id] == "rescheduled" and statuses[new_booking.id] == "confirmed"

    box = await outbox(engine)
    old_tasks = [b for b in box if b["payload"] == {"booking_id": str(old.id)}]
    assert old_tasks and all(
        b["status"] == "cancelled" for b in old_tasks if b["kind"] != "booking_created_owner"
    )
    kinds = [b["kind"] for b in box if b["payload"] == {"booking_id": str(new_booking.id)}]
    assert "booking_rescheduled_client" in kinds and "booking_reminder_2h" in kinds
    events = await rows(engine, "SELECT booking_id, type FROM booking_events")
    assert {(e["booking_id"], e["type"]) for e in events} >= {
        (old.id, "created"),
        (old.id, "rescheduled"),
        (new_booking.id, "created"),
    }


async def test_reschedule_to_taken_time_keeps_old_booking(
    engine: AsyncEngine, svc: BookingService
) -> None:
    rid = await seed_resource(engine)
    await svc.create(new(at(12), rid, user=2))
    old = (await svc.create(new(at(10), rid))).booking
    with pytest.raises(SlotTaken):
        await svc.reschedule(old.id, USER, starts_at=at(12), resource_id=rid, version=old.version)
    current = (await svc.get(old.id, USER)).booking
    assert current.status.value == "confirmed" and current.version == 1
    assert (await rows(engine, "SELECT count(*) AS n FROM bookings"))[0]["n"] == 2


async def test_reschedule_checks(engine: AsyncEngine, svc: BookingService, clock: Clock) -> None:
    rid = await seed_resource(engine)
    old = (await svc.create(new(at(10), rid))).booking
    with pytest.raises(NotOwner):
        await svc.reschedule(old.id, 999, starts_at=at(14), resource_id=rid, version=1)
    with pytest.raises(BookingNotFound):
        await svc.reschedule(uuid.uuid4(), USER, starts_at=at(14), resource_id=rid, version=1)
    clock.now = at(10) - timedelta(minutes=60)
    with pytest.raises(TooLateToChange):
        await svc.reschedule(old.id, USER, starts_at=at(14), resource_id=rid, version=1)


async def test_reschedule_is_idempotent(engine: AsyncEngine, svc: BookingService) -> None:
    rid = await seed_resource(engine)
    old = (await svc.create(new(at(10), rid))).booking
    first = await svc.reschedule(
        old.id, USER, starts_at=at(14), resource_id=rid, version=1, idempotency_key="r1"
    )
    again = await svc.reschedule(
        old.id, USER, starts_at=at(14), resource_id=rid, version=1, idempotency_key="r1"
    )
    assert first.booking.id == again.booking.id and again.created is False
    assert (await rows(engine, "SELECT count(*) AS n FROM bookings"))[0]["n"] == 2


# ---------- чтение ----------


async def test_get_and_list_only_own_bookings(
    engine: AsyncEngine, svc: BookingService, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    mine = [(await svc.create(new(at(9 + i), rid))).booking for i in range(0, 8, 2)]
    await svc.create(new(at(17), rid, user=2))
    cancelled = mine[0]
    await svc.cancel(cancelled.id, USER, 1)

    assert (await svc.get(mine[1].id, USER)).resource.name == "Мастер"
    with pytest.raises(NotOwner):
        await svc.get(mine[1].id, 2)
    with pytest.raises(BookingNotFound):
        await svc.get(uuid.uuid4(), USER)

    upcoming, total = await svc.list_for_user(USER, upcoming=True, page=1)
    assert total == 3 and [r.booking.id for r in upcoming] == [b.id for b in mine[1:]]
    past, past_total = await svc.list_for_user(USER, upcoming=False, page=1)
    assert past_total == 1 and past[0].booking.id == cancelled.id

    clock.now = at(12)  # запись на 11:00 уже закончилась
    upcoming, total = await svc.list_for_user(USER, upcoming=True, page=1)
    assert [r.booking.id for r in upcoming] == [b.id for b in mine[2:]]
    assert (await svc.list_for_user(USER, upcoming=False, page=1))[1] == 2
    assert (await svc.list_for_user(USER, upcoming=True, page=2))[0] == []


async def test_can_change_reflects_status_and_deadline(
    engine: AsyncEngine, svc: BookingService, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    booking = (await svc.create(new(at(10), rid))).booking
    allowed, deadline = await svc.can_change(booking)
    assert allowed and deadline == at(10) - timedelta(minutes=120)
    clock.now = at(9)
    assert (await svc.can_change(booking))[0] is False
    clock.now = datetime(2030, 1, 1, tzinfo=UTC)
    cancelled = (await svc.cancel(booking.id, USER, 1)).booking
    assert (await svc.can_change(cancelled))[0] is False
