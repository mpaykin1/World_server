from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class TokenPayload:
    version: int
    issued_at: int
    expires_at: int
    subject: str
    nonce: str


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_token(token: str, secret: str, now: int | None = None) -> TokenPayload | None:
    if not token or not secret or len(secret) < 24:
        return None
    parts = token.split(".")
    if len(parts) != 2:
        return None
    payload_b64, signature = parts
    expected = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        obj = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        payload = TokenPayload(
            version=int(obj["v"]),
            issued_at=int(obj["iat"]),
            expires_at=int(obj["exp"]),
            subject=str(obj.get("sub", "anonymous")),
            nonce=str(obj.get("nonce", "")),
        )
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    now = int(time.time()) if now is None else int(now)
    if payload.version != 1 or payload.issued_at > now + 30 or payload.expires_at < now:
        return None
    return payload
