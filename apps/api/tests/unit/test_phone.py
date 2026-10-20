import pytest

from app.services.phone import normalize_phone


@pytest.mark.parametrize(
    "raw",
    [
        "+7 (912) 345-67-89",
        "8 912 345 67 89",
        "89123456789",
        "9123456789",
        "+79123456789",
        "8(912)345-67-89",
        "7 912 345 6789",
    ],
)
def test_normalizes_to_e164(raw: str) -> None:
    assert normalize_phone(raw) == "+79123456789"


@pytest.mark.parametrize("raw", ["", "abc", "123", "+7 000", "+7 (000) 000-00-00", "8 800"])
def test_invalid_returns_none(raw: str) -> None:
    assert normalize_phone(raw) is None


def test_foreign_number_with_plus() -> None:
    assert normalize_phone("+44 20 7946 0958") == "+442079460958"
