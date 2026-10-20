from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.errors import RateLimited

_HIT_SQL = text(
    """
    INSERT INTO rate_limits (bucket, window_start, hits)
    VALUES (:bucket, to_timestamp(floor(extract(epoch from now()) / :w) * :w), 1)
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET hits = rate_limits.hits + 1
    RETURNING hits,
      ceil(extract(epoch from window_start) + :w - extract(epoch from now()))::int AS retry_after
    """
)


def parse_limit(value: str) -> tuple[int, int]:
    """'5/600' → (5 запросов, окно 600 с)."""
    limit, window = value.split("/")
    return int(limit), int(window)


async def hit(session: AsyncSession, bucket: str, limit: int, window_s: int) -> int | None:
    """None, если лимит не превышен, иначе секунды до сброса окна."""
    row = (await session.execute(_HIT_SQL, {"bucket": bucket, "w": window_s})).one()
    return None if row.hits <= limit else max(row.retry_after, 1)


async def enforce(sessionmaker: async_sessionmaker[AsyncSession], bucket: str, rule: str) -> None:
    """Проверка в отдельной короткой транзакции: откат основной не откатывает счётчик."""
    limit, window_s = parse_limit(rule)
    async with sessionmaker() as session, session.begin():
        retry_after = await hit(session, bucket, limit, window_s)
    if retry_after is not None:
        raise RateLimited(retry_after)


async def cleanup(session: AsyncSession, older_than_s: int = 86400) -> int:
    result = await session.execute(
        text("DELETE FROM rate_limits WHERE window_start < now() - make_interval(secs => :s)"),
        {"s": older_than_s},
    )
    return int(result.rowcount)  # type: ignore[attr-defined]
