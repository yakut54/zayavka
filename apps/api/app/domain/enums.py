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
    MAX_USER = "max_user"
    LOG = "log"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BookingStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED_BY_CLIENT = "cancelled_by_client"
    CANCELLED_BY_BUSINESS = "cancelled_by_business"
    COMPLETED = "completed"
    NO_SHOW = "no_show"
    RESCHEDULED = "rescheduled"


class BookingEventType(StrEnum):
    CREATED = "created"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"
    STATUS_CHANGED = "status_changed"
    NOTE_ADDED = "note_added"


class BookingActor(StrEnum):
    CLIENT = "client"
    ADMIN = "admin"
    SYSTEM = "system"
