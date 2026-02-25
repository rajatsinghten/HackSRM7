from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from utils.language import detect_language
from utils.tokens import estimate_tokens
from engine.pipeline import compress_to_dict
from engine.lossless import (
    lossless_encode,
    lossless_decode_from_dict,
    LosslessBundle,
    verify_roundtrip,
)

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
        "http://localhost:5174",  # Vite fallback
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


# ── PIPELINE: raw merge ───────────────────────────────────────────────────────

_SEP = "\n" + "═" * 60 + "\n"


@app.post("/pipeline/raw", response_class=PlainTextResponse)
async def pipeline_raw(
    chat: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
) -> str:
    """
    Pipeline 1 — Raw (uncompressed) context bundle.

    Merges the chat transcript and the raw contents of every attached file
    into a single plain-text document ready to paste into any LLM.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    total_tokens = 0

    sections: List[str] = []
    sections.append(
        f"╔══════════════════════════════════════════════════════╗\n"
        f"║        TOKENTRIM  ·  RAW CONTEXT BUNDLE              ║\n"
        f"╚══════════════════════════════════════════════════════╝\n"
        f"Generated : {now}\n"
        f"Files     : {len(files)}\n"
        f"Mode      : Uncompressed (original content)"
    )

    # ── Chat section ─────────────────────────────────────────────────────────
    if chat.strip():
        chat_tokens = estimate_tokens(chat)
        total_tokens += chat_tokens
        sections.append(
            f"[ CHAT ]  ({chat_tokens:,} tokens)\n"
            + "-" * 40 + "\n"
            + chat.strip()
        )

    # ── File sections ─────────────────────────────────────────────────────────
    for idx, upload in enumerate(files, start=1):
        raw = await upload.read(MAX_FILE_SIZE + 1)
        if len(raw) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename}: exceeds 10 MB limit.",
            )
        try:
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            text = raw.decode("latin-1", errors="replace")

        filename = upload.filename or f"file_{idx}"
        language = detect_language(filename)
        file_tokens = estimate_tokens(text)
        total_tokens += file_tokens

        sections.append(
            f"[ FILE {idx}: {filename} ]  language={language}  ({file_tokens:,} tokens)\n"
            + "-" * 40 + "\n"
            + text.rstrip()
        )

    # ── Footer ────────────────────────────────────────────────────────────────
    sections.append(f"[ END OF BUNDLE ]  Total estimated tokens: {total_tokens:,}")

    return _SEP.join(sections)


# ── PIPELINE: compressed merge ────────────────────────────────────────────────

@app.post("/pipeline/compressed", response_class=PlainTextResponse)
async def pipeline_compressed(
    chat: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
    aggressive: bool = False,
) -> str:
    """
    Pipeline 2 — Compressed context bundle.

    Runs the full TokenTrim compression pipeline on each file, then merges
    the best-level compressed output together with the chat transcript into
    a single plain-text document.  A decode preamble is prepended so any LLM
    can expand hash references on the fly.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    original_total = 0
    compressed_total = 0

    # ── Compress all files first so we can compute aggregate stats ────────────
    file_reports = []
    for idx, upload in enumerate(files, start=1):
        raw = await upload.read(MAX_FILE_SIZE + 1)
        if len(raw) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename}: exceeds 10 MB limit.",
            )
        try:
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            text = raw.decode("latin-1", errors="replace")

        filename = upload.filename or f"file_{idx}"
        language = detect_language(filename)
        report = compress_to_dict(
            text=text,
            filename=filename,
            language=language,
            aggressive_minify=aggressive,
        )
        original_total += report["originalTokens"]
        compressed_total += report["bestTokens"]
        file_reports.append((idx, filename, report))

    chat_tokens = estimate_tokens(chat) if chat.strip() else 0
    overall_pct = (
        round((1 - compressed_total / original_total) * 100, 1)
        if original_total > 0
        else 0.0
    )

    sections: List[str] = []
    sections.append(
        f"╔══════════════════════════════════════════════════════╗\n"
        f"║     TOKENTRIM  ·  COMPRESSED CONTEXT BUNDLE          ║\n"
        f"╚══════════════════════════════════════════════════════╝\n"
        f"Generated   : {now}\n"
        f"Files       : {len(file_reports)}\n"
        f"Mode        : Compressed (Huffman + minification + summarisation)\n"
        f"Orig tokens : {original_total:,}\n"
        f"Best tokens : {compressed_total:,}\n"
        f"Reduction   : {overall_pct}%"
    )

    # ── Aggregate decode preamble (union of all hash tables) ─────────────────
    if file_reports:
        all_hashes: Dict[str, str] = {}
        for _, _, rpt in file_reports:
            all_hashes.update(rpt["hashTable"]["decodeMap"])
        if all_hashes:
            preamble_lines = [
                "[ DECODE PREAMBLE — hash reference table for all files ]",
                "-" * 40,
                "Hash references (e.g. #a1b2c3) stand for repeated code patterns.",
                "Expand them when reading the compressed sections below.",
                "",
            ]
            for key, pattern in all_hashes.items():
                display = pattern[:120] + "…" if len(pattern) > 120 else pattern
                display = display.replace("\n", "\\n")
                preamble_lines.append(f"  {key}  →  {display}")
            sections.append("\n".join(preamble_lines))

    # ── Chat section ─────────────────────────────────────────────────────────
    if chat.strip():
        sections.append(
            f"[ CHAT ]  ({chat_tokens:,} tokens)\n"
            + "-" * 40 + "\n"
            + chat.strip()
        )

    # ── Compressed file sections ───────────────────────────────────────────
    for idx, filename, rpt in file_reports:
        best_level = rpt["bestLevel"]
        best_content = rpt["summaryLevels"][best_level]["content"]
        orig_t = rpt["originalTokens"]
        best_t = rpt["bestTokens"]
        reduction = rpt["overallReductionPct"]
        huffman_ratio = rpt["huffman"]["compressionRatio"]

        header = (
            f"[ FILE {idx}: {filename} ]  "
            f"level={best_level}  orig={orig_t:,}t → compressed={best_t:,}t  "
            f"reduction={reduction}%  huffman={huffman_ratio:.2f}x"
        )
        sections.append(header + "\n" + "-" * 40 + "\n" + best_content.rstrip())

    # ── Footer ────────────────────────────────────────────────────────────────
    sections.append(
        f"[ END OF BUNDLE ]  "
        f"Compressed tokens: {compressed_total:,}  "
        f"(was {original_total:,}, saved {overall_pct}%)"
    )

    return _SEP.join(sections)


