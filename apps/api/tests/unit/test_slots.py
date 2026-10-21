from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.booking.slots import (
    Interval,
    SlotQuery,
    UtcInterval,
    at_minute,
    day_intervals,
    free_slots,
    merge_by_resource,
)

NSK = ZoneInfo("Asia/Novosibirsk")  # UTC+7
DAY = date(2030, 1, 7)  # понедельник
LONG_AGO = datetime(2029, 1, 1, tzinfo=UTC)
FAR_FUTURE = datetime(2031, 1, 1, tzinfo=UTC)


def hm(hours: int, minutes: int = 0) -> int:
    return hours * 60 + minutes


def query(**overrides: object) -> SlotQuery:
    values: dict[str, object] = {
        "day": DAY,
        "tz": NSK,
        "now": LONG_AGO,
        "duration": timedelta(minutes=60),
        "buffer": timedelta(minutes=15),
        "step": timedelta(minutes=15),
        "min_lead": timedelta(0),
        "horizon_end": FAR_FUTURE,
    }
    values.update(overrides)
    return SlotQuery(**values)  # type: ignore[arg-type]


def local(hours: int, minutes: int = 0, *, day: date = DAY, tz: ZoneInfo = NSK) -> datetime:
    return datetime(day.year, day.month, day.day, hours, minutes, tzinfo=tz).astimezone(UTC)


def local_times(slots: list[datetime], tz: ZoneInfo = NSK) -> list[str]:
    return [s.astimezone(tz).strftime("%H:%M") for s in slots]


def test_regular_day_last_slot_leaves_room_for_buffer() -> None:
    slots = free_slots(query(), [(hm(10), hm(13))], [])
    # 60 мин + буфер 15: последний старт 11:45 (заканчивается 12:45, занято до 13:00)
    assert local_times(slots) == [
        "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "11:45",
    ]  # fmt: skip
    assert all(s.tzinfo is not None and s.utcoffset() == timedelta(0) for s in slots)


def test_lunch_break_splits_the_day() -> None:
    slots = free_slots(
        query(duration=timedelta(minutes=60), buffer=timedelta(0), step=timedelta(minutes=30)),
        [(hm(9), hm(12)), (hm(13), hm(15))],
        [],
    )
    assert local_times(slots) == [
        "09:00",
        "09:30",
        "10:00",
        "10:30",
        "11:00",
        "13:00",
        "13:30",
        "14:00",
    ]


def test_interval_shorter_than_service_gives_nothing() -> None:
    assert free_slots(query(), [(hm(10), hm(11))], []) == []


def test_interval_exactly_fits_service_with_buffer() -> None:
    slots = free_slots(query(), [(hm(10), hm(11, 15))], [])
    assert local_times(slots) == ["10:00"]


def test_buffer_does_not_fit_at_end_of_day() -> None:
    slots = free_slots(query(), [(hm(10), hm(11, 10))], [])
    assert slots == []


def test_booking_flush_against_another() -> None:
    busy: list[UtcInterval] = [(local(10), local(11))]
    q = query(duration=timedelta(minutes=30), buffer=timedelta(0))
    times = local_times(free_slots(q, [(hm(9), hm(12))], busy))
    assert "09:30" in times  # заканчивается ровно в начале занятого
    assert "09:45" not in times
    assert "11:00" in times  # начинается ровно в конце занятого
    assert "10:45" not in times


def test_busy_in_the_middle_removes_overlapping_starts_only() -> None:
    busy: list[UtcInterval] = [(local(11), local(12))]
    slots = free_slots(
        query(duration=timedelta(minutes=30), buffer=timedelta(0)), [(hm(10), hm(13))], busy
    )
    times = local_times(slots)
    assert "10:30" in times  # 10:30–11:00
    assert "10:45" not in times  # заходит на занятое
    assert "11:45" not in times
    assert "12:00" in times


def test_day_off_exception_means_no_slots() -> None:
    work = day_intervals(DAY, {1: [(hm(10), hm(18))]}, "day_off")
    assert work == []
    assert free_slots(query(), work, []) == []


def test_custom_hours_replace_weekly_schedule() -> None:
    work = day_intervals(DAY, {1: [(hm(10), hm(18))]}, "custom_hours", [(hm(12), hm(14))])
    assert work == [(hm(12), hm(14))]
    assert local_times(free_slots(query(), work, []))[0] == "12:00"


def test_weekly_schedule_picks_iso_weekday() -> None:
    weekly = {1: [(hm(9), hm(10))], 7: [(hm(11), hm(12))]}
    assert day_intervals(date(2030, 1, 7), weekly) == [(hm(9), hm(10))]
    assert day_intervals(date(2030, 1, 13), weekly) == [(hm(11), hm(12))]
    assert day_intervals(date(2030, 1, 8), weekly) == []


