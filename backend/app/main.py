import json
import os
import random
import secrets
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import event, func, inspect, or_, text
from sqlalchemy.orm import Session

from app import models
from app.database import Base, engine, get_database, SessionLocal
from app.schemas import (
    AccessRequestCreate,
    GuardianBatchAccessRequest,
    GuardianFaceVerifyRequest,
    FaceEnrollmentRequest,
    StudentFaceVerifyRequest,
    GuardianRequestCreate,
    AdminGuardianCreate,
    AdminGuardianUpdate,
    AdminStudentCreate,
    AssistantQuestion,
    GuardianAssistantQuestion,
    KioskScanRequest,
    LoginRequest,
    RelationshipReview,
    StudentLoginRequest,
)
from app.security import (
    COOKIE_NAME,
    STUDENT_COOKIE_NAME,
    hash_token,
    new_student_session,
    new_session,
    require_student,
    require_supervisor,
    verify_password,
    hash_password,
)

Base.metadata.create_all(bind=engine)

# Keep existing demonstration databases compatible with the guardian face
# enrollment field added after the initial schema was created.
with engine.begin() as connection:
    if connection.dialect.name == "sqlite":
        guardian_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(guardians)"))}
        if "face_image" not in guardian_columns:
            connection.execute(text("ALTER TABLE guardians ADD COLUMN face_image TEXT"))
        if "password_hash" not in guardian_columns:
            connection.execute(text("ALTER TABLE guardians ADD COLUMN password_hash VARCHAR(255) DEFAULT ''"))
        if "is_active" not in guardian_columns:
            connection.execute(text("ALTER TABLE guardians ADD COLUMN is_active BOOLEAN DEFAULT 1"))
        if "relationship" not in guardian_columns:
            connection.execute(text("ALTER TABLE guardians ADD COLUMN relationship VARCHAR(40) DEFAULT ''"))
        student_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(students)"))}
        if "face_image" not in student_columns:
            connection.execute(text("ALTER TABLE students ADD COLUMN face_image TEXT"))


@event.listens_for(Session, "after_flush")
def write_audit_logs(database: Session, _flush_context) -> None:
    """Record inserts, updates, and deletes without storing secrets or images."""
    if database.info.get("writing_audit_logs"):
        return
    changes = []
    for operation, objects in (("created", database.new), ("updated", database.dirty), ("deleted", database.deleted)):
        for obj in objects:
            if isinstance(obj, models.AuditLog) or not hasattr(obj, "__tablename__"):
                continue
            if operation == "updated" and not database.is_modified(obj, include_collections=False):
                continue
            identity = inspect(obj).identity
            details = {}
            for column in inspect(obj).mapper.column_attrs:
                key = column.key
                if key in {"password_hash", "face_image", "qr_token_hash", "token_hash"}:
                    continue
                value = getattr(obj, key, None)
                if isinstance(value, datetime):
                    value = value.isoformat()
                if isinstance(value, (str, int, float, bool)) or value is None:
                    details[key] = value
            changes.append(models.AuditLog(
                event_type=f"{operation}:{obj.__tablename__}",
                entity_type=obj.__class__.__name__,
                entity_id=identity[0] if identity else getattr(obj, "id", None),
                details=json.dumps(details, default=str),
            ))
    if changes:
        database.info["writing_audit_logs"] = True
        database.add_all(changes)
        database.info["writing_audit_logs"] = False


def bootstrap_supervisor_from_environment() -> None:
    """Create the first supervisor when a new hosted database is empty."""
    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    database = SessionLocal()
    try:
        for code, name in (("B1", "Building 1"), ("B2", "Building 2")):
            if database.query(models.Building).filter(models.Building.code == code).first() is None:
                database.add(models.Building(code=code, name=name, is_active=True))
        database.flush()
        supervisor = database.query(models.Supervisor).filter(
            func.lower(models.Supervisor.email) == email
        ).first()
        if supervisor is None:
            supervisor = models.Supervisor(
                full_name=os.getenv("BOOTSTRAP_ADMIN_NAME", "Dorm Supervisor"),
                email=email,
                password_hash=hash_password(password),
                role="Dorm Supervisor",
                is_active=True,
            )
            database.add(supervisor)
            database.flush()
        else:
            supervisor.password_hash = hash_password(password)
            supervisor.is_active = True
        for building in database.query(models.Building).filter(models.Building.code.in_(["B1", "B2"])).all():
            assigned = database.query(models.SupervisorBuilding).filter(
                models.SupervisorBuilding.supervisor_id == supervisor.id,
                models.SupervisorBuilding.building_id == building.id,
            ).first()
            if assigned is None:
                database.add(models.SupervisorBuilding(supervisor_id=supervisor.id, building_id=building.id))
        database.commit()
    finally:
        database.close()


bootstrap_supervisor_from_environment()


