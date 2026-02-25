#!/bin/bash

# Start TokenTrim Frontend
cd "$(dirname "$0")"

echo "🚀 Starting TokenTrim Frontend..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start dev server
echo "✅ Frontend running at http://localhost:5173"
npm run dev
