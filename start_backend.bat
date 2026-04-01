@echo off
cd statbot_backend
echo Starting StatBot Pro Backend (FastAPI)...
..\.venv\Scripts\uvicorn api:app --reload --host 0.0.0.0 --port 8000
