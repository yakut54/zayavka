import json
from pathlib import Path

import pytest

from app.catalog import load_catalog

SERVICES_JSON = Path(__file__).parents[2] / "services.json"


def write(path: Path, data: object) -> Path:
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_committed_catalog_has_bookable_services() -> None:
    catalog = load_catalog(SERVICES_JSON)
    assert set(catalog) == {"diagnostics", "maintenance", "brakes", "tires"}
    diagnostics = catalog["diagnostics"]
    assert diagnostics.bookable is True
    assert diagnostics.duration_min == 60
    assert diagnostics.buffer_min == 15
    assert diagnostics.title == "Компьютерная диагностика"
    assert diagnostics.price_from == 1500


def test_not_bookable_service_has_no_duration(tmp_path: Path) -> None:
    item = {"slug": "consult", "title": "Консультация", "bookable": False, "durationMin": 30}
    service = load_catalog(write(tmp_path / "s.json", {"services": [item]}))["consult"]
    assert (service.bookable, service.duration_min, service.buffer_min) == (False, None, 0)


def test_missing_flag_means_not_bookable(tmp_path: Path) -> None:
    catalog = load_catalog(write(tmp_path / "s.json", {"services": [{"slug": "a", "title": "A"}]}))
    assert catalog["a"].bookable is False


def test_legacy_catalog_without_services_key_is_empty(tmp_path: Path) -> None:
    assert load_catalog(write(tmp_path / "s.json", {"slugs": ["a"]})) == {}


@pytest.mark.parametrize("field", ["slug", "title"])
def test_required_fields(tmp_path: Path, field: str) -> None:
    item = {"slug": "a", "title": "A"}
    del item[field]
    with pytest.raises(KeyError):
        load_catalog(write(tmp_path / "s.json", {"services": [item]}))
