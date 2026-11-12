import time

import requests
import serial


SERIAL_PORT = "COM4"
BAUD_RATE = 9600

API_URL = "http://127.0.0.1:8000"

EMAIL = "mariam.saeed@hostel.local"
PASSWORD = "Supervisor123!"


session = requests.Session()

print("Logging in to the website database...")

login = session.post(
    f"{API_URL}/auth/login",
    json={
        "email": EMAIL,
        "password": PASSWORD,
    },
    timeout=10,
)

login.raise_for_status()

print("Connected.")
print(f"Listening to Arduino on {SERIAL_PORT}...")


arduino = serial.Serial(
    SERIAL_PORT,
    BAUD_RATE,
    timeout=1,
)

time.sleep(2)


last_event = ""
last_event_time = 0


while True:
    line = (
        arduino.readline()
        .decode("utf-8", errors="ignore")
        .strip()
    )

    endpoint = ""
    payload = {}
    event_key = ""

    if line.startswith("UID:"):
        uid = " ".join(
            line.replace("UID:", "")
            .strip()
            .upper()
            .split()
        )

        endpoint = "/rfid-scan"
        payload = {"uid": uid}
        event_key = f"RFID:{uid}"

        print(f"RFID card scanned: {uid}")

    elif line.startswith("FINGER_ID:"):
        try:
            fingerprint_id = int(
                line.replace("FINGER_ID:", "").strip()
            )
        except ValueError:
            print("Invalid fingerprint ID received.")
            continue

        endpoint = "/fingerprint-scan"
        payload = {
            "fingerprint_id": fingerprint_id,
        }
        event_key = f"FINGER:{fingerprint_id}"

        print(f"Fingerprint scanned: {fingerprint_id}")

    else:
        continue

    current_time = time.time()

    if (
        event_key == last_event
        and current_time - last_event_time < 3
    ):
        continue

    last_event = event_key
    last_event_time = current_time

    try:
        response = session.post(
            f"{API_URL}{endpoint}",
            json=payload,
            timeout=10,
        )

        if not response.ok:
            try:
                error_message = response.json().get(
                    "detail",
                    response.text,
                )
            except ValueError:
                error_message = response.text

            print(f"Request failed: {error_message}")
            continue

        result = response.json()

        print(result["message"])

        if result["success"]:
            print(f"Student: {result['student']}")

            if endpoint == "/rfid-scan":
                print(f"Bus: {result['destination']}")
                print(
                    f"Boarded: "
                    f"{result['boarded']}/{result['expected']}"
                )

            elif endpoint == "/fingerprint-scan":
                print(
                    f"Building: {result['building_id']}"
                )
                print("Tamam status: Completed")

            print("Website updated successfully.")

    except requests.RequestException as error:
        print(f"Website connection error: {error}")