import hashlib
import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

random.seed(20260908)
DATABASE_PATH = Path(__file__).with_name("hostel.db")
NOW = datetime.now()

FIRST_NAMES = [
    "Aisha", "Alya", "Amal", "Dana", "Fatima", "Hala", "Hessa", "Laila",
    "Latifa", "Mariam", "Maryam", "Meera", "Noura", "Reem", "Salma",
    "Sara", "Shaikha", "Yasmin", "Zahra", "Zainab",
]
LAST_NAMES = [
    "Abbas", "Abdullah", "Ahmed", "Ali", "Almansoori", "Almarri",
    "Almazrouei", "Alnaqbi", "Alshamsi", "Alsuwaidi", "Hassan", "Ibrahim",
    "Khalid", "Mahmoud", "Nasser", "Omar", "Rashid", "Saeed", "Saleh",
    "Yousef",
]
DESTINATIONS = [
    "Al Shahama",
    "Khor Fakkan",
    "Bani Yas",
    "Al Ain",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Fujairah",
    "Ras Al Khaimah",
    "Umm Al Quwain",
    "Khalifa City",
    "Mohammed Bin Zayed City",
    "Mussafah",
    "Al Rahba",
    "Al Samha",
    "Madinat Zayed",
    "Ruwais",
    "Ghayathi",
    "Madinat Al Riyad",
    "Dubai", 
]


CITIES = DESTINATIONS.copy()
RELATIONSHIPS = ["Father", "Mother", "Brother", "Sister", "Uncle", "Aunt"]

DEMO_CARD_UIDS = [
    "23 01 3F 21",
    "D2 F0 B7 03",
    "95 AD D3 06",
]

DEMO_PASSENGER_INDEXES = [
    29,
    19,
    0,
]
DEMO_FINGERPRINT_STUDENTS = {
    (1, 1): ("Mariam Barashed", 1),
    (1, 5): ("Mariam Nasser", 2),
    (1, 7): ("Alya Alderei", 3),
    (2, 1): ("Fatima Almansoori", 4),
    (2, 5): ("Latifa Albedwawi", 5),
}
DEMO_STUDENT_PHONES = {
    "Mariam Barashed": "0558262125",
    "Mariam Nasser": "0506104044",
    "Alya Alderei": "0503023343",
    "Fatima Almansoori": "0522737383",
    "Latifa Albedwawi": "0566558854",
}
SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE buildings (
 id INTEGER PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL, is_active BOOLEAN NOT NULL);
CREATE TABLE supervisors (
 id INTEGER PRIMARY KEY, full_name VARCHAR(120) NOT NULL,
 email VARCHAR(160) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 role VARCHAR(50) NOT NULL, is_active BOOLEAN NOT NULL);
CREATE TABLE supervisor_buildings (
 id INTEGER PRIMARY KEY, supervisor_id INTEGER NOT NULL REFERENCES supervisors(id),
 building_id INTEGER NOT NULL REFERENCES buildings(id));
CREATE TABLE session_tokens (
 id INTEGER PRIMARY KEY, supervisor_id INTEGER NOT NULL REFERENCES supervisors(id),
 token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL);
CREATE TABLE audit_logs (
 id INTEGER PRIMARY KEY, event_type VARCHAR(80) NOT NULL,
 entity_type VARCHAR(80) NOT NULL, entity_id INTEGER,
 occurred_at DATETIME NOT NULL, details TEXT NOT NULL);
CREATE TABLE students (
 id INTEGER PRIMARY KEY, university_id VARCHAR(30) NOT NULL UNIQUE,
 rfid_uid VARCHAR(50) UNIQUE,
 fingerprint_id INTEGER UNIQUE,
 full_name VARCHAR(120) NOT NULL, email VARCHAR(160) NOT NULL UNIQUE,
 phone VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL,
 building_id INTEGER NOT NULL REFERENCES buildings(id),
 room_number VARCHAR(20) NOT NULL, current_status VARCHAR(20) NOT NULL,
 is_active BOOLEAN NOT NULL);
CREATE TABLE student_credentials (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
 password_hash VARCHAR(255) NOT NULL);
CREATE TABLE student_sessions (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
 token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL);
CREATE TABLE guardians (
 id INTEGER PRIMARY KEY, guardian_code VARCHAR(30) NOT NULL UNIQUE,
 full_name VARCHAR(120) NOT NULL, emirates_id VARCHAR(40) NOT NULL UNIQUE,
 email VARCHAR(160) NOT NULL UNIQUE, phone VARCHAR(30) NOT NULL,
 city VARCHAR(80) NOT NULL, relationship VARCHAR(40) NOT NULL DEFAULT '', face_image TEXT, face_status VARCHAR(30) NOT NULL,
 identity_match INTEGER NOT NULL);
CREATE TABLE guardian_student_links (
 id INTEGER PRIMARY KEY, guardian_id INTEGER NOT NULL REFERENCES guardians(id),
 student_id INTEGER NOT NULL REFERENCES students(id), relationship VARCHAR(40) NOT NULL,
 status VARCHAR(30) NOT NULL, can_check_in BOOLEAN NOT NULL,
 can_check_out BOOLEAN NOT NULL, requested_at DATETIME NOT NULL,
 reviewed_at DATETIME, supervisor_note TEXT);
