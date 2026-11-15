#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/face_engine"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
fi

exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001
