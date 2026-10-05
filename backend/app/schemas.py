from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)


class AdminStudentCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    university_id: str = Field(min_length=2, max_length=30)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=200)
    building_id: int
    room_number: str = Field(min_length=1, max_length=20)
    is_active: bool = True


class AdminGuardianCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    emirates_id: str = Field(min_length=5, max_length=40)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=200)
    phone: str = Field(min_length=5, max_length=30)
    is_active: bool = True


class DemoTamamCreate(BaseModel):
    """Request sample Daily Tamam rows for both buildings."""
    count_per_building: int = Field(default=100, ge=1, le=300)
    record_date: str | None = None


class RelationshipReview(BaseModel):
    decision: str
    note: str = Field(default="", max_length=1000)


class StudentLoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=160)
    password: str = Field(min_length=8, max_length=200)


class GuardianRequestCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    phone: str = Field(min_length=5, max_length=30)
    relationship: str = Field(min_length=2, max_length=40)
    emirates_id: str = Field(min_length=5, max_length=40)
    city: str = Field(min_length=2, max_length=80)
    face_image: str = Field(min_length=100, max_length=4_000_000)


class AccessRequestCreate(BaseModel):
    action: str


class KioskScanRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class GuardianFaceVerifyRequest(BaseModel):
    # Demo adapter input. A production Raspberry Pi sends the face-engine match.
    guardian_code: str = Field(default="G-20001", min_length=3, max_length=30)


class GuardianBatchAccessRequest(BaseModel):
    guardian_id: int
    student_ids: list[int] = Field(min_length=1, max_length=20)
    action: str
