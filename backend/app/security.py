import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_database

COOKIE_NAME = "hostel_supervisor_session"
STUDENT_COOKIE_NAME = "hostel_student_session"


def hash_password(password: str, salt: str | None = None) -> str:
    actual_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(actual_salt),
        310_000,
    ).hex()
    return f"{actual_salt}:{digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split(":", 1)
    except ValueError:
        return False
    calculated = hash_password(password, salt).split(":", 1)[1]
    return hmac.compare_digest(calculated, expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_session(
    database: Session,
    supervisor_id: int,
) -> tuple[str, datetime]:
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=8)
    database.add(
        models.SessionToken(
            supervisor_id=supervisor_id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
        )
    )
    database.commit()
    return raw_token, expires_at


def require_supervisor(
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    database: Session = Depends(get_database),
) -> models.Supervisor:
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    session = (
        database.query(models.SessionToken)
        .filter(models.SessionToken.token_hash == hash_token(session_token))
        .first()
    )

    if session is None or session.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired")

    supervisor = database.get(models.Supervisor, session.supervisor_id)
    if supervisor is None or not supervisor.is_active:
        raise HTTPException(status_code=401, detail="Supervisor unavailable")
    return supervisor


def new_student_session(
    database: Session,
    student_id: int,
) -> tuple[str, datetime]:
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=12)
    database.add(
        models.StudentSession(
            student_id=student_id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
        )
    )
    database.commit()
    return raw_token, expires_at


def require_student(
    session_token: str | None = Cookie(
        default=None,
        alias=STUDENT_COOKIE_NAME,
    ),
    database: Session = Depends(get_database),
) -> models.Student:
    if not session_token:
        raise HTTPException(status_code=401, detail="Student login required")

    session = (
        database.query(models.StudentSession)
        .filter(models.StudentSession.token_hash == hash_token(session_token))
        .first()
    )
    if session is None or session.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=401, detail="Student session expired")

    student = database.get(models.Student, session.student_id)
    if student is None or not student.is_active:
        raise HTTPException(status_code=401, detail="Student unavailable")
    return student
