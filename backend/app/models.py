from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Supervisor(Base):
    __tablename__ = "supervisors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="Dorm Supervisor")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SupervisorBuilding(Base):
    __tablename__ = "supervisor_buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supervisor_id: Mapped[int] = mapped_column(ForeignKey("supervisors.id"))
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"))


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supervisor_id: Mapped[int] = mapped_column(ForeignKey("supervisors.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    university_id: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), index=True)
    email: Mapped[str] = mapped_column(String(160), unique=True)
    phone: Mapped[str] = mapped_column(String(30))
    city: Mapped[str] = mapped_column(String(80))
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), index=True)
    room_number: Mapped[str] = mapped_column(String(20))
    current_status: Mapped[str] = mapped_column(String(20), default="inside")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StudentCredential(Base):
    __tablename__ = "student_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id"),
        unique=True,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(String(255))


class StudentSession(Base):
    __tablename__ = "student_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Guardian(Base):
    __tablename__ = "guardians"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guardian_code: Mapped[str] = mapped_column(String(30), unique=True)
    full_name: Mapped[str] = mapped_column(String(120), index=True)
    emirates_id: Mapped[str] = mapped_column(String(40), unique=True)
    email: Mapped[str] = mapped_column(String(160), unique=True)
    phone: Mapped[str] = mapped_column(String(30))
    city: Mapped[str] = mapped_column(String(80))
    # Enrollment image captured by the student for the guardian's later kiosk match.
    # The face engine should store its template separately in production.
    face_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    face_status: Mapped[str] = mapped_column(String(30), default="verified")
    identity_match: Mapped[int] = mapped_column(Integer, default=95)


class GuardianStudentLink(Base):
    __tablename__ = "guardian_student_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guardian_id: Mapped[int] = mapped_column(ForeignKey("guardians.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    relationship: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    can_check_in: Mapped[bool] = mapped_column(Boolean, default=True)
    can_check_out: Mapped[bool] = mapped_column(Boolean, default=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    supervisor_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class EntryExitRecord(Base):
    __tablename__ = "entry_exit_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    guardian_id: Mapped[int | None] = mapped_column(ForeignKey("guardians.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(20))
    qr_status: Mapped[str] = mapped_column(String(30))
    face_status: Mapped[str] = mapped_column(String(30))
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class DormAccessRequest(Base):
    __tablename__ = "dorm_access_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    guardian_id: Mapped[int] = mapped_column(ForeignKey("guardians.id"), index=True)
    action: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(30), default="face_pending")
    face_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    qr_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TamamRecord(Base):
    __tablename__ = "tamam_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    record_date: Mapped[str] = mapped_column(String(10), index=True)
    status: Mapped[str] = mapped_column(String(30), default="not_completed")
    verification_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class BusTrip(Base):
    __tablename__ = "bus_trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), index=True)
    bus_number: Mapped[str] = mapped_column(String(30))
    destination: Mapped[str] = mapped_column(String(120))
    departure_at: Mapped[datetime] = mapped_column(DateTime)
    capacity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="scheduled")


class BusPassenger(Base):
    __tablename__ = "bus_passengers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("bus_trips.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="not_boarded")
    verification_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    boarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
