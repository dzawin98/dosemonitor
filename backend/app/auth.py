import os
import base64
import hmac
import hashlib
import json
from datetime import datetime, timedelta


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = 4 - (len(data) % 4)
    if pad and pad < 4:
        data = data + "=" * pad
    return base64.urlsafe_b64decode(data.encode("ascii"))


def hash_password(password: str, salt: bytes | None = None, iterations: int = 200000) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algo, iter_str, salt_hex, dk_hex = password_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
        salt = bytes.fromhex(salt_hex)
        dk_check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(dk_check.hex(), dk_hex)
    except Exception:
        return False


def create_token(payload: dict, expires_minutes: int = 120) -> str:
    secret = os.getenv("JWT_SECRET", "dev-secret")
    header = {"alg": "HS256", "typ": "JWT"}
    exp = datetime.utcnow() + timedelta(minutes=expires_minutes)
    body = dict(payload)
    body["exp"] = int(exp.timestamp())
    h64 = _b64url(json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    p64 = _b64url(json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    signing_input = f"{h64}.{p64}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    s64 = _b64url(sig)
    return f"{h64}.{p64}.{s64}"


def verify_token(token: str) -> dict | None:
    try:
        secret = os.getenv("JWT_SECRET", "dev-secret")
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h64, p64, s64 = parts
        signing_input = f"{h64}.{p64}".encode("ascii")
        sig = _b64url(hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, s64):
            return None
        payload = json.loads(_b64url_decode(p64))
        if int(payload.get("exp", 0)) < int(datetime.utcnow().timestamp()):
            return None
        return payload
    except Exception:
        return None