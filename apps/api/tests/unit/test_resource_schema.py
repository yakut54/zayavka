import pytest
from pydantic import ValidationError

from app.schemas.admin_booking import ResourceCreate, ResourcePatch


def test_name_is_stripped_after_length_check() -> None:
    assert ResourceCreate(name="  Иван  ", title=" Мастер ").name == "Иван"
    assert ResourceCreate(name="  Иван  ", title=" Мастер ").title == "Мастер"
    assert ResourcePatch(name=" Пётр ").name == "Пётр"


def test_leading_whitespace_does_not_hide_overlong_name() -> None:
    # \x0b срезался бы до проверки длины, и схема расходилась с OpenAPI (schemathesis ST201)
    with pytest.raises(ValidationError):
        ResourceCreate(name="\x0b" + "a" * 80)
    with pytest.raises(ValidationError):
        ResourcePatch(title="\x0b" + "a" * 80)


def test_blank_name_rejected() -> None:
    with pytest.raises(ValidationError):
        ResourceCreate(name="   ")
    with pytest.raises(ValidationError):
        ResourcePatch(name="   ")
    assert ResourcePatch(title=None).name is None
