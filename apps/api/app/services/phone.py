import phonenumbers


def normalize_phone(raw: str) -> str | None:
    """Приводит номер к E.164 (регион по умолчанию — RU). Невалидный номер → None."""
    try:
        parsed = phonenumbers.parse(raw, "RU")
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_valid_number(parsed):
        return None
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
