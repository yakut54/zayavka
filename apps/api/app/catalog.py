import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class CatalogService:
    """Услуга из каталога (services.json генерируется при сборке сайта)."""

    slug: str
    title: str
    price_from: int | None
    bookable: bool
    duration_min: int | None
    buffer_min: int


def load_catalog(path: Path) -> dict[str, CatalogService]:
    data = json.loads(path.read_text(encoding="utf-8"))
    catalog: dict[str, CatalogService] = {}
    for item in data.get("services", []):
        bookable = bool(item.get("bookable", False))
        catalog[item["slug"]] = CatalogService(
            slug=item["slug"],
            title=item["title"],
            price_from=item.get("priceFrom"),
            bookable=bookable,
            duration_min=item.get("durationMin") if bookable else None,
            buffer_min=int(item.get("bufferMin", 0)) if bookable else 0,
        )
    return catalog


@dataclass(frozen=True, slots=True)
class Business:
    """Сведения о бизнесе из конфига сайта (попадают в services.json при сборке)."""

    name: str
    phone: str
    address: str
    working_hours: str
    timezone: str
    site_url: str
    policy_version: str
    support: str
    operator: str


def load_business(path: Path) -> Business:
    raw = json.loads(path.read_text(encoding="utf-8"))["business"]
    return Business(
        name=raw["name"],
        phone=raw["phone"],
        address=raw["address"],
        working_hours=raw["workingHours"],
        timezone=raw["timezone"],
        site_url=raw["siteUrl"],
        policy_version=raw["policyVersion"],
        support=raw["support"],
        operator=raw["operator"],
    )
