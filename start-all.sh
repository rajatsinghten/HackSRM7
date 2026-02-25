#!/bin/bash

# Quick Start Script for TokenTrim (macOS/Linux)
# This script opens two terminal tabs and starts both services

echo "🚀 Starting TokenTrim..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e 'tell application "Terminal" to do script "cd '"$PWD"'/server && ./start.sh"'
    sleep 2
    osascript -e 'tell application "Terminal" to do script "cd '"$PWD"'/client && ./start.sh"'
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - try common terminal emulators
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal --tab -- bash -c "cd $PWD/server && ./start.sh; exec bash"
        sleep 2
        gnome-terminal --tab -- bash -c "cd $PWD/client && ./start.sh; exec bash"
    elif command -v xterm &> /dev/null; then
        xterm -e "cd $PWD/server && ./start.sh" &
        sleep 2
        xterm -e "cd $PWD/client && ./start.sh" &
    else
        echo "Please open two terminals manually and run:"
        echo "  Terminal 1: cd server && ./start.sh"
        echo "  Terminal 2: cd client && ./start.sh"
        exit 1
    fi
else
    echo "Unsupported OS. Please use start-all.bat on Windows."
    exit 1
fi

echo "✅ TokenTrim is starting!"
echo ""
echo "📍 Frontend: http://localhost:5173"
echo "📍 Backend:  http://localhost:8000"
echo "📍 API Docs: http://localhost:8000/docs"