def test_min_lead_cuts_off_the_morning() -> None:
    now = local(8, 30)
    slots = free_slots(query(now=now, min_lead=timedelta(minutes=60)), [(hm(9), hm(12))], [])
    assert local_times(slots)[0] == "09:30"  # ровно now + min_lead допустимо


def test_min_lead_in_the_past_of_the_day_keeps_everything() -> None:
    slots = free_slots(query(now=local(6), min_lead=timedelta(minutes=30)), [(hm(9), hm(11))], [])
    assert local_times(slots)[0] == "09:00"


def test_horizon_is_exclusive() -> None:
    slots = free_slots(query(horizon_end=local(10, 30)), [(hm(9), hm(13))], [])
    assert local_times(slots)[-1] == "10:15"


@pytest.mark.parametrize(
    ("step", "expected"),
    [
        (15, ["10:00", "10:15", "10:30", "10:45"]),
        (30, ["10:00", "10:30"]),
        (60, ["10:00"]),
    ],
)
def test_step_grid(step: int, expected: list[str]) -> None:
    q = query(duration=timedelta(minutes=30), buffer=timedelta(0), step=timedelta(minutes=step))
    assert local_times(free_slots(q, [(hm(10), hm(11, 15))], [])) == expected


def test_duration_not_multiple_of_step() -> None:
    q = query(
        duration=timedelta(minutes=45), buffer=timedelta(minutes=10), step=timedelta(minutes=30)
    )
    slots = free_slots(q, [(hm(10), hm(12))], [])
    # 45+10 = 55 мин: старты 10:00, 10:30, 11:00 (до 11:55), 11:30 уже не помещается
    assert local_times(slots) == ["10:00", "10:30", "11:00"]


def test_grid_is_aligned_to_work_start_not_to_free_segment() -> None:
    busy: list[UtcInterval] = [(local(10), local(10, 10))]
    q = query(duration=timedelta(minutes=30), buffer=timedelta(0), step=timedelta(minutes=30))
    # свободный отрезок начинается в 10:10, но сетка идёт от 10:00 → первый слот 10:30
    assert local_times(free_slots(q, [(hm(10), hm(12))], busy))[0] == "10:30"


def test_overlapping_work_intervals_produce_no_duplicates() -> None:
    q = query(duration=timedelta(minutes=30), buffer=timedelta(0))
    slots = free_slots(q, [(hm(10), hm(12)), (hm(11), hm(13))], [])
    assert slots == sorted(set(slots))


