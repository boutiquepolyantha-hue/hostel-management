# Hostel Access Management System

Complete demonstration system for two hostel buildings with 300 fictional students per building.

## Included

- Supervisor login and building selection
- Building overview dashboard
- Student entry and exit monitoring
- Daily Tamam attendance
- Bus trip boarding monitoring
- Guardian/student relationship approvals
- Student login, dashboard, digital ID and profile
- Dorm entry/exit request with browser camera capture
- Five-minute, single-use QR access tokens
- Student kiosk scanner screen for USB QR scanners
- Guardian reception kiosk with face identification, linked-student selection,
  batch check-in/check-out requests and permission enforcement
- 600 generated fictional students, guardians, activity records, Tamam records and bus passengers
- React + TypeScript frontend
- FastAPI + SQLite backend

## Requirements

- Python 3.12
- Node.js 20 or newer

## Windows setup

### Backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python seed.py
python -m uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/docs

### Frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite.

## Demo supervisor

- Email: `mariam.saeed@hostel.local`
- Password: `Supervisor123!`

## Demo student

- Student ID: `U20260001`
- Password: `Student123!`
- Name: Sara Ahmed
- Initial status: outside
- Approved guardian: Ahmed Hassan

All generated students use the demonstration password `Student123!`.

## Guardian reception kiosk

Open `http://localhost:5173/kiosk/guardian` on the guardian-facing machine.

The demonstration sequence is:

1. Start the camera and capture the guardian face.
2. The demo face adapter identifies guardian `G-20001` (Ahmed Hassan).
3. Select one or more of that guardian's approved linked students.
4. Select the one action all selected students are currently allowed to perform.
5. Send the requests.
6. Each student signs in and opens **Dorm Access**.
7. The student completes face verification; only then is their individual,
   five-minute, single-use QR generated.
8. Scan that QR at `http://localhost:5173/kiosk/student`.

The backend independently checks the approved relationship, check-in/check-out
permission and current residence state for every selected student.

## Student kiosk

Open `http://localhost:5173/kiosk/student` on the Raspberry Pi kiosk.
A USB QR scanner normally acts like a keyboard: keep the scanner-input field
focused, scan the student's QR, and the form will validate the one-time token.

## Important face-verification note

The browser screen requests camera permission and captures the live camera flow.
The included guardian and student verification endpoints are clearly marked
demonstration adapters so the workflow can be tested without paid services.
The camera preview is real, but the package does not perform biometric matching.
Before deployment, connect the endpoints to an on-device face-embedding and
liveness service on the Raspberry Pi. Never use demonstration verification as
a real security control, never store raw face images, and obtain the required
consent and institutional approval.

All generated names, phone numbers and addresses are fictional demonstration data.