# ── PIPELINE: lossless encode ─────────────────────────────────────────────────

@app.post("/pipeline/lossless")
async def pipeline_lossless(
    files: List[UploadFile] = File(default=[]),
) -> Dict[str, Any]:
    """
    Lossless compression bundle.

    Encodes every uploaded file with the TokenTrim lossless codec
    (pattern-substitution based — 100% data-preserving).  Returns a JSON
    bundle that can later be passed to ``POST /pipeline/lossless/decode``
    to reconstruct the original files exactly.

    The bundle is a ``LosslessBundle`` dict with the schema::

        {
          "tokentrim_lossless_v1": true,
          "generated": "ISO-8601 timestamp",
          "files": [
            {
              "filename": str,
              "language": str,
              "original_size": int,   // bytes
              "encoded_size": int,    // bytes after encoding
              "patterns_count": int,
              "compression_ratio": float,
              "space_saved_pct": float,
              "decode_table": {"0000": "original pattern", ...},
              "body": "...encoded text with \\x02XXXX\\x03 placeholders..."
            },
            ...
          ]
        }
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    bundle = LosslessBundle()

    for idx, upload in enumerate(files, start=1):
        raw = await upload.read(MAX_FILE_SIZE + 1)
        if len(raw) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename}: exceeds 10 MB limit.",
            )
        try:
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            text = raw.decode("latin-1", errors="replace")

        filename = upload.filename or f"file_{idx}"
        language = detect_language(filename)

        encoded_file = lossless_encode(text, filename=filename, language=language)
        bundle.files.append(encoded_file)

    return bundle.to_dict()


# ── PIPELINE: lossless decode ─────────────────────────────────────────────────

@app.post("/pipeline/lossless/decode")
async def pipeline_lossless_decode(
    bundle_file: UploadFile = File(...),
) -> Dict[str, Any]:
    """
    Decode a lossless bundle back to the original files.

    Accepts the JSON file produced by ``POST /pipeline/lossless``.
    Returns a list of objects containing the filename and fully-recovered
    original content::

        {
          "files": [
            {
              "filename": str,
              "language": str,
              "original_size": int,
              "recovered_size": int,
              "match": bool,         // true when recovered == original_size bytes
              "content": str         // exact original file content
            },
            ...
          ],
          "total_files": int
        }
    """
    raw = await bundle_file.read(MAX_FILE_SIZE * 10 + 1)  # bundles can be larger
    try:
        bundle_dict = __import__("json").loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON bundle: {exc}")

    if not bundle_dict.get("tokentrim_lossless_v1"):
        raise HTTPException(
            status_code=400,
            detail="Not a TokenTrim lossless bundle (missing tokentrim_lossless_v1 key).",
        )

    recovered_files = []
    for file_dict in bundle_dict.get("files", []):
        try:
            content = lossless_decode_from_dict(file_dict)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Decode failed for '{file_dict.get('filename', '?')}': {exc}",
            )
        recovered_size = len(content.encode("utf-8"))
        recovered_files.append(
            {
                "filename": file_dict["filename"],
                "language": file_dict["language"],
                "original_size": file_dict["original_size"],
                "recovered_size": recovered_size,
                "match": recovered_size == file_dict["original_size"],
                "content": content,
            }
        )

    return {
        "files": recovered_files,
        "total_files": len(recovered_files),
    }