def test_work_until_midnight() -> None:
    q = query(duration=timedelta(minutes=60), buffer=timedelta(0), step=timedelta(minutes=60))
    slots = free_slots(q, [(hm(22), 1440)], [])
    assert local_times(slots) == ["22:00", "23:00"]


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"duration": timedelta(0)}, "positive"),
        ({"step": timedelta(0)}, "positive"),
        ({"buffer": timedelta(minutes=-1)}, "negative"),
    ],
)
def test_invalid_query_is_rejected(kwargs: dict[str, object], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        free_slots(query(**kwargs), [(hm(10), hm(12))], [])


@pytest.mark.parametrize(
    ("zone", "offset_hours"),
    [
        ("Asia/Novosibirsk", 7),
        ("Europe/Moscow", 3),
        ("Europe/Kaliningrad", 2),
        ("Asia/Vladivostok", 10),
    ],
)
def test_time_zones(zone: str, offset_hours: int) -> None:
    tz = ZoneInfo(zone)
    slots = free_slots(query(tz=tz), [(hm(9), hm(11))], [])
    assert slots[0] == datetime(2030, 1, 7, 9, tzinfo=UTC) - timedelta(hours=offset_hours)
    assert local_times(slots, tz)[0] == "09:00"


def test_day_crossing_utc_midnight_in_vladivostok() -> None:
    tz = ZoneInfo("Asia/Vladivostok")  # UTC+10: 07:00 по Владивостоку — 21:00 UTC предыдущих суток
    q = query(
        tz=tz, duration=timedelta(minutes=60), buffer=timedelta(0), step=timedelta(minutes=60)
    )
    slots = free_slots(q, [(hm(7), hm(9)), (hm(22), hm(23))], [])
    assert slots[0] == datetime(2030, 1, 6, 21, tzinfo=UTC)  # предыдущая дата в UTC
    assert slots[-1] == datetime(2030, 1, 7, 12, tzinfo=UTC)
    assert local_times(slots, tz) == ["07:00", "08:00", "22:00"]


def test_busy_interval_from_previous_utc_day_is_respected() -> None:
    tz = ZoneInfo("Asia/Vladivostok")
    busy: list[UtcInterval] = [
        (datetime(2030, 1, 6, 21, tzinfo=UTC), datetime(2030, 1, 6, 22, tzinfo=UTC))
    ]
    q = query(
        tz=tz, duration=timedelta(minutes=60), buffer=timedelta(0), step=timedelta(minutes=60)
    )
    assert local_times(free_slots(q, [(hm(7), hm(9))], busy), tz) == ["08:00"]


def test_at_minute_handles_end_of_day() -> None:
    assert at_minute(DAY, 1440, NSK) == local(0, day=date(2030, 1, 8))
    assert at_minute(DAY, 0, NSK) == local(0)
    assert at_minute(DAY, hm(13, 45), NSK) == local(13, 45)


def test_merge_by_resource_keeps_order_and_groups() -> None:
    a, b, c = local(10), local(11), local(12)
    merged = merge_by_resource({"r1": [a, b], "r2": [b, c]})
    assert list(merged) == [a, b, c]
    assert merged[b] == ["r1", "r2"]
    assert merged[a] == ["r1"]
    assert merge_by_resource({}) == {}


# ---------- генеративные тесты ----------

ZONES = [
    ZoneInfo(z)
    for z in ("Asia/Novosibirsk", "Europe/Moscow", "Europe/Kaliningrad", "Asia/Vladivostok")
]


@st.composite
def work_intervals(draw: st.DrawFn) -> list[Interval]:
    cuts = sorted(draw(st.sets(st.integers(0, 288), min_size=0, max_size=8)))
    if len(cuts) % 2:
        cuts.pop()
    return [(a * 5, b * 5) for a, b in zip(cuts[::2], cuts[1::2], strict=True)]


@st.composite
def scenarios(draw: st.DrawFn) -> tuple[SlotQuery, list[Interval], list[UtcInterval]]:
    tz = draw(st.sampled_from(ZONES))
    day = draw(st.dates(min_value=date(2030, 1, 1), max_value=date(2030, 12, 31)))
    midnight = at_minute(day, 0, tz)
    busy: list[UtcInterval] = []
    for _ in range(draw(st.integers(0, 6))):
        start = midnight + timedelta(minutes=draw(st.integers(-120, 1560)))
        busy.append((start, start + timedelta(minutes=draw(st.integers(5, 240)))))
    q = SlotQuery(
        day=day,
        tz=tz,
        now=midnight + timedelta(minutes=draw(st.integers(-3000, 1500))),
        duration=timedelta(minutes=5 * draw(st.integers(1, 48))),
        buffer=timedelta(minutes=5 * draw(st.integers(0, 12))),
        step=timedelta(minutes=draw(st.sampled_from([5, 10, 15, 20, 30, 60]))),
        min_lead=timedelta(minutes=draw(st.integers(0, 600))),
        horizon_end=midnight + timedelta(minutes=draw(st.integers(0, 3000))),
    )
    return q, draw(work_intervals()), busy


@settings(max_examples=300, deadline=None)
@given(scenarios())
def test_generated_invariants(
    scenario: tuple[SlotQuery, list[Interval], list[UtcInterval]],
) -> None:
    q, work, busy = scenario
    slots = free_slots(q, work, busy)
    span = q.duration + q.buffer
    windows = [(at_minute(q.day, a, q.tz), at_minute(q.day, b, q.tz), a) for a, b in work]

    assert slots == sorted(set(slots))
    for slot in slots:
        inside = [w for w in windows if w[0] <= slot and slot + span <= w[1]]
        assert inside, "слот с буфером должен лежать в рабочем интервале"
        assert any((slot - w[0]) % q.step == timedelta(0) for w in inside), "выравнивание по шагу"
        assert all(not (b0 < slot + span and slot < b1) for b0, b1 in busy), "пересечение с занятым"
        assert q.now + q.min_lead <= slot < q.horizon_end

    # полнота: перебор всех минут рабочих интервалов независимо от реализации
    expected: set[datetime] = set()
    step_min = int(q.step.total_seconds() // 60)
    for start_min, end_min in work:
        for minute in range(start_min, end_min):
            if (minute - start_min) % step_min:
                continue
            t = at_minute(q.day, minute, q.tz)
            if (
                t + span <= at_minute(q.day, end_min, q.tz)
                and q.now + q.min_lead <= t < q.horizon_end
                and all(not (b0 < t + span and t < b1) for b0, b1 in busy)
            ):
                expected.add(t)
    assert set(slots) == expected
