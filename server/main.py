from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from utils.language import detect_language
from utils.tokens import estimate_tokens
from engine.pipeline import compress_to_dict

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# ── Pydantic response models ─────────────────────────────────────────────────

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


# ── Existing analysis endpoint ────────────────────────────────────────────────

@app.post("/analyze-file", response_model=FileAnalysisResponse)
async def analyze_file(file: UploadFile = File(...)):
    """Quick file analysis — language detection + token estimate."""
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the 10 MB limit "
                   f"({len(content) / (1024 * 1024):.2f} MB received).",
        )

    filename = file.filename or "unknown"
    file_size = len(content)

    language = detect_language(filename)

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


# ── COMPRESSION endpoint (full pipeline) ─────────────────────────────────────

@app.post("/compress")
async def compress_file(
    file: UploadFile = File(...),
    aggressive: bool = False,
) -> Dict[str, Any]:
    """
    Run the full TokenTrim compression pipeline on an uploaded file.

    Returns Huffman stats, minified code, semantic chunks, three summary
    levels (skeleton / architecture / compressed), hash decode map,
    and a decode preamble for LLM use.

    Query params:
      - aggressive (bool): if true, collapse indentation and remove all blanks.
    """
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the 10 MB limit "
                   f"({len(content) / (1024 * 1024):.2f} MB received).",
        )

    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        text = content.decode("latin-1", errors="replace")

    filename = file.filename or "unknown"
    language = detect_language(filename)

    result = compress_to_dict(
        text=text,
        filename=filename,
        language=language,
        aggressive_minify=aggressive,
    )

    return result


# ── DECODE endpoint ───────────────────────────────────────────────────────────

@app.post("/decode")
async def decode_hash_references(
    body: Dict[str, Any],
) -> Dict[str, str]:
    """
    Expand hash references in compressed code using a decode map.

    Expects JSON body:
    {
      "code": "<compressed code with #hash refs>",
      "decodeMap": { "#abc123": "original pattern", ... }
    }
    """
    code = body.get("code", "")
    decode_map = body.get("decodeMap", {})

    if not code:
        raise HTTPException(status_code=400, detail="Missing 'code' field.")

    expanded = code
    for key, pattern in decode_map.items():
        expanded = expanded.replace(key, pattern)

    return {"decoded": expanded}
