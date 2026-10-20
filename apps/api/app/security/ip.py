import hashlib
import hmac

from fastapi import Request


def client_ip(request: Request) -> str:
    """IP клиента; X-Forwarded-For разбирает uvicorn (--proxy-headers) от доверенного прокси."""
    return request.client.host if request.client else "unknown"


def hash_ip(ip: str, secret_key: str) -> bytes:
    """HMAC-SHA256(ip, SECRET_KEY): открытый IP нигде не хранится."""
    return hmac.new(secret_key.encode(), ip.encode(), hashlib.sha256).digest()
