import logging
import sys

import structlog


def configure_logging(level: str = "INFO") -> None:
    """JSON-логи в stdout. Персональные данные в логи не передаются (раздел 7.8)."""
    log_level = logging.getLevelNamesMapping().get(level.upper(), logging.INFO)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="ts"),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=False,
    )


def get_logger() -> structlog.typing.FilteringBoundLogger:
    return structlog.get_logger()  # type: ignore[no-any-return]
