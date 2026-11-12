from sqlalchemy import inspect, text

from app.database import engine


with engine.begin() as connection:
    columns = {
        column["name"]
        for column in inspect(connection).get_columns("students")
    }

    if "rfid_uid" not in columns:
        connection.execute(
            text(
                "ALTER TABLE students "
                "ADD COLUMN rfid_uid VARCHAR(50)"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ix_students_rfid_uid ON students (rfid_uid)"
            )
        )
        print("RFID column added successfully.")
    else:
        print("RFID column already exists.")