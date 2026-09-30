@echo off
setlocal
cd /d "%~dp0frontend"

if not exist "node_modules" (
  echo Frontend is not installed. Run setup_windows.bat first.
  pause
  exit /b 1
)

call npm run dev
pause