def enroll_guardian_with_face_engine(guardian: models.Guardian) -> None:
    """Enroll a guardian captured by the website before approving access."""
    engine_url = os.getenv("FACE_ENGINE_URL", "").strip()
    if engine_url.endswith("/verify"):
        engine_url = f"{engine_url[:-len('/verify')]}/enroll"
    if not engine_url:
        raise HTTPException(status_code=503, detail="FACE_ENGINE_URL is not configured")
    if not guardian.face_image:
        raise HTTPException(status_code=422, detail="A guardian face enrollment photo is required")
    token = os.getenv("FACE_ENGINE_TOKEN", "").strip()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Face-Engine-Token"] = token
    request = urllib.request.Request(
        engine_url,
        data=json.dumps({
            "guardian_code": guardian.guardian_code,
            "face_images": [guardian.face_image],
        }).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        # Render may need time to wake the face-engine service from sleep.
        with urllib.request.urlopen(request, timeout=45) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as reason:
        try:
            engine_detail = json.loads(reason.read().decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            engine_detail = {"detail": "Face engine rejected the enrollment request"}
        detail = engine_detail.get("detail", "Face engine rejected the enrollment request") if isinstance(engine_detail, dict) else "Face engine rejected the enrollment request"
        raise HTTPException(status_code=502, detail=f"Face enrollment error ({reason.code}): {detail}") from reason
    except (urllib.error.URLError, TimeoutError, ValueError) as reason:
        raise HTTPException(status_code=503, detail="The face-enrollment service is unavailable") from reason
    if result.get("enrolled") is not True:
        raise HTTPException(status_code=502, detail="The face-enrollment service rejected this guardian")


def enroll_face_subject_with_engine(subject_code: str, face_image: str) -> None:
    """Enroll a student face in the same engine used for guardian matching."""
    engine_url = os.getenv("FACE_ENGINE_URL", "").strip()
    if engine_url.endswith("/verify"):
        engine_url = f"{engine_url[:-len('/verify')]}/enroll"
    if not engine_url:
        raise HTTPException(status_code=503, detail="FACE_ENGINE_URL is not configured")
    headers = {"Content-Type": "application/json"}
    token = os.getenv("FACE_ENGINE_TOKEN", "").strip()
    if token:
        headers["X-Face-Engine-Token"] = token
    request = urllib.request.Request(
        engine_url,
        data=json.dumps({"subject_code": subject_code, "face_images": [face_image]}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as reason:
        try:
            engine_detail = json.loads(reason.read().decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            engine_detail = {"detail": "Face engine rejected the enrollment request"}
        detail = engine_detail.get("detail", "Face engine rejected the enrollment request") if isinstance(engine_detail, dict) else "Face engine rejected the enrollment request"
        raise HTTPException(status_code=502, detail=f"Face enrollment error ({reason.code}): {detail}") from reason
    except (urllib.error.URLError, TimeoutError, ValueError) as reason:
        raise HTTPException(status_code=503, detail="The configured face-enrollment service is unavailable") from reason
    if result.get("enrolled") is not True:
        raise HTTPException(status_code=502, detail="The face-enrollment service rejected this face")

app = FastAPI(
    title="Hostel Access Management API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://hostel-management-web.onrender.com",
        os.getenv("FRONTEND_URL", "").rstrip("/"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def building_or_404(database: Session, building_id: int) -> models.Building:
    building = database.get(models.Building, building_id)
    if building is None:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


def assert_assignment(
    database: Session,
    supervisor: models.Supervisor,
    building_id: int,
) -> None:
    assignment = (
        database.query(models.SupervisorBuilding)
        .filter(
            models.SupervisorBuilding.supervisor_id == supervisor.id,
            models.SupervisorBuilding.building_id == building_id,
        )
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=403, detail="Building is not assigned")


def student_dict(student: models.Student) -> dict:
    return {
        "id": student.id,
        "university_id": student.university_id,
        "full_name": student.full_name,
        "email": student.email,
        "phone": student.phone,
        "city": student.city,
        "building_id": student.building_id,
        "room_number": student.room_number,
        "current_status": student.current_status,
    }


def approved_guardian_for_student(
    database: Session,
    student_id: int,
) -> tuple[models.GuardianStudentLink, models.Guardian] | None:
    row = (
        database.query(models.GuardianStudentLink, models.Guardian)
        .join(
            models.Guardian,
            models.GuardianStudentLink.guardian_id == models.Guardian.id,
        )
        .filter(
            models.GuardianStudentLink.student_id == student_id,
            models.GuardianStudentLink.status == "approved",
        )
        .first()
    )
    return row


def student_profile(database: Session, student: models.Student) -> dict:
    guardian_row = approved_guardian_for_student(database, student.id)
    guardian = None
    relationship = None
    if guardian_row:
        link, linked_guardian = guardian_row
        guardian = {
            "id": linked_guardian.id,
            "full_name": linked_guardian.full_name,
            "phone": linked_guardian.phone,
            "relationship": link.relationship,
            "relationship_status": link.status,
            "face_status": linked_guardian.face_status,
        }
        relationship = link.relationship

    recent = (
        database.query(models.EntryExitRecord)
        .filter(models.EntryExitRecord.student_id == student.id)
        .order_by(models.EntryExitRecord.occurred_at.desc())
        .first()
    )
    return {
        **student_dict(student),
        "active": student.is_active,
        "face_status": "enrolled" if student.face_image else "not_enrolled",
        "face_enrolled": bool(student.face_image),
        "face_image": student.face_image,
        "guardian": guardian,
        "relationship": relationship,
        "last_access": (
            {
                "action": recent.action,
                "occurred_at": recent.occurred_at.isoformat(),
                "face_status": recent.face_status,
            }
            if recent
            else None
        ),
    }


def guardian_kiosk_profile(database: Session, guardian: models.Guardian) -> dict:
    rows = (
        database.query(models.GuardianStudentLink, models.Student, models.Building)
        .join(models.Student, models.GuardianStudentLink.student_id == models.Student.id)
        .join(models.Building, models.Student.building_id == models.Building.id)
        .filter(
            models.GuardianStudentLink.guardian_id == guardian.id,
            models.GuardianStudentLink.status == "approved",
            models.Student.is_active.is_(True),
        )
        .order_by(models.Student.full_name)
        .all()
    )
    students = []
    for link, student, building in rows:
        allowed_actions = []
        if student.current_status == "outside":
            allowed_actions.append("check_in")
        if student.current_status == "inside":
            allowed_actions.append("check_out")
        students.append({
            **student_dict(student),
            "building_name": building.name,
            "relationship": link.relationship,
            "can_check_in": link.can_check_in,
            "can_check_out": link.can_check_out,
            "allowed_actions": allowed_actions,
        })
    return {
        "id": guardian.id,
        "guardian_code": guardian.guardian_code,
        "full_name": guardian.full_name,
        "phone": guardian.phone,
        "face_status": guardian.face_status,
        "identity_match": guardian.identity_match,
        "students": students,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(
    payload: LoginRequest,
    response: Response,
    database: Session = Depends(get_database),
):
    supervisor = (
        database.query(models.Supervisor)
        .filter(func.lower(models.Supervisor.email) == payload.email.lower())
        .first()
    )
    if supervisor is None or not verify_password(
        payload.password,
        supervisor.password_hash,
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token, expires_at = new_session(database, supervisor.id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=True,
max_age=8 * 60 * 60,    )
    return {
        "authenticated": True,
        "id": supervisor.id,
        "full_name": supervisor.full_name,
        "email": supervisor.email,
        "role": supervisor.role,
    }


@app.get("/auth/me")
def me(supervisor: models.Supervisor = Depends(require_supervisor)):
    return {
        "authenticated": True,
        "id": supervisor.id,
        "full_name": supervisor.full_name,
        "email": supervisor.email,
        "role": supervisor.role,
    }


@app.get("/admin/audit-logs")
def audit_logs(
    limit: int = Query(default=200, ge=1, le=1000),
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    """Return the latest append-only activity records for administration."""
    del supervisor
    rows = database.query(models.AuditLog).order_by(models.AuditLog.occurred_at.desc()).limit(limit).all()
    return [{
        "id": row.id,
        "event_type": row.event_type,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "occurred_at": row.occurred_at.isoformat(),
        "details": json.loads(row.details or "{}"),
    } for row in rows]


@app.post("/admin/demo-data/seed")
def seed_hosted_demo_data(
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    """Add 100 demo rows to the hosted database for each admin report."""
    randomizer = random.Random()
    students = database.query(models.Student).filter(models.Student.is_active.is_(True)).all()
    guardians = database.query(models.Guardian).filter(models.Guardian.is_active.is_(True)).all()
    buildings = database.query(models.Building).filter(models.Building.is_active.is_(True)).all()
    if not students or not guardians or not buildings:
        raise HTTPException(status_code=409, detail="Create students, guardians, and buildings before generating demo data")

    now = datetime.utcnow()
    relationships = ["Father", "Mother", "Brother", "Sister", "Uncle", "Aunt"]
    destinations = ["Bani Yas", "Khor Fakkan", "Al Shahama", "Dubai Mall", "Al Ain"]

    for _ in range(100):
        student = randomizer.choice(students)
        guardian = randomizer.choice(guardians)
        action = randomizer.choice(["check_in", "check_out"])
        database.add(models.EntryExitRecord(
            student_id=student.id,
            guardian_id=guardian.id,
            action=action,
            qr_status=randomizer.choice(["used", "expired", "used"]),
            face_status=randomizer.choice(["verified", "verified", "failed"]),
            occurred_at=now - timedelta(days=randomizer.randrange(0, 31), minutes=randomizer.randrange(0, 1440)),
        ))

        tamam_date = (now - timedelta(days=randomizer.randrange(0, 31))).date().isoformat()
        completed = randomizer.random() < 0.78
        database.add(models.TamamRecord(
            student_id=student.id,
            record_date=tamam_date,
            status="completed" if completed else "not_completed",
            verification_method=randomizer.choice(["face", "card", "fingerprint"]) if completed else None,
            completed_at=now - timedelta(days=randomizer.randrange(0, 31)) if completed else None,
        ))

        building = randomizer.choice(buildings)
        database.add(models.BusTrip(
            building_id=building.id,
            bus_number=f"Bus {randomizer.randrange(1, 40):02d}",
            destination=randomizer.choice(destinations),
            departure_at=now - timedelta(days=randomizer.randrange(0, 31), hours=randomizer.randrange(0, 12)),
            capacity=randomizer.choice([20, 30, 40, 50]),
            status=randomizer.choice(["scheduled", "boarding", "departed", "completed"]),
        ))

        for _link_try in range(20):
            link_student = randomizer.choice(students)
            link_guardian = randomizer.choice(guardians)
            exists = database.query(models.GuardianStudentLink).filter(
                models.GuardianStudentLink.student_id == link_student.id,
                models.GuardianStudentLink.guardian_id == link_guardian.id,
            ).first()
            if exists is None:
                approved = randomizer.random() < 0.72
                database.add(models.GuardianStudentLink(
                    guardian_id=link_guardian.id,
                    student_id=link_student.id,
                    relationship=randomizer.choice(relationships),
                    status="approved" if approved else randomizer.choice(["pending", "rejected"]),
                    can_check_in=approved,
                    can_check_out=approved,
                    requested_at=now - timedelta(days=randomizer.randrange(0, 31)),
                    reviewed_at=now - timedelta(days=randomizer.randrange(0, 20)) if approved else None,
                    supervisor_note="Generated demonstration record",
                ))
                break
    database.commit()
    return {
        "message": "Generated demonstration data",
        "entry_exit_added": 100,
        "tamam_added": 100,
        "bus_trips_added": 100,
        "guardian_approval_requests_added": database.query(models.GuardianStudentLink).filter(
            models.GuardianStudentLink.supervisor_note == "Generated demonstration record"
        ).count(),
    }


@app.post("/admin/students", status_code=201)
def create_admin_student(
    payload: AdminStudentCreate,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    """Create a student account from the protected administration portal."""
    building_or_404(database, payload.building_id)
    assert_assignment(database, supervisor, payload.building_id)
    if database.query(models.Student).filter(
        or_(
            func.lower(models.Student.email) == payload.email.lower(),
            func.lower(models.Student.university_id) == payload.university_id.lower(),
        )
    ).first():
        raise HTTPException(status_code=409, detail="Student email or university ID already exists")
    student = models.Student(
        university_id=payload.university_id.strip(),
        full_name=payload.full_name.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone.strip(),
        city=payload.city.strip(),
        building_id=payload.building_id,
        room_number=payload.room_number.strip(),
        current_status="inside",
        is_active=payload.is_active,
        face_image=payload.face_image,
    )
    if payload.face_image:
        enroll_face_subject_with_engine(student.university_id, payload.face_image)
    database.add(student)
    database.flush()
    database.add(models.StudentCredential(
        student_id=student.id,
        password_hash=hash_password(payload.password),
    ))
    database.commit()
    database.refresh(student)
    return {"student": {**student_dict(student), "is_active": student.is_active}}


@app.post("/admin/guardians", status_code=201)
def create_admin_guardian(
    payload: AdminGuardianCreate,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    """Create a guardian account; relationship approval is a separate step."""
    del supervisor
    student = database.query(models.Student).filter(
        func.lower(models.Student.university_id) == payload.student_university_id.strip().lower(),
        models.Student.is_active.is_(True),
    ).first()
    if student is None:
        raise HTTPException(status_code=404, detail="Active student with this university ID was not found")
    if database.query(models.Guardian).filter(
        or_(
            func.lower(models.Guardian.email) == payload.email.lower(),
            models.Guardian.emirates_id == payload.emirates_id.strip(),
        )
    ).first():
        raise HTTPException(status_code=409, detail="Guardian email or Emirates ID already exists")
    guardian = models.Guardian(
        guardian_code=f"PENDING-{secrets.token_hex(5).upper()}",
        full_name=payload.full_name.strip(),
        emirates_id=payload.emirates_id.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone.strip(),
        city=payload.city.strip(),
        relationship=payload.relationship.strip(),
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        face_image=payload.face_image,
        face_status="verified" if payload.face_image else "not_enrolled",
        identity_match=95 if payload.face_image else 0,
    )
    if payload.face_image:
        enroll_guardian_with_face_engine(guardian)
    database.add(guardian)
    database.flush()
    database.add(models.GuardianStudentLink(
        guardian_id=guardian.id,
        student_id=student.id,
        relationship=payload.relationship.strip(),
        status="approved" if payload.face_image else "pending",
        can_check_in=bool(payload.face_image),
        can_check_out=bool(payload.face_image),
        requested_at=datetime.utcnow(),
        reviewed_at=datetime.utcnow() if payload.face_image else None,
        supervisor_note="Automatically approved during admin creation" if payload.face_image else None,
    ))
    database.commit()
    database.refresh(guardian)
    return {
        "guardian": {
            "id": guardian.id,
            "full_name": guardian.full_name,
            "emirates_id": guardian.emirates_id,
            "email": guardian.email,
            "phone": guardian.phone,
            "city": guardian.city,
            "relationship": guardian.relationship,
            "is_active": guardian.is_active,
            "face_status": guardian.face_status,
            "student_university_id": student.university_id,
            "relationship_status": "pending",
        }
    }


@app.delete("/admin/guardians/{guardian_id}")
def delete_admin_guardian(
    guardian_id: int,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    """Permanently remove a guardian and its access relationships."""
    guardian = database.get(models.Guardian, guardian_id)
    if guardian is None:
        raise HTTPException(status_code=404, detail="Guardian not found")
    linked_buildings = database.query(models.Student.building_id).join(
        models.GuardianStudentLink,
        models.GuardianStudentLink.student_id == models.Student.id,
    ).filter(models.GuardianStudentLink.guardian_id == guardian_id).distinct().all()
    if not any(
        database.query(models.SupervisorBuilding).filter(
            models.SupervisorBuilding.supervisor_id == supervisor.id,
            models.SupervisorBuilding.building_id == building_id,
        ).first()
        for (building_id,) in linked_buildings
    ):
        raise HTTPException(status_code=403, detail="You are not assigned to this guardian's building")

    database.query(models.DormAccessRequest).filter(
        models.DormAccessRequest.guardian_id == guardian_id
    ).delete(synchronize_session=False)
    database.query(models.EntryExitRecord).filter(
        models.EntryExitRecord.guardian_id == guardian_id
    ).update({models.EntryExitRecord.guardian_id: None}, synchronize_session=False)
    database.query(models.GuardianStudentLink).filter(
        models.GuardianStudentLink.guardian_id == guardian_id
    ).delete(synchronize_session=False)
    database.delete(guardian)
    database.commit()
    return {"deleted": True, "guardian_id": guardian_id}


@app.patch("/admin/guardians/{guardian_id}")
def update_admin_guardian(
    guardian_id: int,
    payload: AdminGuardianUpdate,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    guardian = database.get(models.Guardian, guardian_id)
    if guardian is None:
        raise HTTPException(status_code=404, detail="Guardian not found")
    linked_buildings = database.query(models.Student.building_id).join(
        models.GuardianStudentLink,
        models.GuardianStudentLink.student_id == models.Student.id,
    ).filter(models.GuardianStudentLink.guardian_id == guardian_id).distinct().all()
    if not any(
        database.query(models.SupervisorBuilding).filter(
            models.SupervisorBuilding.supervisor_id == supervisor.id,
            models.SupervisorBuilding.building_id == building_id,
        ).first()
        for (building_id,) in linked_buildings
    ):
        raise HTTPException(status_code=403, detail="You are not assigned to this guardian's building")
    guardian.full_name = payload.full_name.strip()
    guardian.phone = payload.phone.strip()
    guardian.city = payload.city.strip()
    guardian.relationship = payload.relationship.strip()
    guardian.is_active = payload.is_active
    database.commit()
    return {"updated": True, "guardian_id": guardian_id}


@app.post("/auth/logout")
def logout(
    response: Response,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
):
    del supervisor
    if session_token:
        database.query(models.SessionToken).filter(
            models.SessionToken.token_hash == hash_token(session_token)
        ).delete()
        database.commit()
    response.delete_cookie(COOKIE_NAME)
    return {"authenticated": False}


@app.post("/student/auth/login")
def student_login(
    payload: StudentLoginRequest,
    response: Response,
    database: Session = Depends(get_database),
):
    student = (
        database.query(models.Student)
        .filter(
            or_(
                func.lower(models.Student.email) == payload.identifier.lower(),
                func.lower(models.Student.university_id)
                == payload.identifier.lower(),
            )
        )
        .first()
    )
    if student is None:
        raise HTTPException(status_code=401, detail="Invalid student ID or password")

    credential = (
        database.query(models.StudentCredential)
        .filter(models.StudentCredential.student_id == student.id)
        .first()
    )
    if credential is None or not verify_password(
        payload.password,
        credential.password_hash,
    ):
        raise HTTPException(status_code=401, detail="Invalid student ID or password")

    token, expires_at = new_student_session(database, student.id)
    response.set_cookie(
        key=STUDENT_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=True,
max_age=8 * 60 * 60,    )
    return {"authenticated": True, "student": student_profile(database, student)}


@app.get("/student/auth/me")
def student_me(
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    return {"authenticated": True, "student": student_profile(database, student)}


@app.patch("/student/profile/face")
def enroll_student_face(
    payload: FaceEnrollmentRequest,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    if student.face_image:
        raise HTTPException(status_code=409, detail="Face enrollment is already completed and cannot be replaced")
    enroll_face_subject_with_engine(student.university_id, payload.face_image)
    student.face_image = payload.face_image
    database.commit()
    return {"face_enrolled": True, "face_status": "enrolled"}


@app.post("/student/auth/logout")
def student_logout(
    response: Response,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
    session_token: str | None = Cookie(
        default=None,
        alias=STUDENT_COOKIE_NAME,
    ),
):
    del student
    if session_token:
        database.query(models.StudentSession).filter(
            models.StudentSession.token_hash == hash_token(session_token)
        ).delete()
        database.commit()
    response.delete_cookie(STUDENT_COOKIE_NAME)
    return {"authenticated": False}


def student_guardian_links(database: Session, student_id: int) -> list[dict]:
    rows = (
        database.query(models.GuardianStudentLink, models.Guardian)
        .join(models.Guardian, models.GuardianStudentLink.guardian_id == models.Guardian.id)
        .filter(models.GuardianStudentLink.student_id == student_id)
        .order_by(models.GuardianStudentLink.requested_at.desc())
        .all()
    )
    return [{
        "id": link.id,
        "guardian_code": guardian.guardian_code,
        "full_name": guardian.full_name,
        "email": guardian.email,
        "phone": guardian.phone,
        "relationship": link.relationship,
        "status": link.status,
        "face_status": guardian.face_status,
        "face_enrolled": bool(guardian.face_image),
        "requested_at": link.requested_at.isoformat(),
    } for link, guardian in rows]


@app.get("/student/guardians")
def list_student_guardians(
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    return {"guardians": student_guardian_links(database, student.id)}


@app.post("/student/guardians", status_code=201)
def request_guardian(
    payload: GuardianRequestCreate,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    allowed_relationships = {"cousin", "driver", "housekeeper", "mother", "brother", "sister", "father", "uncle", "aunt"}
    relationship = payload.relationship.strip().lower()
    if relationship not in allowed_relationships:
        raise HTTPException(status_code=422, detail="Choose a valid guardian relationship")
    email = payload.email.strip().lower()
    guardian = database.query(models.Guardian).filter(func.lower(models.Guardian.email) == email).first()
    if guardian is None:
        reference = secrets.token_hex(6).upper()
        guardian = models.Guardian(
            guardian_code=f"PENDING-{reference}",
            full_name=payload.full_name.strip(),
            emirates_id=payload.emirates_id.strip(),
            email=email,
            phone=payload.phone.strip(),
            city=payload.city.strip(),
            face_image=payload.face_image,
            face_status="enrolled",
            identity_match=0,
        )
        enroll_guardian_with_face_engine(guardian)
        database.add(guardian)
        database.flush()
    existing = database.query(models.GuardianStudentLink).filter(
        models.GuardianStudentLink.guardian_id == guardian.id,
        models.GuardianStudentLink.student_id == student.id,
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="This guardian already has a request for your account")
    link = models.GuardianStudentLink(
        guardian_id=guardian.id,
        student_id=student.id,
        relationship=relationship.title(),
        status="pending",
        can_check_in=False,
        can_check_out=False,
        requested_at=datetime.utcnow(),
    )
    database.add(link)
    database.commit()
    return {"message": "Guardian request sent to administration", "guardian": student_guardian_links(database, student.id)[0]}


@app.get("/student/dashboard")
def student_dashboard(
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    return student_profile(database, student)


@app.post("/student/access/request")
def create_student_access_request(
    payload: AccessRequestCreate,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    if payload.action not in {"check_in", "check_out"}:
        raise HTTPException(
            status_code=422,
            detail="Action must be check_in or check_out",
        )
    if payload.action == "check_in" and student.current_status != "outside":
        raise HTTPException(status_code=409, detail="Student is already inside")
    if payload.action == "check_out" and student.current_status != "inside":
        raise HTTPException(status_code=409, detail="Student is already outside")

    guardian_row = approved_guardian_for_student(database, student.id)
    if guardian_row is None:
        raise HTTPException(
            status_code=403,
            detail="An approved guardian relationship is required",
        )
    link, guardian = guardian_row
    # An approved relationship grants both directions; residence status below
    # determines whether this request is entry or exit.

    database.query(models.DormAccessRequest).filter(
        models.DormAccessRequest.student_id == student.id,
        models.DormAccessRequest.status.in_(["face_pending", "qr_active"]),
    ).update({"status": "cancelled"}, synchronize_session=False)

    request = models.DormAccessRequest(
        student_id=student.id,
        guardian_id=guardian.id,
        action=payload.action,
        status="face_pending",
        face_verified=False,
        created_at=datetime.utcnow(),
    )
    database.add(request)
    database.commit()
    database.refresh(request)
    return {
        "id": request.id,
        "action": request.action,
        "status": request.status,
        "student": student_profile(database, student),
        "guardian_name": guardian.full_name,
    }


@app.get("/student/access/pending")
def pending_student_access_request(
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    request = (
        database.query(models.DormAccessRequest)
        .filter(
            models.DormAccessRequest.student_id == student.id,
            models.DormAccessRequest.status.in_(
                ["student_face_pending", "face_pending", "qr_active"]
            ),
        )
        .order_by(models.DormAccessRequest.created_at.desc())
        .first()
    )
    if request is None:
        return {"request": None}
    guardian = database.get(models.Guardian, request.guardian_id)
    return {"request": {
        "id": request.id,
        "action": request.action,
        "status": request.status,
        "guardian_name": guardian.full_name if guardian else "Approved guardian",
        "created_at": request.created_at.isoformat(),
    }}


@app.post("/kiosk/guardian/verify-face")
def verify_guardian_face(
    payload: GuardianFaceVerifyRequest,
    database: Session = Depends(get_database),
):
    """Verify a guardian through either the website or Raspberry Pi face engine."""
    if payload.source == "website" and not payload.face_image:
        raise HTTPException(status_code=422, detail="A website camera image is required")
    # Both laptop/phone cameras and Raspberry Pi cameras use the same generic
    # face service. The Pi is only a camera device, not a required dependency.
    engine_url = os.getenv("FACE_ENGINE_URL", "").strip()
    if not engine_url:
        raise HTTPException(
            status_code=503,
            detail="Face-only login is enabled, but FACE_ENGINE_URL is not configured",
        )
    engine_token = os.getenv("FACE_ENGINE_TOKEN", "").strip()
    headers = {"Content-Type": "application/json"}
    if engine_token:
        headers["X-Face-Engine-Token"] = engine_token
    request = urllib.request.Request(
        engine_url,
        data=json.dumps({
            "source": payload.source,
            **({"face_image": payload.face_image} if payload.face_image else {}),
        }).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        # Allow a cold-starting Render face engine enough time to respond.
        with urllib.request.urlopen(request, timeout=45) as response:
            match = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as reason:
        # Do not hide a face-engine validation/authentication error as a network
        # outage.  The engine's OpenAPI contract returns useful JSON details
        # (for example a missing token or an invalid request body).
        try:
            engine_detail = json.loads(reason.read().decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            engine_detail = {"detail": "Face engine rejected the verification request"}
        detail = engine_detail.get("detail", "Face engine rejected the verification request") if isinstance(engine_detail, dict) else "Face engine rejected the verification request"
        raise HTTPException(status_code=502, detail=f"Face engine error ({reason.code}): {detail}") from reason
    except (urllib.error.URLError, TimeoutError, ValueError) as reason:
        raise HTTPException(status_code=503, detail="The configured face-verification service is unavailable") from reason
    guardian_code = str(match.get("guardian_code", "")).strip()
    if match.get("verified") is not True or not guardian_code:
        raise HTTPException(status_code=403, detail="Guardian face could not be verified")
    guardian = database.query(models.Guardian).filter(
        models.Guardian.guardian_code == guardian_code
    ).first()
    if guardian is None or guardian.face_status != "verified":
        raise HTTPException(status_code=403, detail="Guardian face could not be verified")
    if isinstance(match.get("identity_match"), (int, float)):
        guardian.identity_match = max(0, min(100, int(match["identity_match"])))
        database.commit()
    return {"verified": True, "guardian": guardian_kiosk_profile(database, guardian)}


@app.post("/kiosk/guardian/access-requests")
def create_guardian_access_requests(
    payload: GuardianBatchAccessRequest,
    database: Session = Depends(get_database),
):
    if payload.action not in {"check_in", "check_out"}:
        raise HTTPException(status_code=422, detail="Action must be check_in or check_out")
    guardian = database.get(models.Guardian, payload.guardian_id)
    if guardian is None or guardian.face_status != "verified":
        raise HTTPException(status_code=403, detail="Verified guardian is required")
    student_ids = list(dict.fromkeys(payload.student_ids))
    rows = (
        database.query(models.GuardianStudentLink, models.Student)
        .join(models.Student, models.GuardianStudentLink.student_id == models.Student.id)
        .filter(
            models.GuardianStudentLink.guardian_id == guardian.id,
            models.GuardianStudentLink.student_id.in_(student_ids),
            models.GuardianStudentLink.status == "approved",
        )
        .all()
    )
    if len(rows) != len(student_ids):
        raise HTTPException(status_code=403, detail="One or more students are not authorized")
    for link, student in rows:
        allowed = (
            payload.action == "check_in"
            and link.status == "approved"
            and student.current_status == "outside"
        ) or (
            payload.action == "check_out"
            and link.status == "approved"
            and student.current_status == "inside"
        )
        if not allowed:
            raise HTTPException(
                status_code=409,
                detail=f"{student.full_name} is not eligible for this action",
            )
    requests = []
    for _link, student in rows:
        database.query(models.DormAccessRequest).filter(
            models.DormAccessRequest.student_id == student.id,
            models.DormAccessRequest.status.in_(
                ["student_face_pending", "face_pending", "qr_active"]
            ),
        ).update({"status": "cancelled"}, synchronize_session=False)
        request = models.DormAccessRequest(
            student_id=student.id,
            guardian_id=guardian.id,
            action=payload.action,
            # The guardian authorizes the request; the student still has to
            # complete their own face verification before a QR is issued.
            status="student_face_pending",
            face_verified=False,
            created_at=datetime.utcnow(),
        )
        database.add(request)
        database.flush()
        requests.append({
            "id": request.id,
            "student_id": student.id,
            "student_name": student.full_name,
            "university_id": student.university_id,
            "status": request.status,
        })
    database.commit()
    return {
        "request_reference": f"DAR-{datetime.utcnow():%Y%m%d}-{requests[0]['id']:04d}",
        "guardian_name": guardian.full_name,
        "action": payload.action,
        "requests": requests,
    }


@app.post("/student/access/{request_id}/face-verify")
def verify_student_face(
    request_id: int,
    payload: StudentFaceVerifyRequest,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    request = database.get(models.DormAccessRequest, request_id)
    if request is None or request.student_id != student.id:
        raise HTTPException(status_code=404, detail="Access request not found")
    # qr_active is included for requests created by earlier versions, where
    # the guardian generated a QR before the student's face confirmation.
    # Confirming the student's face replaces that old/expired QR with a new
    # one, without making the guardian submit the authorization again.
    if request.status not in {"face_pending", "student_face_pending", "qr_active"}:
        raise HTTPException(status_code=409, detail="Request cannot be verified")
    if not student.face_image:
        raise HTTPException(status_code=422, detail="Complete face enrollment in your Student Profile first")

    engine_url = os.getenv("FACE_ENGINE_URL", "").strip()
    if not engine_url:
        raise HTTPException(status_code=503, detail="FACE_ENGINE_URL is not configured")
    headers = {"Content-Type": "application/json"}
    engine_token = os.getenv("FACE_ENGINE_TOKEN", "").strip()
    if engine_token:
        headers["X-Face-Engine-Token"] = engine_token
    verify_request = urllib.request.Request(
        engine_url,
        data=json.dumps({"source": "website", "face_image": payload.face_image, "expected_code": student.university_id}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(verify_request, timeout=45) as response:
            match = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as reason:
        raise HTTPException(status_code=503, detail="The configured face-verification service is unavailable") from reason
    if match.get("verified") is not True or match.get("subject_code") != student.university_id:
        raise HTTPException(status_code=403, detail="Student face could not be verified")

    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    request.face_verified = True
    request.qr_token_hash = hash_token(raw_token)
    request.expires_at = expires_at
    request.status = "qr_active"
    database.commit()

    return {
        "id": request.id,
        "action": request.action,
        "status": request.status,
        "face_verified": True,
        "qr_token": raw_token,
        # Include the UTC offset so browsers do not treat this as local time
        # and immediately mark a newly created QR as expired.
        "expires_at": expires_at.replace(tzinfo=timezone.utc).isoformat(),
        "valid_for_seconds": 300,
    }


@app.post("/kiosk/student/scan")
def scan_student_qr(
    payload: KioskScanRequest,
    database: Session = Depends(get_database),
):
    request = (
        database.query(models.DormAccessRequest)
        .filter(
            models.DormAccessRequest.qr_token_hash
            == hash_token(payload.token.strip())
        )
        .first()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="QR code is invalid")
    if request.status == "completed" or request.used_at is not None:
        raise HTTPException(status_code=409, detail="QR code was already used")
    if request.status != "qr_active" or not request.face_verified:
        raise HTTPException(status_code=409, detail="Face verification is incomplete")
    if request.expires_at is None or request.expires_at <= datetime.utcnow():
        request.status = "expired"
        database.commit()
        raise HTTPException(status_code=410, detail="QR code has expired")

    student = database.get(models.Student, request.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    expected_status = "outside" if request.action == "check_in" else "inside"
    if student.current_status != expected_status:
        raise HTTPException(
            status_code=409,
            detail="Student residence status has already changed",
        )

    student.current_status = (
        "inside" if request.action == "check_in" else "outside"
    )
    request.status = "completed"
    request.used_at = datetime.utcnow()
    database.add(
        models.EntryExitRecord(
            student_id=student.id,
            guardian_id=request.guardian_id,
            action=request.action,
            qr_status="used",
            face_status="verified",
            occurred_at=request.used_at,
        )
    )
    database.commit()
    return {
        "message": (
            "Student checked in successfully"
            if request.action == "check_in"
            else "Student checked out successfully"
        ),
        "action": request.action,
        "student": student_profile(database, student),
    }


@app.post("/student/access/{request_id}/cancel")
def cancel_student_access_request(
    request_id: int,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    request = database.get(models.DormAccessRequest, request_id)
    if request is None or request.student_id != student.id:
        raise HTTPException(status_code=404, detail="Access request not found")
    if request.status in {"used", "completed"} or request.used_at is not None:
        raise HTTPException(status_code=409, detail="Used request cannot be cancelled")
    request.status = "cancelled"
    database.commit()
    return {"id": request.id, "status": request.status}


@app.post("/kiosk/scan")
def kiosk_scan(
    payload: KioskScanRequest,
    database: Session = Depends(get_database),
):
    request = (
        database.query(models.DormAccessRequest)
        .filter(models.DormAccessRequest.qr_token_hash == hash_token(payload.token))
        .first()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="QR code is invalid")
    if request.status != "qr_active" or request.used_at is not None:
        raise HTTPException(status_code=409, detail="QR code has already been used")
    if request.expires_at is None or request.expires_at <= datetime.utcnow():
        request.status = "expired"
        database.commit()
        raise HTTPException(status_code=410, detail="QR code has expired")
    if not request.face_verified:
        raise HTTPException(status_code=403, detail="Face verification is required")

    student = database.get(models.Student, request.student_id)
    student.current_status = (
        "inside" if request.action == "check_in" else "outside"
    )
    now = datetime.utcnow()
    request.status = "used"
    request.used_at = now
    database.add(
        models.EntryExitRecord(
            student_id=student.id,
            guardian_id=request.guardian_id,
            action=request.action,
            qr_status="used",
            face_status="verified",
            occurred_at=now,
        )
    )
    database.commit()
    return {
        "accepted": True,
        "action": request.action,
        "student": student_dict(student),
        "message": (
            "Student checked in successfully"
            if request.action == "check_in"
            else "Student checked out successfully"
        ),
    }


@app.get("/buildings")
def buildings(
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    assigned_ids = [
        row.building_id
        for row in database.query(models.SupervisorBuilding)
        .filter(models.SupervisorBuilding.supervisor_id == supervisor.id)
        .all()
    ]
    results = []
    for building in (
        database.query(models.Building)
        .filter(models.Building.id.in_(assigned_ids))
        .order_by(models.Building.id)
        .all()
    ):
        total = database.query(models.Student).filter(
            models.Student.building_id == building.id
        ).count()
        inside = database.query(models.Student).filter(
            models.Student.building_id == building.id,
            models.Student.current_status == "inside",
        ).count()
        pending = (
            database.query(models.GuardianStudentLink)
            .join(models.Student)
            .filter(
                models.Student.building_id == building.id,
                models.GuardianStudentLink.status == "pending",
            )
            .count()
        )
        results.append(
            {
                "id": building.id,
                "code": building.code,
                "name": building.name,
                "is_active": building.is_active,
                "registered_students": total,
                "currently_inside": inside,
                "alerts": pending,
            }
        )
    return results


@app.get("/buildings/{building_id}/dashboard")
def dashboard(
    building_id: int,
    record_date: str = "",
    city: str = "",
    search: str = "",
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    building = building_or_404(database, building_id)
    assert_assignment(database, supervisor, building_id)
    students_query = database.query(models.Student).filter(
        models.Student.building_id == building_id
    )
    total = students_query.count()
    inside = students_query.filter(models.Student.current_status == "inside").count()
    outside = total - inside
    today = date.today().isoformat()
    tamam_completed = (
        database.query(models.TamamRecord)
        .join(models.Student)
        .filter(
            models.Student.building_id == building_id,
            models.TamamRecord.record_date == today,
            models.TamamRecord.status == "completed",
        )
        .count()
    )
    recent_query = (
        database.query(
            models.EntryExitRecord,
            models.Student,
            models.Guardian,
        )
        .join(models.Student, models.EntryExitRecord.student_id == models.Student.id)
        .outerjoin(
            models.Guardian,
            models.EntryExitRecord.guardian_id == models.Guardian.id,
        )
        .filter(models.Student.building_id == building_id)
    )
    if record_date:
        recent_query = recent_query.filter(func.date(models.EntryExitRecord.occurred_at) == record_date)
    if city:
        recent_query = recent_query.filter(models.Student.city == city)
    if search.strip():
        term = f"%{search.strip()}%"
        recent_query = recent_query.filter(or_(models.Student.full_name.ilike(term), models.Student.university_id.ilike(term), models.Student.email.ilike(term)))
    recent_rows = recent_query.order_by(models.EntryExitRecord.occurred_at.desc()).limit(150).all()
    recent = []
    for record, student, guardian in recent_rows:
        item = student_dict(student)
        item.update(
            {
                "guardian_name": guardian.full_name if guardian else "Self",
                "guardian_phone": guardian.phone if guardian else "—",
                "action": record.action,
                "occurred_at": record.occurred_at.isoformat(),
            }
        )
        recent.append(item)

    pending = (
        database.query(models.GuardianStudentLink)
        .join(models.Student)
        .filter(
            models.Student.building_id == building_id,
            models.GuardianStudentLink.status == "pending",
        )
        .count()
    )
    return {
        "building": {"id": building.id, "code": building.code, "name": building.name},
        "registered_students": total,
        "currently_inside": inside,
        "currently_outside": outside,
        "tamam_pending": total - tamam_completed,
        "pending_guardian_approvals": pending,
        "recent_activity": recent,
    }


def _assistant_item(student: models.Student, **values) -> dict:
    return {"student": student.full_name, "university_id": student.university_id, **values}


@app.post("/admin/assistant")
def admin_assistant(
    payload: AssistantQuestion,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    """Grounded answers for common supervisor questions."""
    question = payload.question.lower().strip()
    building_ids = [row.building_id for row in database.query(models.SupervisorBuilding).filter(
        models.SupervisorBuilding.supervisor_id == supervisor.id
    ).all()]
    outside = database.query(models.Student).filter(
        models.Student.building_id.in_(building_ids), models.Student.current_status == "outside"
    ).order_by(models.Student.full_name).all()
    pending = database.query(models.GuardianStudentLink, models.Guardian, models.Student).join(
        models.Guardian, models.GuardianStudentLink.guardian_id == models.Guardian.id
    ).join(models.Student, models.GuardianStudentLink.student_id == models.Student.id).filter(
        models.Student.building_id.in_(building_ids), models.GuardianStudentLink.status == "pending"
    ).all()
    today_start = datetime.combine(date.today(), datetime.min.time())
    late_cutoff = today_start + timedelta(hours=20)
    late_rows = database.query(models.EntryExitRecord, models.Student).join(
        models.Student, models.EntryExitRecord.student_id == models.Student.id
    ).filter(
        models.Student.building_id.in_(building_ids), models.EntryExitRecord.action == "check_out",
        models.EntryExitRecord.occurred_at >= late_cutoff,
    ).order_by(models.EntryExitRecord.occurred_at.desc()).all()
    today_records = database.query(models.EntryExitRecord, models.Student).join(
        models.Student, models.EntryExitRecord.student_id == models.Student.id
    ).filter(models.Student.building_id.in_(building_ids), models.EntryExitRecord.occurred_at >= today_start).order_by(models.EntryExitRecord.occurred_at.desc()).all()
    all_students = database.query(models.Student).filter(models.Student.building_id.in_(building_ids)).order_by(models.Student.full_name).all()
    approved_links = database.query(models.GuardianStudentLink.student_id).join(models.Student).filter(
        models.Student.building_id.in_(building_ids), models.GuardianStudentLink.status == "approved"
    ).all()
    no_guardian = [s for s in all_students if s.id not in {row[0] for row in approved_links}]
    no_student_face = [s for s in all_students if not s.face_image]
    guardians = database.query(models.Guardian).join(models.GuardianStudentLink).join(models.Student).filter(
        models.Student.building_id.in_(building_ids)
    ).distinct().order_by(models.Guardian.full_name).all()
    no_guardian_face = [g for g in guardians if not g.face_image]
    failed_faces = [(record, student) for record, student in today_records if record.face_status == "failed"]
    expired_qrs = database.query(models.DormAccessRequest, models.Student).join(models.Student).filter(
        models.Student.building_id.in_(building_ids), models.DormAccessRequest.status == "expired"
    ).order_by(models.DormAccessRequest.created_at.desc()).limit(100).all()
    used_qrs = database.query(models.DormAccessRequest, models.Student).join(models.Student).filter(
        models.Student.building_id.in_(building_ids), models.DormAccessRequest.used_at.isnot(None)
    ).order_by(models.DormAccessRequest.used_at.desc()).limit(100).all()
    rejected = database.query(models.GuardianStudentLink, models.Guardian, models.Student).join(
        models.Guardian, models.GuardianStudentLink.guardian_id == models.Guardian.id
    ).join(models.Student, models.GuardianStudentLink.student_id == models.Student.id).filter(
        models.Student.building_id.in_(building_ids), models.GuardianStudentLink.status == "rejected"
    ).all()
    approved = database.query(models.GuardianStudentLink, models.Guardian, models.Student).join(
        models.Guardian, models.GuardianStudentLink.guardian_id == models.Guardian.id
    ).join(models.Student, models.GuardianStudentLink.student_id == models.Student.id).filter(
        models.Student.building_id.in_(building_ids), models.GuardianStudentLink.status == "approved"
    ).all()
    tamam_rows = database.query(models.TamamRecord, models.Student).join(models.Student).filter(
        models.Student.building_id.in_(building_ids), models.TamamRecord.record_date == date.today().isoformat()
    ).all()
    incomplete_tamam = [(record, student) for record, student in tamam_rows if record.status != "completed"]
    bus_trips = database.query(models.BusTrip).filter(models.BusTrip.building_id.in_(building_ids)).order_by(models.BusTrip.departure_at).limit(100).all()

    action_terms = ("add ", "edit ", "disable ", "activate ", "reset ", "move ", "enroll ", "remove ", "approve ", "reject ", "change ", "generate ", "cancel ", "mark ", "correct ", "delete ", "create ")
    if question.startswith(action_terms):
        return {
            "answer": "This request would change system data. For safety, confirm the exact record and action before it is executed.",
            "items": [],
            "requires_confirmation": True,
        }

    if any(term in question for term in ("outside", "currently out", "not inside")):
        rows = [_assistant_item(s, status="outside") for s in outside]
        return {"answer": f"{len(rows)} student(s) are currently outside.", "items": rows}
    if any(term in question for term in ("late", "late check", "late checkout", "late check-out")):
        rows = [_assistant_item(s, occurred_at=record.occurred_at.isoformat()) for record, s in late_rows]
        return {"answer": f"{len(rows)} late check-out(s) found today. Late means after 20:00.", "items": rows}
    if "inside" in question and "outside" not in question:
        rows = [_assistant_item(s, status="inside") for s in all_students if s.current_status == "inside"]
        return {"answer": f"{len(rows)} student(s) are currently inside.", "items": rows}
    if "no guardian" in question:
        return {"answer": f"{len(no_guardian)} student(s) have no approved guardian.", "items": [_assistant_item(s) for s in no_guardian]}
    if "no face" in question and "guardian" not in question:
        return {"answer": f"{len(no_student_face)} student(s) have no face enrollment.", "items": [_assistant_item(s) for s in no_student_face]}
    if "guardian" in question and "no face" in question:
        return {"answer": f"{len(no_guardian_face)} guardian(s) have no face enrollment.", "items": [{"guardian": g.full_name, "email": g.email} for g in no_guardian_face]}
    if "failed" in question and "face" in question:
        return {"answer": f"{len(failed_faces)} failed face verification(s) occurred today.", "items": [_assistant_item(s, occurred_at=r.occurred_at.isoformat()) for r, s in failed_faces]}
    if "expired" in question and "qr" in question:
        return {"answer": f"{len(expired_qrs)} expired QR code(s) found.", "items": [_assistant_item(s, status="expired") for _r, s in expired_qrs]}
    if "used" in question and "qr" in question:
        return {"answer": f"{len(used_qrs)} used QR code(s) found.", "items": [_assistant_item(s, status="used") for _r, s in used_qrs]}
    if "rejected" in question:
        return {"answer": f"{len(rejected)} rejected relationship(s) found.", "items": [{"guardian": g.full_name, "student": s.full_name, "relationship": l.relationship} for l, g, s in rejected]}
    if "approved" in question and "guardian" in question:
        return {"answer": f"{len(approved)} approved guardian relationship(s) found.", "items": [{"guardian": g.full_name, "student": s.full_name, "relationship": l.relationship} for l, g, s in approved]}
    if "tamam" in question or "completion" in question:
        completed = len(tamam_rows) - len(incomplete_tamam)
        percent = round((completed / len(tamam_rows)) * 100) if tamam_rows else 0
        rows = [_assistant_item(s, status=r.status) for r, s in (incomplete_tamam if "incomplete" in question or "missed" in question else tamam_rows)]
        return {"answer": f"Today’s Tamam completion is {percent}% ({completed}/{len(tamam_rows)}).", "items": rows}
    if "bus" in question:
        return {"answer": f"{len(bus_trips)} bus trip(s) are listed.", "items": [{"bus": b.bus_number, "destination": b.destination, "status": b.status, "departure": b.departure_at.isoformat()} for b in bus_trips]}
    if "check-in" in question or "check in" in question or "check-out" in question or "check out" in question:
        action = "check_in" if "check-in" in question or "check in" in question else "check_out"
        rows = [_assistant_item(s, occurred_at=r.occurred_at.isoformat(), action=action) for r, s in today_records if r.action == action]
        return {"answer": f"{len(rows)} {action.replace('_', '-')} record(s) today.", "items": rows}
    if "all students" in question or "building" in question or "registered" in question:
        return {"answer": f"{len(all_students)} student(s) are assigned to your buildings.", "items": [_assistant_item(s, building_id=str(s.building_id), room=s.room_number, status=s.current_status) for s in all_students]}
    if "recent" in question or "activity" in question:
        rows = [_assistant_item(s, action=r.action, occurred_at=r.occurred_at.isoformat()) for r, s in today_records[:100]]
        return {"answer": f"Showing {len(rows)} recent access record(s).", "items": rows}
    if any(term in question for term in ("pending", "approval", "guardian")):
        rows = [{"guardian": guardian.full_name, "student": student.full_name, "relationship": link.relationship} for link, guardian, student in pending]
        return {"answer": f"{len(rows)} guardian approval(s) are pending.", "items": rows}
    return {"answer": "Ask about students currently outside, today’s late check-outs, or pending guardian approvals.", "items": []}


@app.post("/student/chat")
def student_chat(
    payload: AssistantQuestion,
    student: models.Student = Depends(require_student),
    database: Session = Depends(get_database),
):
    """A small grounded help assistant for students and their guardians."""
    question = payload.question.lower().strip()
    if any(term in question for term in ("rule", "rules", "allowed", "policy")):
        return {"answer": "Dorm access requires an approved guardian request, successful face verification, and a valid single-use QR code. QR codes expire after five minutes."}
    if any(term in question for term in ("status", "inside", "outside", "where")):
        return {"answer": f"Your current dorm status is: {student.current_status.replace('_', ' ')}."}
    if "bus" in question:
        trips = database.query(models.BusTrip).filter(models.BusTrip.building_id == student.building_id).order_by(models.BusTrip.departure_at).limit(5).all()
        if not trips:
            return {"answer": "There are no bus trips currently listed for your building."}
        return {"answer": "Upcoming bus trips: " + "; ".join(f"{trip.bus_number} to {trip.destination} ({trip.status})" for trip in trips)}
    access = database.query(models.DormAccessRequest).filter(
        models.DormAccessRequest.student_id == student.id,
        models.DormAccessRequest.status.in_(["student_face_pending", "face_pending", "qr_active"]),
    ).order_by(models.DormAccessRequest.created_at.desc()).first()
    if any(term in question for term in ("qr", "code", "request", "check in", "check-in", "check out", "check-out")):
        if access is None:
            return {"answer": "You have no active access request. Ask an approved guardian to submit a check-in or check-out request."}
        return {"answer": f"Your active {access.action.replace('_', ' ')} request is {access.status.replace('_', ' ')}. Complete face verification to receive the QR code."}
    return {"answer": "I can answer questions about your access request, QR code, dorm rules, bus trips, and current check-in status."}


@app.post("/kiosk/guardian/chat")
def guardian_chat(
    payload: GuardianAssistantQuestion,
    database: Session = Depends(get_database),
):
    question = payload.question.lower().strip()
    guardian = database.get(models.Guardian, payload.guardian_id)
    if guardian is None:
        raise HTTPException(status_code=404, detail="Guardian not found")
    linked_students = database.query(models.Student).join(models.GuardianStudentLink).filter(
        models.GuardianStudentLink.guardian_id == guardian.id,
        models.GuardianStudentLink.status == "approved",
    ).all()
    if any(term in question for term in ("rule", "rules", "policy")):
        return {"answer": "Dorm access requires an approved guardian relationship, the student's face verification, and a valid single-use QR code."}
    if "bus" in question:
        return {"answer": "Bus schedules and destinations are shown in the administration Bus Trips section. Ask administration if you need a schedule change."}
    if any(term in question for term in ("status", "inside", "outside", "where")):
        return {"answer": "; ".join(f"{s.full_name}: {s.current_status.replace('_', ' ')}" for s in linked_students) or "No approved students are linked to your account."}
    if any(term in question for term in ("request", "qr", "code", "check in", "check-out", "check out")):
        active = database.query(models.DormAccessRequest).filter(
            models.DormAccessRequest.guardian_id == guardian.id,
            models.DormAccessRequest.status.in_(["student_face_pending", "face_pending", "qr_active"]),
        ).order_by(models.DormAccessRequest.created_at.desc()).first()
        return {"answer": f"Your latest access request is {active.status.replace('_', ' ')} for {active.action.replace('_', ' ')}." if active else "You have no active access request. Select an approved student to send one."}
    return {"answer": "I can answer questions about access requests, QR codes, dorm rules, bus trips, and linked student status."}


@app.get("/buildings/{building_id}/students")
def students(
    building_id: int,
    search: str = Query(default="", max_length=100),
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    assert_assignment(database, supervisor, building_id)
    query = database.query(models.Student).filter(
        models.Student.building_id == building_id
    )
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Student.full_name.ilike(term),
                models.Student.university_id.ilike(term),
                models.Student.room_number.ilike(term),
            )
        )
    total = query.count()
    records = query.order_by(models.Student.full_name).offset(offset).limit(limit).all()
    return {"total": total, "items": [student_dict(student) for student in records]}


@app.get("/buildings/{building_id}/entry-exit")
def entry_exit(
    building_id: int,
    action: str = "all",
    search: str = "",
    record_date: str = "",
    city: str = "",
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    assert_assignment(database, supervisor, building_id)
    query = (
        database.query(models.EntryExitRecord, models.Student, models.Guardian)
        .join(models.Student, models.EntryExitRecord.student_id == models.Student.id)
        .outerjoin(
            models.Guardian,
            models.EntryExitRecord.guardian_id == models.Guardian.id,
        )
        .filter(models.Student.building_id == building_id)
    )
    if action != "all":
        query = query.filter(models.EntryExitRecord.action == action)
    if record_date:
        query = query.filter(func.date(models.EntryExitRecord.occurred_at) == record_date)
    if city:
        query = query.filter(models.Student.city == city)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Student.full_name.ilike(term),
                models.Student.university_id.ilike(term),
            )
        )
    rows = query.order_by(models.EntryExitRecord.occurred_at.desc()).limit(150).all()
    items = []
    for record, student, guardian in rows:
        items.append(
            {
                **student_dict(student),
                "record_id": record.id,
                "guardian_name": guardian.full_name if guardian else "Self",
                "guardian_phone": guardian.phone if guardian else "—",
                "action": record.action,
                "qr_status": record.qr_status,
                "face_status": record.face_status,
                "occurred_at": record.occurred_at.isoformat(),
            }
        )
    total = database.query(models.Student).filter(
        models.Student.building_id == building_id
    ).count()
    inside = database.query(models.Student).filter(
        models.Student.building_id == building_id,
        models.Student.current_status == "inside",
    ).count()
    today_start = datetime.combine(date.today(), datetime.min.time())
    check_ins = (
        database.query(models.EntryExitRecord)
        .join(models.Student)
        .filter(
            models.Student.building_id == building_id,
            models.EntryExitRecord.action == "check_in",
            models.EntryExitRecord.occurred_at >= today_start,
        )
        .count()
    )
    check_outs = (
        database.query(models.EntryExitRecord)
        .join(models.Student)
        .filter(
            models.Student.building_id == building_id,
            models.EntryExitRecord.action == "check_out",
            models.EntryExitRecord.occurred_at >= today_start,
        )
        .count()
    )
    return {
        "summary": {
            "total": total,
            "inside": inside,
            "outside": total - inside,
            "check_ins": check_ins,
            "check_outs": check_outs,
        },
        "items": items,
    }


@app.get("/buildings/{building_id}/tamam")
def tamam(
    building_id: int,
    status: str = "all",
    search: str = "",
    record_date: str = "",
    city: str = "",
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    assert_assignment(database, supervisor, building_id)
    today = record_date or date.today().isoformat()
    query = (
        database.query(models.TamamRecord, models.Student)
        .join(models.Student)
        .filter(
            models.Student.building_id == building_id,
            models.TamamRecord.record_date == today,
        )
    )
    if status != "all":
        query = query.filter(models.TamamRecord.status == status)
    if city:
        query = query.filter(models.Student.city == city)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Student.full_name.ilike(term),
                models.Student.university_id.ilike(term),
            )
        )
    rows = query.order_by(models.Student.full_name).all()
    all_count = database.query(models.TamamRecord).join(models.Student).filter(
        models.Student.building_id == building_id,
        models.TamamRecord.record_date == today,
    ).count()
    completed = database.query(models.TamamRecord).join(models.Student).filter(
        models.Student.building_id == building_id,
        models.TamamRecord.record_date == today,
        models.TamamRecord.status == "completed",
    ).count()
    outside = database.query(models.Student).filter(
        models.Student.building_id == building_id,
        models.Student.current_status == "outside",
    ).count()
    items = [
        {
            **student_dict(student),
            "tamam_status": record.status,
            "verification_method": record.verification_method,
            "completed_at": (
                record.completed_at.isoformat() if record.completed_at else None
            ),
        }
        for record, student in rows
    ]
    return {
        "summary": {
            "total": all_count,
            "completed": completed,
            "not_completed": all_count - completed,
            "outside_with_permit": outside,
            "completion_percent": round(completed * 100 / all_count, 1)
            if all_count
            else 0,
        },
        "items": items,
    }


@app.get("/buildings/{building_id}/bus-trips")
def bus_trips(
    building_id: int,
    record_date: str = "",
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    assert_assignment(database, supervisor, building_id)
    query = database.query(models.BusTrip).filter(models.BusTrip.building_id == building_id)
    if record_date:
        query = query.filter(func.date(models.BusTrip.departure_at) == record_date)
    trips = query.order_by(models.BusTrip.departure_at).all()
    result = []
    for trip in trips:
        expected = database.query(models.BusPassenger).filter(
            models.BusPassenger.trip_id == trip.id
        ).count()
        boarded = database.query(models.BusPassenger).filter(
            models.BusPassenger.trip_id == trip.id,
            models.BusPassenger.status == "boarded",
        ).count()
        result.append(
            {
                "id": trip.id,
                "bus_number": trip.bus_number,
                "destination": trip.destination,
                "departure_at": trip.departure_at.isoformat(),
                "capacity": trip.capacity,
                "status": trip.status,
                "expected": expected,
                "boarded": boarded,
            }
        )
    return result


@app.get("/bus-trips/{trip_id}/passengers")
def bus_passengers(
    trip_id: int,
    record_date: str = "",
    city: str = "",
    search: str = "",
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    trip = database.get(models.BusTrip, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    assert_assignment(database, supervisor, trip.building_id)
    query = (
        database.query(models.BusPassenger, models.Student)
        .join(models.Student)
        .filter(models.BusPassenger.trip_id == trip_id)
    )
    if record_date:
        query = query.filter(func.date(models.BusPassenger.boarded_at) == record_date)
    if city:
        query = query.filter(models.Student.city == city)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(models.Student.full_name.ilike(term), models.Student.university_id.ilike(term), models.Student.email.ilike(term)))
    rows = query.order_by(models.Student.full_name).all()
    return [
        {
            **student_dict(student),
            "passenger_id": passenger.id,
            "boarding_status": passenger.status,
            # Bus boarding uses the student's card/QR scan, not face verification.
            "verification_method": "card_verification" if passenger.verification_method else None,
            "boarded_at": (
                passenger.boarded_at.isoformat() if passenger.boarded_at else None
            ),
        }
        for passenger, student in rows
    ]


@app.get("/buildings/{building_id}/guardian-links")
def guardian_links(
    building_id: int,
    status: str = "all",
    search: str = "",
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    assert_assignment(database, supervisor, building_id)
    query = (
        database.query(
            models.GuardianStudentLink,
            models.Guardian,
            models.Student,
        )
        .join(
            models.Guardian,
            models.GuardianStudentLink.guardian_id == models.Guardian.id,
        )
        .join(
            models.Student,
            models.GuardianStudentLink.student_id == models.Student.id,
        )
        .filter(models.Student.building_id == building_id)
    )
    if status != "all":
        query = query.filter(models.GuardianStudentLink.status == status)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Guardian.full_name.ilike(term),
                models.Student.full_name.ilike(term),
                models.Student.university_id.ilike(term),
            )
        )
    rows = query.order_by(models.GuardianStudentLink.requested_at.desc()).all()
    return [
        {
            "id": link.id,
            "status": link.status,
            "relationship": link.relationship,
            "can_check_in": link.can_check_in,
            "can_check_out": link.can_check_out,
            "requested_at": link.requested_at.isoformat(),
            "reviewed_at": link.reviewed_at.isoformat() if link.reviewed_at else None,
            "supervisor_note": link.supervisor_note,
            "guardian": {
                "id": guardian.id,
                "guardian_code": guardian.guardian_code,
                "full_name": guardian.full_name,
                "emirates_id": guardian.emirates_id,
                "email": guardian.email,
                "phone": guardian.phone,
                "city": guardian.city,
                "face_status": guardian.face_status,
                "identity_match": guardian.identity_match,
            },
            "student": student_dict(student),
        }
        for link, guardian, student in rows
    ]


@app.patch("/guardian-links/{link_id}/review")
def review_guardian_link(
    link_id: int,
    payload: RelationshipReview,
    supervisor: models.Supervisor = Depends(require_supervisor),
    database: Session = Depends(get_database),
):
    if payload.decision not in {"approved", "rejected"}:
        raise HTTPException(
            status_code=422,
            detail="Decision must be approved or rejected",
        )
    link = database.get(models.GuardianStudentLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    student = database.get(models.Student, link.student_id)
    assert_assignment(database, supervisor, student.building_id)
    link.status = payload.decision
    link.supervisor_note = payload.note.strip() or None
    link.reviewed_at = datetime.utcnow()
    guardian = database.get(models.Guardian, link.guardian_id)
    if payload.decision == "approved" and guardian is not None:
        if not guardian.face_image:
            raise HTTPException(status_code=422, detail="A guardian face enrollment photo is required before approval")
        if guardian.guardian_code.startswith("PENDING-"):
            guardian.guardian_code = f"G-{guardian.id:05d}"
        try:
            enroll_guardian_with_face_engine(guardian)
            guardian.face_status = "verified"
        except HTTPException:
            # Do not block the relationship approval when the external face
            # service is temporarily offline. The relationship is approved,
            # while face login remains pending until enrollment succeeds.
            guardian.face_status = "enrollment_pending"
            link.supervisor_note = ((link.supervisor_note or "") + " Face enrollment pending; retry after face service recovery.").strip()
        # Approval grants the two residence actions; current inside/outside
        # status still determines which action is available in the kiosk.
        link.can_check_in = True
        link.can_check_out = True
    elif payload.decision == "rejected":
        link.can_check_in = False
        link.can_check_out = False
    database.commit()
    return {"id": link.id, "status": link.status}


# In production the FastAPI service also serves the built React application.
# Keeping the UI and API on one HTTPS address makes authenticated sessions work
# consistently on every device and supports refreshing any React route.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    if FRONTEND_DIST.exists() and full_path:
        requested_file = (FRONTEND_DIST / full_path).resolve()
        if requested_file.is_relative_to(FRONTEND_DIST) and requested_file.is_file():
            return FileResponse(requested_file)

    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    raise HTTPException(status_code=404, detail="Frontend build not found")
