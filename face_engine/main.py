import base64
import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel


app = FastAPI(title="Residence Face Engine")

DATA_DIRECTORY = Path(__file__).parent / "face_data"
RECORDS_FILE = DATA_DIRECTORY / "records.json"

DATA_DIRECTORY.mkdir(exist_ok=True)

FACE_MATCH_THRESHOLD = float(
    os.getenv("FACE_MATCH_THRESHOLD", "80")
)

FACE_ENGINE_TOKEN = os.getenv(
    "FACE_ENGINE_TOKEN",
    "",
).strip()

FACE_DETECTOR = cv2.CascadeClassifier(
    cv2.data.haarcascades
    + "haarcascade_frontalface_default.xml"
)


class EnrollRequest(BaseModel):
    guardian_code: str | None = None
    subject_code: str | None = None
    face_images: list[str]


class VerifyRequest(BaseModel):
    source: str = "website"
    face_image: str
    expected_code: str | None = None


def check_token(token: str | None) -> None:
    if (
        FACE_ENGINE_TOKEN
        and token != FACE_ENGINE_TOKEN
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid face-engine token",
        )


def load_records() -> dict:
    if not RECORDS_FILE.exists():
        return {}

    content = RECORDS_FILE.read_text(
        encoding="utf-8"
    ).strip()

    if not content:
        return {}

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {}


def save_records(records: dict) -> None:
    temporary_file = (
        DATA_DIRECTORY / "records.tmp"
    )

    temporary_file.write_text(
        json.dumps(records, indent=2),
        encoding="utf-8",
    )

    temporary_file.replace(RECORDS_FILE)


def decode_face(face_image: str) -> np.ndarray:
    try:
        encoded = (
            face_image.split(",", 1)[1]
            if "," in face_image
            else face_image
        )

        image_bytes = base64.b64decode(encoded)
        image_array = np.frombuffer(
            image_bytes,
            dtype=np.uint8,
        )

        image = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR,
        )
    except Exception as reason:
        raise HTTPException(
            status_code=422,
            detail="Invalid face image",
        ) from reason

    if image is None:
        raise HTTPException(
            status_code=422,
            detail="Invalid face image",
        )

    return image


def extract_face(face_image: str) -> np.ndarray:
    image = decode_face(face_image)

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )

    faces = FACE_DETECTOR.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(80, 80),
    )

    if len(faces) == 0:
        raise HTTPException(
            status_code=422,
            detail=(
                "No clear face was detected. "
                "Look directly at the camera."
            ),
        )

    x, y, width, height = max(
        faces,
        key=lambda item: item[2] * item[3],
    )

    face = gray[
        y:y + height,
        x:x + width,
    ]

    face = cv2.resize(face, (200, 200))

    return cv2.equalizeHist(face)


def safe_filename(code: str) -> str:
    return hashlib.sha256(
        code.encode("utf-8")
    ).hexdigest() + ".png"


@app.get("/health")
def health():
    return {
        "status": "online",
        "enrolled_faces": len(load_records()),
    }


@app.post("/enroll")
def enroll(
    payload: EnrollRequest,
    x_face_engine_token: str | None = Header(
        default=None
    ),
):
    check_token(x_face_engine_token)

    code = (
        payload.guardian_code
        or payload.subject_code
        or ""
    ).strip()

    if not code:
        raise HTTPException(
            status_code=422,
            detail=(
                "guardian_code or subject_code "
                "is required"
            ),
        )

    if not payload.face_images:
        raise HTTPException(
            status_code=422,
            detail="At least one face image is required",
        )

    face = extract_face(payload.face_images[0])

    filename = safe_filename(code)
    image_path = DATA_DIRECTORY / filename

    cv2.imwrite(str(image_path), face)

    records = load_records()

    records[code] = {
        "code": code,
        "type": (
            "guardian"
            if payload.guardian_code
            else "student"
        ),
        "image": filename,
    }

    save_records(records)

    return {
        "enrolled": True,
        "code": code,
    }


@app.post("/verify")
def verify(
    payload: VerifyRequest,
    x_face_engine_token: str | None = Header(
        default=None
    ),
):
    check_token(x_face_engine_token)

    captured_face = extract_face(
        payload.face_image
    )

    records = load_records()

    candidates = []

    for code, record in records.items():
        if (
            payload.expected_code
            and code != payload.expected_code
        ):
            continue
        if (
            not payload.expected_code
            and record["type"] != "guardian"
        ):
            continue

        image_path = (
            DATA_DIRECTORY / record["image"]
        )

        stored_face = cv2.imread(
            str(image_path),
            cv2.IMREAD_GRAYSCALE,
        )

        if stored_face is not None:
            candidates.append(
                (code, record, stored_face)
            )

    if not candidates:
        return {
            "verified": False,
            "identity_match": 0,
        }

    training_images = []
    training_labels = []
    label_records = {}

    for label, candidate in enumerate(candidates):
        code, record, stored_face = candidate

        training_images.extend(
            [
                stored_face,
                cv2.equalizeHist(stored_face),
                cv2.flip(stored_face, 1),
            ]
        )

        training_labels.extend(
            [label, label, label]
        )

        label_records[label] = (
            code,
            record,
        )

    recognizer = (
        cv2.face.LBPHFaceRecognizer_create()
    )

    recognizer.train(
        training_images,
        np.array(training_labels),
    )

    predicted_label, distance = (
        recognizer.predict(captured_face)
    )

    verified = (
        distance <= FACE_MATCH_THRESHOLD
        and predicted_label in label_records
    )

    if not verified:
        return {
            "verified": False,
            "identity_match": max(
                0,
                round(100 - distance),
            ),
        }

    code, record = label_records[
        predicted_label
    ]

    result = {
        "verified": True,
        "identity_match": max(
            0,
            min(100, round(100 - distance)),
        ),
    }

    if record["type"] == "guardian":
        result["guardian_code"] = code
    else:
        result["subject_code"] = code

    return result
