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
