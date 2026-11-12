@echo off
set "TAMAM_BUILDING_1_POLYGON=[[24.198365,55.676361],[24.198365,55.678721],[24.196205,55.678721],[24.196205,55.676361]]"

set "TAMAM_BUILDING_2_POLYGON=[[24.193942,55.672551],[24.193942,55.675691],[24.191062,55.675691],[24.191062,55.672551]]"
set "FACE_ENGINE_URL=http://127.0.0.1:8001/verify"
setlocal
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo Backend is not installed. Run setup_windows.bat first.
  pause
  exit /b 1
)

call .venv\Scripts\activate.bat
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause

