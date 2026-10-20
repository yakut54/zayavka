import asyncio
import contextlib
import signal
import time
from dataclasses import asdict

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db import create_engine, create_sessionmaker
from app.logging import configure_logging, get_logger
from app.notifications import build_channels
from app.notifications.base import Channel
from app.services.maintenance import MaintenanceResult, run_maintenance
from app.services.notifications import load_service_titles, process_batch
from app.settings import Settings, get_settings

IDLE_SLEEP_S = 2.0
MAINTENANCE_EVERY_S = 3600.0


async def run_worker(
    settings: Settings,
    stop: asyncio.Event,
    *,
    sessionmaker: async_sessionmaker[AsyncSession] | None = None,
    channels: dict[str, Channel] | None = None,
    idle_sleep_s: float = IDLE_SLEEP_S,
) -> None:
    """Цикл обработки outbox. По stop дорабатывает текущую пачку и выходит."""
    engine = None
    if sessionmaker is None:
        engine = create_engine(settings.sqlalchemy_url)
        sessionmaker = create_sessionmaker(engine)
    channels = channels if channels is not None else build_channels(settings)
    try:
        titles = load_service_titles(settings.services_file)
    except OSError:
        titles = {}
    log = get_logger()
    log.info("worker_started", channels=sorted(channels))
    last_maintenance = float("-inf")
    try:
        while not stop.is_set():
            if time.monotonic() - last_maintenance >= MAINTENANCE_EVERY_S:
                last_maintenance = time.monotonic()
                try:
                    async with sessionmaker() as session:
                        result = await run_maintenance(session, settings.lead_retention_days)
                    log.info("maintenance_done", **vars_of(result))
                except Exception:
                    log.exception("maintenance_failed")
            processed = 0
            try:
                async with sessionmaker() as session:
                    processed = await process_batch(session, channels, titles)
            except Exception:
                log.exception("batch_failed")
            if processed == 0:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=idle_sleep_s)
    finally:
        if engine is not None:
            await engine.dispose()
        log.info("worker_stopped")


def vars_of(result: MaintenanceResult) -> dict[str, int]:
    return asdict(result)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    await run_worker(settings, stop)


if __name__ == "__main__":
    asyncio.run(main())
