@echo off
REM Startet den Staebe-Viewer (Stockerau). Doppelklick genuegt.
REM Benoetigt Python mit rhino3dm, fastapi, uvicorn, openpyxl (hier: ..\..\.venv314, sonst System-Python).
cd /d "%~dp0"
set "PY=python"
if exist "%~dp0..\..\.venv314\Scripts\python.exe" set "PY=%~dp0..\..\.venv314\Scripts\python.exe"
echo Oeffne http://127.0.0.1:8000  (Beenden mit Strg+C)
start "" http://127.0.0.1:8000
"%PY%" -m uvicorn app.main:app --port 8000
pause
