import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import pytest

from app.domain.errors import MaxInitDataExpired, MaxInitDataInvalid
from app.max import init_data
from app.max.contact import contact_message, sign_contact, verify_contact
from app.max.init_data import MaxUser

TOKEN = "100500:TEST-TOKEN"
NOW = datetime(2030, 1, 7, 12, 0, tzinfo=UTC)
TTL = timedelta(hours=24)


def fields(**overrides: str) -> dict[str, str]:
    user = {"id": 4242, "first_name": "Анна", "last_name": "Иванова"}
    base = {
        "auth_date": str(int(NOW.timestamp()) - 60),
        "query_id": "AAH-test_query",
        "user": json.dumps(user, ensure_ascii=False, separators=(",", ":")),
    }
    return {**base, **overrides}


def verify(raw: str, token: str = TOKEN, now: datetime = NOW) -> MaxUser:
    return init_data.verify(raw, token, now=now, ttl=TTL)


def test_vector_matches_independent_computation() -> None:
    """Подпись пересчитана напрямую из §2.4, без кода проекта."""
    data = fields()
    launch = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    signature = hmac.new(secret, launch.encode(), hashlib.sha256).hexdigest()
    raw = "&".join(f"{k}={quote(v, safe='')}" for k, v in data.items()) + f"&hash={signature}"
    assert verify(raw) == MaxUser(id=4242, first_name="Анна")
    assert init_data.sign(data, TOKEN) == "&".join(
        [f"{k}={quote(v, safe='')}" for k, v in data.items()] + [f"hash={signature}"]
    )


def test_valid_signature_is_accepted_whatever_the_field_order() -> None:
    raw = init_data.sign(fields(), TOKEN)
    pairs = raw.split("&")
    assert verify("&".join(reversed(pairs))).id == 4242


def test_changed_value_is_rejected() -> None:
    raw = init_data.sign(fields(), TOKEN)
    tampered = raw.replace("query_id=AAH-test_query", "query_id=AAH-other")
    with pytest.raises(MaxInitDataInvalid):
        verify(tampered)


def test_changed_user_is_rejected() -> None:
    other = json.dumps({"id": 1, "first_name": "Вор"}, separators=(",", ":"))
    raw = init_data.sign(fields(), TOKEN)
    user_pair = next(p for p in raw.split("&") if p.startswith("user="))
    with pytest.raises(MaxInitDataInvalid):
        verify(raw.replace(user_pair, f"user={quote(other, safe='')}"))


def test_missing_hash_is_rejected() -> None:
    raw = "&".join(
        p for p in init_data.sign(fields(), TOKEN).split("&") if not p.startswith("hash=")
    )
    with pytest.raises(MaxInitDataInvalid):
        verify(raw)


def test_empty_hash_is_rejected() -> None:
    with pytest.raises(MaxInitDataInvalid):
        verify(init_data.sign(fields(), TOKEN).rsplit("hash=", 1)[0] + "hash=")


def test_two_hashes_are_rejected() -> None:
    raw = init_data.sign(fields(), TOKEN)
    with pytest.raises(MaxInitDataInvalid):
        verify(raw + "&" + raw.split("&")[-1])


@pytest.mark.parametrize("key", ["auth_date", "query_id", "user"])
def test_duplicate_of_any_key_is_rejected(key: str) -> None:
    raw = init_data.sign(fields(), TOKEN)
    pair = next(p for p in raw.split("&") if p.startswith(f"{key}="))
    with pytest.raises(MaxInitDataInvalid):
        verify(f"{raw}&{pair}")


@pytest.mark.parametrize("raw", ["", "garbage", "a=1&&b=2", "=x&hash=abc", "a&hash=abc"])
def test_malformed_strings_are_rejected(raw: str) -> None:
    with pytest.raises(MaxInitDataInvalid):
        verify(raw)


def test_plus_is_not_turned_into_space() -> None:
    data = fields(query_id="a+b c")
    raw = init_data.sign(data, TOKEN)
    assert "a%2Bb%20c" in raw
    verify(raw)
    # литеральный «+» в сыром значении декодируется как «+», а не как пробел
    literal_plus = raw.replace("a%2Bb%20c", "a+b%20c")
    verify(literal_plus)
    as_space = raw.replace("a%2Bb%20c", "a%20b%20c")
    with pytest.raises(MaxInitDataInvalid):
        verify(as_space)


