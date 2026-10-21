"""Файл календаря (.ics, RFC 5545) для записи."""

from datetime import UTC, datetime

CRLF = "\r\n"
FOLD_LIMIT = 75


def _escape(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return escaped.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")


def _stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _fold(line: str) -> str:
    """Строки длиннее 75 октетов переносятся; продолжение начинается с пробела."""
    parts: list[str] = []
    current = ""
    for char in line:
        limit = FOLD_LIMIT if not parts else FOLD_LIMIT - 1
        if len((current + char).encode()) > limit:
            parts.append(current)
            current = char
        else:
            current += char
    parts.append(current)
    return (CRLF + " ").join(parts)


def build_ics(
    *,
    uid: str,
    title: str,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
    location: str,
    description: str,
) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//zayavka//booking//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{_stamp(created_at)}",
        f"DTSTART:{_stamp(starts_at)}",
        f"DTEND:{_stamp(ends_at)}",
        f"SUMMARY:{_escape(title)}",
        f"LOCATION:{_escape(location)}",
        f"DESCRIPTION:{_escape(description)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return CRLF.join(_fold(line) for line in lines) + CRLF
