from enum import StrEnum


class LeadStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    SPAM = "spam"
    ARCHIVED = "archived"


class LeadSource(StrEnum):
    SITE = "site"
    MAX = "max"


class LeadEventType(StrEnum):
    CREATED = "created"
    STATUS_CHANGED = "status_changed"
    NOTE_ADDED = "note_added"


class NotificationChannel(StrEnum):
    EMAIL = "email"
    MAX = "max"
    LOG = "log"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
