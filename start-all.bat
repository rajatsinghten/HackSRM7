@echo off
REM Quick Start Script for TokenTrim (Windows)
REM This script opens two command prompts and starts both services

echo 🚀 Starting TokenTrim...

REM Start backend in new window
start "TokenTrim Backend" cmd /k "cd /d %~dp0server && start.bat"

REM Wait a moment for backend to initialize
timeout /t 2 /nobreak >nul

REM Start frontend in new window
start "TokenTrim Frontend" cmd /k "cd /d %~dp0client && start.bat"

echo ✅ TokenTrim is starting!
echo.
echo 📍 Frontend: http://localhost:5173
echo 📍 Backend:  http://localhost:8000
echo 📍 API Docs: http://localhost:8000/docs
echo.
echo Press any key to exit...
pause >nul