def test_value_containing_equals_sign() -> None:
    raw = init_data.sign(fields(start_param="a=b=c"), TOKEN)
    assert verify(raw).id == 4242


def test_expired_auth_date() -> None:
    old = fields(auth_date=str(int((NOW - timedelta(hours=24, seconds=1)).timestamp())))
    with pytest.raises(MaxInitDataExpired):
        verify(init_data.sign(old, TOKEN))
    edge = fields(auth_date=str(int((NOW - timedelta(hours=24)).timestamp())))
    assert verify(init_data.sign(edge, TOKEN)).id == 4242


def test_auth_date_from_the_future_is_rejected() -> None:
    future = fields(auth_date=str(int((NOW + timedelta(hours=1)).timestamp())))
    with pytest.raises(MaxInitDataInvalid):
        verify(init_data.sign(future, TOKEN))


def test_signature_by_another_token_is_rejected() -> None:
    with pytest.raises(MaxInitDataInvalid):
        verify(init_data.sign(fields(), "999:OTHER"))


def test_expired_data_with_wrong_signature_is_invalid_not_expired() -> None:
    old = fields(auth_date=str(int((NOW - timedelta(days=3)).timestamp())))
    with pytest.raises(MaxInitDataInvalid):
        verify(init_data.sign(old, "999:OTHER"))


@pytest.mark.parametrize(
    "overrides",
    [
        {"user": "not-json"},
        {"user": '{"first_name":"Без id"}'},
        {"user": '{"id":"abc"}'},
        {"user": "[1,2]"},
        {"auth_date": "yesterday"},
    ],
)
def test_signed_but_unusable_payload_is_invalid(overrides: dict[str, str]) -> None:
    with pytest.raises(MaxInitDataInvalid):
        verify(init_data.sign(fields(**overrides), TOKEN))


def test_missing_user_or_auth_date_is_invalid() -> None:
    for key in ("user", "auth_date"):
        data = fields()
        del data[key]
        with pytest.raises(MaxInitDataInvalid):
            verify(init_data.sign(data, TOKEN))


def test_non_ascii_hash_does_not_crash() -> None:
    with pytest.raises(MaxInitDataInvalid):
        verify("auth_date=1&user=%7B%7D&hash=%D0%B6")


def test_user_without_first_name_is_allowed() -> None:
    data = fields(user='{"id":7}')
    assert verify(init_data.sign(data, TOKEN)) == MaxUser(id=7, first_name="")


# ---------- requestContact ----------


def test_contact_message_follows_documentation() -> None:
    assert contact_message("+79991234567", "1700000000", 42) == (
        "authDate=1700000000\nphone=79991234567\nuserId=42"
    )


def test_contact_signature_roundtrip_and_independent_check() -> None:
    signature = sign_contact("+79991234567", "1700000000", 42, TOKEN)
    expected = hmac.new(
        TOKEN.encode(),
        b"authDate=1700000000\nphone=79991234567\nuserId=42",
        hashlib.sha256,
    ).hexdigest()
    assert signature == expected
    assert verify_contact("79991234567", "1700000000", signature, 42, TOKEN)
    assert verify_contact("+79991234567", "1700000000", signature.upper(), 42, TOKEN)


@pytest.mark.parametrize(
    ("phone", "auth_date", "user_id", "token"),
    [
        ("79990000000", "1700000000", 42, TOKEN),
        ("79991234567", "1700000001", 42, TOKEN),
        ("79991234567", "1700000000", 43, TOKEN),
        ("79991234567", "1700000000", 42, "999:OTHER"),
    ],
)
def test_contact_with_changed_data_is_rejected(
    phone: str, auth_date: str, user_id: int, token: str
) -> None:
    signature = sign_contact("79991234567", "1700000000", 42, TOKEN)
    assert not verify_contact(phone, auth_date, signature, user_id, token)


def test_contact_garbage_signature_is_rejected() -> None:
    assert not verify_contact("79991234567", "1700000000", "", 42, TOKEN)
    assert not verify_contact("79991234567", "1700000000", "zzzz", 42, TOKEN)
