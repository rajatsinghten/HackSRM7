#!/bin/bash

# Start TokenTrim Backend
cd "$(dirname "$0")"

echo "🚀 Starting TokenTrim Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -q -r requirements.txt

# Start server
echo "✅ Backend running at http://localhost:8000"
echo "📚 API docs at http://localhost:8000/docs"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
