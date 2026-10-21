import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

T0 = datetime(2030, 1, 7, 10, 0, tzinfo=UTC)


async def make_resource(conn: AsyncConnection) -> uuid.UUID:
    row = await conn.execute(text("INSERT INTO resources (name) VALUES ('Мастер') RETURNING id"))
    return row.scalar_one()


async def make_consent(conn: AsyncConnection) -> uuid.UUID:
    row = await conn.execute(
        text(
            "INSERT INTO consents (policy_version, consent_text_sha256, ip_hash, user_agent)"
            " VALUES ('v', '\\x00', '\\x00', 'ua') RETURNING id"
        )
    )
    return row.scalar_one()


INSERT_BOOKING = text(
    "INSERT INTO bookings (resource_id, service_slug, service_title_snapshot, duration_min,"
    " buffer_min, starts_at, ends_at, blocked, status, client_name, client_phone_e164,"
    " phone_source, source, consent_id, max_user_id, idempotency_key)"
    " VALUES (:resource_id, 'tires', 'Шиномонтаж', :duration, :buffer, :starts, :ends,"
    " tstzrange(:starts, :blocked_end, '[)'), :status,"
    " :name, :phone, :phone_source, :source, :consent_id, :max_user_id, :key)"
    " RETURNING id"
)


async def make_booking(
    conn: AsyncConnection,
    resource_id: uuid.UUID,
    *,
    start: datetime = T0,
    duration: int = 60,
    buffer: int = 15,
    consent_id: uuid.UUID | None = None,
    **overrides: object,
) -> uuid.UUID:
    params: dict[str, object] = {
        "resource_id": resource_id,
        "duration": duration,
        "buffer": buffer,
        "starts": start,
        "ends": start + timedelta(minutes=duration),
        "blocked_end": start + timedelta(minutes=duration + buffer),
        "status": "confirmed",
        "name": "Иван",
        "phone": "+79991234567",
        "phone_source": "max_contact",
        "source": "max",
        "consent_id": consent_id,
        "max_user_id": None,
        "key": None,
    }
    params.update(overrides)
    return (await conn.execute(INSERT_BOOKING, params)).scalar_one()


async def test_default_settings_row_exists(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        row = (await conn.execute(text("SELECT * FROM booking_settings"))).one()
    assert (row.id, row.slot_step_min, row.min_lead_min, row.horizon_days) == (1, 15, 60, 30)
    assert (row.cancel_deadline_min, row.reminders_enabled, row.version) == (120, True, 1)


async def test_settings_allow_only_one_row(engine: AsyncEngine) -> None:
    with pytest.raises(IntegrityError, match="ck_booking_settings_single_row"):
        async with engine.begin() as conn:
            await conn.execute(text("INSERT INTO booking_settings (id) VALUES (2)"))


@pytest.mark.parametrize(
    ("column", "value", "constraint"),
    [
        ("slot_step_min", 7, "slot_step_values"),
        ("min_lead_min", 10081, "min_lead_range"),
        ("horizon_days", 0, "horizon_range"),
        ("horizon_days", 91, "horizon_range"),
        ("cancel_deadline_min", -1, "cancel_deadline_range"),
    ],
)
async def test_settings_ranges(
    engine: AsyncEngine, column: str, value: int, constraint: str
) -> None:
    with pytest.raises(IntegrityError, match=f"ck_booking_settings_{constraint}"):
        async with engine.begin() as conn:
            await conn.execute(text(f"UPDATE booking_settings SET {column} = :v"), {"v": value})


async def test_working_hours_overlap_is_rejected(engine: AsyncEngine) -> None:
    insert = text(
        "INSERT INTO working_hours (resource_id, weekday, start_min, end_min)"
        " VALUES (:r, :d, :s, :e)"
    )
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        await conn.execute(insert, {"r": rid, "d": 1, "s": 540, "e": 780})
        # соседний интервал (перерыв на обед) и тот же интервал в другой день — допустимы
        await conn.execute(insert, {"r": rid, "d": 1, "s": 780, "e": 1080})
        await conn.execute(insert, {"r": rid, "d": 2, "s": 540, "e": 780})
    with pytest.raises(DBAPIError, match="ex_working_hours_no_overlap"):
        async with engine.begin() as conn:
            await conn.execute(insert, {"r": rid, "d": 1, "s": 700, "e": 800})


@pytest.mark.parametrize(
    ("weekday", "start", "end", "constraint"),
    [
        (0, 0, 60, "weekday_range"),
        (8, 0, 60, "weekday_range"),
        (1, -1, 60, "start_range"),
        (1, 0, 1441, "end_range"),
        (1, 600, 600, "interval_order"),
        (1, 600, 500, "interval_order"),
    ],
)
async def test_working_hours_ranges(
    engine: AsyncEngine, weekday: int, start: int, end: int, constraint: str
) -> None:
    with pytest.raises(IntegrityError, match=f"ck_working_hours_{constraint}"):
        async with engine.begin() as conn:
            rid = await make_resource(conn)
            await conn.execute(
                text(
                    "INSERT INTO working_hours (resource_id, weekday, start_min, end_min)"
                    " VALUES (:r, :d, :s, :e)"
                ),
                {"r": rid, "d": weekday, "s": start, "e": end},
            )


async def test_schedule_exception_unique_per_day_and_valid_kind(engine: AsyncEngine) -> None:
    insert = text(
        "INSERT INTO schedule_exceptions (resource_id, date, kind) VALUES (:r, '2030-01-07', :k)"
    )
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        await conn.execute(insert, {"r": rid, "k": "day_off"})
    with pytest.raises(IntegrityError, match="uq_schedule_exceptions_resource_id_date"):
        async with engine.begin() as conn:
            await conn.execute(insert, {"r": rid, "k": "day_off"})
    with pytest.raises(IntegrityError, match="ck_schedule_exceptions_kind_values"):
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO schedule_exceptions (resource_id, date, kind)"
                    " VALUES (:r, '2030-01-08', 'holiday')"
                ),
                {"r": rid},
            )
    with pytest.raises(IntegrityError, match="ck_schedule_exceptions_intervals_array"):
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO schedule_exceptions (resource_id, date, kind, intervals)"
                    " VALUES (:r, '2030-01-09', 'custom_hours', '{}'::jsonb)"
                ),
                {"r": rid},
            )


