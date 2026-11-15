@echo off
setlocal
cd /d "%~dp0face_engine"

if not exist ".venv\Scripts\python.exe" (
  echo Face engine is not installed.
  echo Run: py -3.12 -m venv .venv
  echo Then: .venv\Scripts\python.exe -m pip install -r requirements.txt
  pause
  exit /b 1
)

call .venv\Scripts\activate.bat
python -m uvicorn main:app --host 0.0.0.0 --port 8001
