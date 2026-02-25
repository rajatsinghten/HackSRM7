@echo off
REM Start TokenTrim Frontend (Windows)
cd /d "%~dp0"

echo 🚀 Starting TokenTrim Frontend...

REM Check if node_modules exists
if not exist "node_modules\" (
    echo 📦 Installing dependencies...
    call npm install
)

REM Start dev server
echo ✅ Frontend running at http://localhost:5173
call npm run dev