CREATE TABLE entry_exit_records (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
 guardian_id INTEGER REFERENCES guardians(id), action VARCHAR(20) NOT NULL,
 qr_status VARCHAR(30) NOT NULL, face_status VARCHAR(30) NOT NULL,
 occurred_at DATETIME NOT NULL);
CREATE TABLE dorm_access_requests (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
 guardian_id INTEGER NOT NULL REFERENCES guardians(id), action VARCHAR(20) NOT NULL,
 status VARCHAR(30) NOT NULL, face_verified BOOLEAN NOT NULL,
 qr_token_hash VARCHAR(64) UNIQUE, created_at DATETIME NOT NULL,
 expires_at DATETIME, used_at DATETIME);
CREATE TABLE tamam_records (
 id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
 record_date VARCHAR(10) NOT NULL, status VARCHAR(30) NOT NULL,
 verification_method VARCHAR(40), completed_at DATETIME);
CREATE TABLE bus_trips (
 id INTEGER PRIMARY KEY, building_id INTEGER NOT NULL REFERENCES buildings(id),
 bus_number VARCHAR(30) NOT NULL, destination VARCHAR(120) NOT NULL,
 departure_at DATETIME NOT NULL, capacity INTEGER NOT NULL,
 status VARCHAR(30) NOT NULL);
CREATE TABLE bus_passengers (
 id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES bus_trips(id),
 student_id INTEGER NOT NULL REFERENCES students(id), status VARCHAR(30) NOT NULL,
 verification_method VARCHAR(50), boarded_at DATETIME);
