import argparse
import asyncio
import getpass
import sys
from collections.abc import Awaitable, Callable, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import create_engine, create_sessionmaker
from app.domain.errors import DomainError
from app.services.auth import create_admin, reset_admin_password
from app.services.maintenance import anonymize_expired
from app.settings import get_settings


async def _with_session[T](fn: Callable[[AsyncSession], Awaitable[T]]) -> T:
    engine = create_engine(get_settings().sqlalchemy_url)
    try:
        async with create_sessionmaker(engine)() as session:
            return await fn(session)
    finally:
        await engine.dispose()


async def _anonymize_expired() -> int:
    retention_days = get_settings().lead_retention_days

    async def run(session: AsyncSession) -> int:
        async with session.begin():
            return await anonymize_expired(session, retention_days)

    return await _with_session(run)


def _read_password() -> str:
    """Пароль вводится интерактивно; для автоматизации — первой строкой stdin (--stdin)."""
    first = getpass.getpass("Пароль (минимум 12 символов): ")
    if first != getpass.getpass("Повторите пароль: "):
        raise SystemExit("Пароли не совпадают")
    return first


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("anonymize-expired", help="обезличить заявки старше LEAD_RETENTION_DAYS")
    for name, help_text in (
        ("create-admin", "создать администратора"),
        ("reset-password", "сбросить пароль администратора и отозвать его сессии"),
    ):
        p = sub.add_parser(name, help=help_text)
        p.add_argument("--email", required=True)
        p.add_argument(
            "--stdin", action="store_true", help="прочитать пароль из первой строки stdin"
        )
    args = parser.parse_args(argv)

    if args.command == "anonymize-expired":
        print(f"anonymized: {asyncio.run(_anonymize_expired())}")
        return 0

    password = sys.stdin.readline().rstrip("\r\n") if args.stdin else _read_password()

    async def run(session: AsyncSession) -> None:
        if args.command == "create-admin":
            await create_admin(session, args.email, password)
        else:
            await reset_admin_password(session, args.email, password)

    try:
        asyncio.run(_with_session(run))
    except DomainError as exc:
        print(f"error: {exc.detail}", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