async def test_resource_services_cascade_with_resource(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        await conn.execute(
            text("INSERT INTO resource_services (resource_id, service_slug) VALUES (:r, 'tires')"),
            {"r": rid},
        )
        await conn.execute(text("DELETE FROM resources WHERE id = :r"), {"r": rid})
        left = (await conn.execute(text("SELECT count(*) FROM resource_services"))).scalar_one()
    assert left == 0


async def test_booking_gets_public_number_and_uuid7(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        first = await make_booking(conn, rid, consent_id=consent)
        second = await make_booking(conn, rid, start=T0 + timedelta(hours=3), consent_id=consent)
        numbers = (
            (await conn.execute(text("SELECT public_number FROM bookings ORDER BY public_number")))
            .scalars()
            .all()
        )
    assert first.version == 7 and second.version == 7
    assert numbers == [1, 2]


async def test_overlap_of_confirmed_bookings_is_rejected_by_database(
    engine: AsyncEngine,
) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        await make_booking(conn, rid, consent_id=consent)  # 10:00–11:00, занято до 11:15
    with pytest.raises(DBAPIError, match="ex_bookings_no_overlap") as info:
        async with engine.begin() as conn:
            await make_booking(conn, rid, start=T0 + timedelta(minutes=30), consent_id=consent)
    assert getattr(info.value.orig, "sqlstate", None) == "23P01"


async def test_buffer_blocks_the_next_booking(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        await make_booking(conn, rid, consent_id=consent)
    with pytest.raises(DBAPIError, match="ex_bookings_no_overlap"):
        async with engine.begin() as conn:  # 11:00 — ещё внутри буфера до 11:15
            await make_booking(conn, rid, start=T0 + timedelta(hours=1), consent_id=consent)
    async with engine.begin() as conn:  # 11:15 — граница полуинтервала свободна
        await make_booking(conn, rid, start=T0 + timedelta(minutes=75), consent_id=consent)


async def test_overlap_allowed_for_other_resource_and_cancelled_status(
    engine: AsyncEngine,
) -> None:
    async with engine.begin() as conn:
        first, second = await make_resource(conn), await make_resource(conn)
        consent = await make_consent(conn)
        await make_booking(conn, first, consent_id=consent)
        await make_booking(conn, second, consent_id=consent)
        await make_booking(conn, first, consent_id=consent, status="cancelled_by_client")
        await make_booking(conn, first, consent_id=consent, status="completed")


async def test_cancelled_booking_frees_the_slot(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        booking = await make_booking(conn, rid, consent_id=consent)
        await conn.execute(
            text("UPDATE bookings SET status = 'cancelled_by_client' WHERE id = :i"),
            {"i": booking},
        )
        await make_booking(conn, rid, consent_id=consent)


async def test_returning_to_confirmed_is_checked_too(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        old = await make_booking(conn, rid, consent_id=consent, status="cancelled_by_client")
        await make_booking(conn, rid, consent_id=consent)
    with pytest.raises(DBAPIError, match="ex_bookings_no_overlap"):
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE bookings SET status = 'confirmed' WHERE id = :i"), {"i": old}
            )


async def test_booking_requires_consent_unless_admin(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        await make_booking(conn, rid, source="admin", phone_source="admin", consent_id=None)
    with pytest.raises(IntegrityError, match="ck_bookings_consent_required"):
        async with engine.begin() as conn:
            await make_booking(conn, rid, start=T0 + timedelta(days=1), consent_id=None)


async def test_blocked_must_start_at_starts_at(engine: AsyncEngine) -> None:
    with pytest.raises(IntegrityError, match="ck_bookings_blocked_matches"):
        async with engine.begin() as conn:
            rid = await make_resource(conn)
            consent = await make_consent(conn)
            await conn.execute(
                text(
                    "INSERT INTO bookings (resource_id, service_slug, service_title_snapshot,"
                    " duration_min, buffer_min, starts_at, ends_at, blocked, client_name,"
                    " client_phone_e164, phone_source, source, consent_id)"
                    " VALUES (:r, 's', 'S', 60, 0, :a, :b, tstzrange(:c, :b), 'Иван',"
                    " '+79991234567', 'manual', 'max', :k)"
                ),
                {
                    "r": rid,
                    "a": T0,
                    "b": T0 + timedelta(hours=1),
                    "c": T0 + timedelta(minutes=5),
                    "k": consent,
                },
            )


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"phone": "89991234567"}, "ck_bookings_phone_format"),
        ({"name": "И"}, "ck_bookings_name_len"),
        ({"phone_source": "sms"}, "ck_bookings_phone_source_values"),
        ({"source": "site"}, "ck_bookings_source_values"),
    ],
)
async def test_booking_field_checks(
    engine: AsyncEngine, overrides: dict[str, object], constraint: str
) -> None:
    with pytest.raises(IntegrityError, match=constraint):
        async with engine.begin() as conn:
            rid = await make_resource(conn)
            consent = await make_consent(conn)
            await make_booking(conn, rid, consent_id=consent, **overrides)


async def test_time_order_is_checked(engine: AsyncEngine) -> None:
    with pytest.raises(IntegrityError, match="ck_bookings_time_order"):
        async with engine.begin() as conn:
            rid = await make_resource(conn)
            consent = await make_consent(conn)
            await make_booking(conn, rid, consent_id=consent, duration=-30, buffer=60)


async def test_idempotency_key_is_unique_per_user(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        await make_booking(conn, rid, consent_id=consent, max_user_id=1, key="k")
        # другой пользователь с тем же ключом и тот же пользователь без ключа — допустимы
        await make_booking(
            conn, rid, start=T0 + timedelta(hours=3), consent_id=consent, max_user_id=2, key="k"
        )
        await make_booking(
            conn, rid, start=T0 + timedelta(hours=6), consent_id=consent, max_user_id=1
        )
    with pytest.raises(IntegrityError, match="ix_bookings_max_user_id_idempotency_key"):
        async with engine.begin() as conn:
            await make_booking(
                conn,
                rid,
                start=T0 + timedelta(hours=9),
                consent_id=consent,
                max_user_id=1,
                key="k",
            )


async def test_booking_events_are_deleted_with_booking_and_validated(
    engine: AsyncEngine,
) -> None:
    insert = text(
        "INSERT INTO booking_events (booking_id, actor, type, payload)"
        " VALUES (:b, :a, :t, '{}'::jsonb)"
    )
    async with engine.begin() as conn:
        rid = await make_resource(conn)
        consent = await make_consent(conn)
        booking = await make_booking(conn, rid, consent_id=consent)
        await conn.execute(insert, {"b": booking, "a": "client", "t": "created"})
        await conn.execute(text("DELETE FROM bookings WHERE id = :b"), {"b": booking})
        left = (await conn.execute(text("SELECT count(*) FROM booking_events"))).scalar_one()
    assert left == 0
    async with engine.begin() as conn:
        booking = await make_booking(conn, rid, consent_id=consent)
    with pytest.raises(IntegrityError, match="ck_booking_events_actor_values"):
        async with engine.begin() as conn:
            await conn.execute(insert, {"b": booking, "a": "robot", "t": "created"})
    with pytest.raises(IntegrityError, match="ck_booking_events_type_values"):
        async with engine.begin() as conn:
            await conn.execute(insert, {"b": booking, "a": "system", "t": "deleted"})


async def test_max_updates_deduplicates_by_hash(engine: AsyncEngine) -> None:
    insert = text("INSERT INTO max_updates (body_sha256) VALUES (:h)")
    async with engine.begin() as conn:
        await conn.execute(insert, {"h": b"\x01" * 32})
    with pytest.raises(IntegrityError, match="pk_max_updates"):
        async with engine.begin() as conn:
            await conn.execute(insert, {"h": b"\x01" * 32})