CREATE INDEX ix_students_building_id ON students(building_id);
CREATE INDEX ix_students_full_name ON students(full_name);
CREATE INDEX ix_entry_exit_occurred_at ON entry_exit_records(occurred_at);
CREATE INDEX ix_tamam_date ON tamam_records(record_date);
CREATE INDEX ix_guardian_link_status ON guardian_student_links(status);
"""


def password_hash(password: str) -> str:
    salt = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 310_000
    ).hex()
    return f"{salt}:{digest}"


def unique_name(index: int) -> str:
    first = FIRST_NAMES[index % len(FIRST_NAMES)]
    last = LAST_NAMES[(index // len(FIRST_NAMES)) % len(LAST_NAMES)]
    return f"{first} {last}"


def iso(value: datetime | None) -> str | None:
    return value.isoformat(sep=" ") if value else None


def seed() -> None:
    if DATABASE_PATH.exists():
        DATABASE_PATH.unlink()
    database = sqlite3.connect(DATABASE_PATH)
    database.executescript(SCHEMA)
    cursor = database.cursor()

    cursor.executemany(
        "INSERT INTO buildings VALUES (?, ?, ?, ?)",
        [(1, "B1", "Building 1", 1), (2, "B2", "Building 2", 1)],
    )
    cursor.execute(
        "INSERT INTO supervisors VALUES (?, ?, ?, ?, ?, ?)",
        (
            1, "Mariam Saeed", "mariam.saeed@hostel.local",
            password_hash("Supervisor123!"), "Dorm Supervisor", 1,
        ),
    )
    cursor.executemany(
        "INSERT INTO supervisor_buildings VALUES (?, ?, ?)",
        [(1, 1, 1), (2, 1, 2)],
    )
    demo_student_password = password_hash("Student123!")

    for building_id in (1, 2):
        for local_index in range(300):
            global_index = (building_id - 1) * 300 + local_index
            item_id = global_index + 1
            full_name = "Sara Ahmed" if global_index == 0 else unique_name(global_index)
            fingerprint_id = None
            demo_fingerprint_student = DEMO_FINGERPRINT_STUDENTS.get((building_id, local_index))
            if demo_fingerprint_student is not None: full_name, fingerprint_id = demo_fingerprint_student
            email_name = full_name.lower().replace(" ", ".")
            student_phone = DEMO_STUDENT_PHONES.get(full_name,f"050{1000000 + item_id:07d}",)
            floor = local_index // 60 + 1
            room = floor * 100 + (local_index % 60) // 2 + 1
            student_status = "outside" if local_index % 2 == 0 else "inside"       
            cursor.execute(
                "INSERT INTO students VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item_id, f"U2026{item_id:04d}", None, fingerprint_id, full_name,
                    f"{email_name}.{item_id}@student.hostel.local",
                    student_phone,
                    CITIES[global_index % len(CITIES)], building_id,
                    str(room), student_status, 1,
                ),
            )
            cursor.execute(
                "INSERT INTO student_credentials VALUES (?, ?, ?)",
                (item_id, item_id, demo_student_password),
            )
            if global_index == 0:
             guardian_name = "Ahmed Hassan"
            else:
              base_guardian_name = unique_name(global_index)

              guardian_name = (f"{base_guardian_name} "f"{LAST_NAMES[(global_index + 7)% len(LAST_NAMES)]}")
            face_status = "failed" if local_index in {8, 151} else "verified"
            cursor.execute(
                "INSERT INTO guardians VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item_id, f"G-{20000 + item_id}", guardian_name,
                    f"784-1990-{1000000 + item_id:07d}-1",
                    f"guardian.{item_id}@example.local",
                    f"055{2000000 + item_id:07d}",
                    CITIES[(global_index + 2) % len(CITIES)],
                    RELATIONSHIPS[global_index % len(RELATIONSHIPS)],
                    "seed-face-enrollment",
                    face_status, random.randint(91, 99),
                ),
            )
            link_status = (
                "approved" if local_index == 0
                else "pending" if local_index < 7
                else "rejected" if local_index in {8, 9}
                else "approved"
            )
            cursor.execute(
                "INSERT INTO guardian_student_links VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item_id, item_id, item_id,
                    RELATIONSHIPS[global_index % len(RELATIONSHIPS)],
                    link_status, 1, 1,
                    iso(NOW - timedelta(days=local_index % 10)),
                    None if link_status == "pending"
                    else iso(NOW - timedelta(hours=local_index % 24)),
                    None,
                ),
            )
            tamam_completed = local_index % 2 == 0
            tamam_time = datetime.now().replace(
                hour=21, minute=(local_index * 7) % 60,
                second=0, microsecond=0,
            )
            cursor.execute(
                "INSERT INTO tamam_records VALUES (?, ?, ?, ?, ?, ?)",
                (
                    item_id, item_id,datetime.now().date().isoformat(),
                    "completed" if tamam_completed else "not_completed",
                    "fingerprint" if tamam_completed else None,
                    iso(tamam_time) if tamam_completed else None,
                ),
            )
            cursor.execute(
                "INSERT INTO entry_exit_records VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    item_id, item_id, item_id,
                    "check_out" if student_status == "outside" else "check_in",
                    "used",
                    "failed" if local_index in {23, 177} else "verified",
                    iso(NOW - timedelta(days=global_index % 14, minutes=global_index * 3)),
                ),
            )

    # Ahmed Hassan (G-20001) is linked only to his daughter, Sara Ahmed (U20260001).
    # The guardian kiosk queries approved links, so it will display only Sara for him.
    trip_id = 0
    passenger_id = 0

    for building_id in (1, 2):
        inside_student_ids = [
            row[0]
            for row in cursor.execute(
                """
                SELECT id
                FROM students
                WHERE building_id = ?
                  AND current_status = 'inside'
                ORDER BY id
                """,
                (building_id,),
            ).fetchall()
        ]

        # Keep the same three demo students and cards,
        # but place them in the first three bus areas.
        if building_id == 1:
            for demo_index in range(3):
                old_position = (
                    demo_index * 30
                    + DEMO_PASSENGER_INDEXES[
                        demo_index
                    ]
                )

                demo_student_id = (
                    inside_student_ids[
                        old_position
                    ]
                )

                cursor.execute(
                    """
                    UPDATE students
                    SET rfid_uid = ?,
                        city = ?
                    WHERE id = ?
                    """,
                    (
                        DEMO_CARD_UIDS[demo_index],
                        DESTINATIONS[demo_index],
                        demo_student_id,
                    ),
                )

        trips_by_destination = {}

        for trip_index, destination in enumerate(
            DESTINATIONS
        ):
            trip_id += 1

            departure = NOW.replace(
                hour=16,
                minute=30,
                second=0,
                microsecond=0,
            )

            cursor.execute(
                """
                INSERT INTO bus_trips
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trip_id,
                    building_id,
                    (
                        f"Bus "
                        f"{(building_id - 1) * 20 + trip_index + 1:02d}"
                    ),
                    destination,
                    iso(departure),
                    30,
                    (
                        "boarding"
                        if trip_index < 3
                        else "scheduled"
                    ),
                ),
            )

            trips_by_destination[
                destination
            ] = (
                trip_id,
                departure,
            )

        students = cursor.execute(
            """
            SELECT id, city
            FROM students
            WHERE building_id = ?
            ORDER BY id
            """,
            (building_id,),
        ).fetchall()

        for student_id, student_area in students:
            assigned_trip = (
                trips_by_destination.get(
                    student_area
                )
            )

            if assigned_trip is None:
                continue

            assigned_trip_id, departure = (
                assigned_trip
            )

            passenger_id += 1

            cursor.execute(
                """
                INSERT INTO bus_passengers
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    passenger_id,
                    assigned_trip_id,
                    student_id,
                    "not_boarded",
                    None,
                    None,
                ),
            )

    database.commit()
    counts = {
        table: database.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in (
            "buildings", "students", "student_credentials", "guardians",
            "guardian_student_links", "entry_exit_records",
            "dorm_access_requests", "tamam_records", "bus_trips", "bus_passengers",
        )
    }
    database.close()
    print("Demo database created:", counts)
    print("Login: mariam.saeed@hostel.local / Supervisor123!")


if __name__ == "__main__":
    seed()
