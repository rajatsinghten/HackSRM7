# TokenTrim

Compress your codebase context with Huffman coding & intelligent hashing — so LLMs see more while you pay less.

## Quick Start

### macOS / Linux
```bash
./start-all.sh
```

### Windows
```cmd
start-all.bat
```

## Manual Start (Separate Terminals)

### macOS / Linux

Terminal 1 — Backend:
```bash
cd server
./start.sh
```

Terminal 2 — Frontend:
```bash
cd client
./start.sh
```

### Windows

Command Prompt 1 — Backend:
```cmd
cd server
start.bat
```

Command Prompt 2 — Frontend:
```cmd
cd client
start.bat
```

## Access Points

- 🌐 **Frontend:** http://localhost:5173
- 🔌 **Backend API:** http://localhost:8000
- 📚 **API Docs (Swagger):** http://localhost:8000/docs
- 📖 **API Docs (ReDoc):** http://localhost:8000/redoc

## Manual Setup

### Frontend (React + Vite)

**macOS / Linux:**
```bash
cd client
npm install
npm run dev
```

**Windows:**
```cmd
cd client
npm install
npm run dev
```

### Backend (FastAPI)

**macOS / Linux:**
```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Windows:**
```cmd
cd server
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Project Structure

```
├── client/          # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── server/          # FastAPI backend
│   ├── main.py
│   └── requirements.txt
└── README.md
```

## Tech Stack

**Frontend:**
- React 19
- TypeScript
- Vite
- OGL (WebGL rendering)
- Lucide Icons

**Backend:**
- FastAPI
- Uvicorn
- Pydantic

## Features

✂️ **Huffman Compression** — Variable-length encoding for source files  
🔑 **Smart Hashing** — Replace patterns with compact hash references  
🧠 **Context-Aware Chunking** — Semantic splits at function boundaries  
⚡ **Drop-In Integration** — Works with any agent workflow

---

Built at **HackSRM 7.0**
