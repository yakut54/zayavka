import pytest

from app.domain.errors import CsrfFailed
from app.security.csrf import verify_csrf
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.sessions import AdminIdentity, hash_token, tokens_match
from app.settings import Settings


def test_hash_is_argon2id_and_verifies() -> None:
    h = hash_password("correct-horse-battery")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "correct-horse-battery")
    assert not verify_password(h, "wrong")
    assert not needs_rehash(h)


def test_verify_handles_garbage_hash() -> None:
    assert verify_password("not-a-hash", "x") is False


def test_token_hash_roundtrip() -> None:
    assert tokens_match("abc", hash_token("abc"))
    assert not tokens_match("abd", hash_token("abc"))


@pytest.mark.parametrize(
    ("header", "cookie"), [(None, "t"), ("t", None), ("", ""), ("t", "u"), ("x", "x")]
)
def test_csrf_rejects(header: str | None, cookie: str | None) -> None:
    identity = AdminIdentity(None, "a@b.ru", None, hash_token("t"))  # type: ignore[arg-type]
    with pytest.raises(CsrfFailed):
        verify_csrf(identity, header, cookie)


def test_csrf_accepts_match() -> None:
    identity = AdminIdentity(None, "a@b.ru", None, hash_token("t"))  # type: ignore[arg-type]
    verify_csrf(identity, "t", "t")


def test_cookie_names_by_env() -> None:
    from tests.unit.test_settings import PROD_SMTP, build

    dev = build()
    assert (dev.session_cookie_name, dev.csrf_cookie_name, dev.secure_cookies) == (
        "session",
        "csrf",
        False,
    )
    prod: Settings = build(app_env="prod", **PROD_SMTP)
    assert (prod.session_cookie_name, prod.csrf_cookie_name, prod.secure_cookies) == (
        "__Host-session",
        "__Host-csrf",
        True,
    )
