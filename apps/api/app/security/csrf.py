from app.domain.errors import CsrfFailed
from app.security.sessions import AdminIdentity, tokens_match


def verify_csrf(
    identity: AdminIdentity, header_token: str | None, cookie_token: str | None
) -> None:
    """Double submit: заголовок == cookie, и оба соответствуют хешу в сессии."""
    if not header_token or not cookie_token:
        raise CsrfFailed
    if header_token != cookie_token or not tokens_match(header_token, identity.csrf_token_hash):
        raise CsrfFailed
