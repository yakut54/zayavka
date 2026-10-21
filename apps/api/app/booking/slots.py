"""Расчёт свободного времени записи — чистые функции без обращения к БД."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

MINUTES_PER_DAY = 1440

Interval = tuple[int, int]
UtcInterval = tuple[datetime, datetime]


@dataclass(frozen=True)
class SlotQuery:
    day: date  # день в BUSINESS_TZ
    tz: ZoneInfo
    now: datetime  # aware, UTC
    duration: timedelta
    buffer: timedelta
    step: timedelta
    min_lead: timedelta
    horizon_end: datetime  # aware, UTC


def at_minute(day: date, minute: int, tz: ZoneInfo) -> datetime:
    """Момент `minute` минут от полуночи дня `day` по стенным часам `tz`, в UTC.

    1440 означает полночь следующего дня; смещение зоны подставляет zoneinfo.
    """
    extra_days, rest = divmod(minute, MINUTES_PER_DAY)
    wall = datetime.combine(day + timedelta(days=extra_days), time(rest // 60, rest % 60), tz)
    return wall.astimezone(UTC)


def day_intervals(
    day: date,
    weekly: Mapping[int, Sequence[Interval]],
    exception_kind: str | None = None,
    exception_intervals: Sequence[Interval] = (),
) -> list[Interval]:
    """Рабочие интервалы дня: исключение заменяет недельный график целиком."""
    if exception_kind == "day_off":
        return []
    if exception_kind == "custom_hours":
        return sorted(exception_intervals)
    return sorted(weekly.get(day.isoweekday(), ()))


def free_slots(
    q: SlotQuery,
    work: Sequence[Interval],
    busy: Sequence[UtcInterval],
) -> list[datetime]:
    """Времена начала записи (UTC, по возрастанию, без повторов).

    Сетка шага строится от начала рабочего интервала, а не от конца занятого времени,
    поэтому набор слотов не «плавает» от соседних записей.
    """
    if q.duration <= timedelta(0) or q.step <= timedelta(0) or q.buffer < timedelta(0):
        raise ValueError("duration and step must be positive, buffer must not be negative")
    span = q.duration + q.buffer
    earliest = q.now + q.min_lead
    slots: set[datetime] = set()
    for start_min, end_min in work:
        window_start = at_minute(q.day, start_min, q.tz)
        window_end = at_minute(q.day, end_min, q.tz)
        t = window_start
        while t + span <= window_end:
            if earliest <= t < q.horizon_end and not _overlaps(t, t + span, busy):
                slots.add(t)
            t += q.step
    return sorted(slots)


def _overlaps(start: datetime, end: datetime, busy: Iterable[UtcInterval]) -> bool:
    return any(b_start < end and start < b_end for b_start, b_end in busy)


def merge_by_resource(per_resource: Mapping[str, Sequence[datetime]]) -> dict[datetime, list[str]]:
    """«Любой специалист»: время начала → ресурсы, свободные в это время (порядок сохраняется)."""
    merged: dict[datetime, list[str]] = {}
    for resource, slots in per_resource.items():
        for slot in slots:
            merged.setdefault(slot, []).append(resource)
    return dict(sorted(merged.items()))
