@echo off
setlocal
cd /d "%~dp0"

echo Creating Python environment...
cd backend
py -3.12 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
python seed.py

echo.
echo Installing frontend packages...
cd ..\frontend
call npm install

echo.
echo Setup complete.
echo Run start_backend.bat and start_frontend.bat in separate windows.
pause

