from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from utils.language import detect_language
from utils.tokens import estimate_tokens

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# ── Pydantic response model ───────────────────────────────────────────────────

class FileAnalysisResponse(BaseModel):
    fileName: str
    fileSize: int
    language: str
    tokenEstimate: int


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="TokenTrim API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default
        "http://localhost:3000",  # Alternative
        "http://localhost:80",    # Production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Welcome to TokenTrim API"}


@app.post("/analyze-file", response_model=FileAnalysisResponse)
async def analyze_file(file: UploadFile = File(...)):
    # ── Size guard (read in chunks to avoid loading huge files fully) ─────────
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the 10 MB limit "
                   f"({len(content) / (1024 * 1024):.2f} MB received).",
        )

    filename = file.filename or "unknown"
    file_size = len(content)

    # ── Language detection ────────────────────────────────────────────────────
    language = detect_language(filename)

    # ── Token estimation (≈ 1 token per 4 characters) ────────────────────────
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        text = content.decode("latin-1", errors="replace")

    token_estimate = estimate_tokens(text)

    return FileAnalysisResponse(
        fileName=filename,
        fileSize=file_size,
        language=language,
        tokenEstimate=token_estimate,
    )
