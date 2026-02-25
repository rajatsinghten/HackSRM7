@echo off
REM Start TokenTrim Backend (Windows)
cd /d "%~dp0"

echo 🚀 Starting TokenTrim Backend...

REM Check if virtual environment exists
if not exist "venv\" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Upgrade pip quietly
python -m pip install --upgrade pip -q

REM Install dependencies
echo 📥 Installing dependencies...
pip install -q -r requirements.txt

REM Start server
echo ✅ Backend running at http://localhost:8000
echo 📚 API docs at http://localhost:8000/docs
uvicorn main:app --reload --host 0.0.0.0 --port 8000
