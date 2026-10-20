import argparse
import asyncio
from collections.abc import Sequence

from app.db import create_engine, create_sessionmaker
from app.services.maintenance import anonymize_expired
from app.settings import get_settings


async def _anonymize_expired() -> int:
    settings = get_settings()
    engine = create_engine(settings.sqlalchemy_url)
    try:
        async with create_sessionmaker(engine)() as session, session.begin():
            return await anonymize_expired(session, settings.lead_retention_days)
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("anonymize-expired", help="обезличить заявки старше LEAD_RETENTION_DAYS")
    args = parser.parse_args(argv)
    if args.command == "anonymize-expired":
        count = asyncio.run(_anonymize_expired())
        print(f"anonymized: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
