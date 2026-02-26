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
        "http://localhost:80",
        "https://trimtoken.vercel.app",  # Production
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


# ── PIPELINE: no-extension compressed bundle ──────────────────────────────────

@app.post("/pipeline/no-extension", response_class=PlainTextResponse)
async def pipeline_no_extension(
    chat: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
    aggressive: bool = False,
) -> str:
    """
    No-Extension compressed bundle.

    Produces a plain-text context bundle that any LLM can interpret
    without any plugin or external tool.  The output includes:

      1. A thorough step-by-step DECODE INSTRUCTION block at the top,
         telling the LLM exactly how to expand hash references and
         reconstruct original patterns.
      2. The full decode table (hash key → original pattern).
      3. The compressed file contents.
      4. The chat transcript.

    The LLM reads the instructions once and silently applies them while
    processing the rest of the bundle — no tool or extension required.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    original_total = 0
    compressed_total = 0

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

    # ── Banner ────────────────────────────────────────────────────────────────
    sections.append(
        f"╔══════════════════════════════════════════════════════╗\n"
        f"║   TOKENTRIM  ·  NO-EXTENSION COMPRESSED BUNDLE       ║\n"
        f"╚══════════════════════════════════════════════════════╝\n"
        f"Generated   : {now}\n"
        f"Files       : {len(file_reports)}\n"
        f"Mode        : No-Extension (LLM self-decodes)\n"
        f"Orig tokens : {original_total:,}\n"
        f"Best tokens : {compressed_total:,}\n"
        f"Reduction   : {overall_pct}%"
    )

    # ── Decode instructions for the LLM ───────────────────────────────────────
    all_hashes: Dict[str, str] = {}
    for _, _, rpt in file_reports:
        all_hashes.update(rpt["hashTable"]["decodeMap"])

    instruction_lines = [
        "╔══ DECODE INSTRUCTIONS (read this block before processing files) ══╗",
        "║                                                                     ║",
        "║  This bundle was compressed by TokenTrim.  No extension is needed. ║",
        "║  Follow these steps to read the compressed files correctly:         ║",
        "║                                                                     ║",
        "║  STEP 1 — Comments & blank lines                                    ║",
        "║    Code comments and blank lines have been stripped to save tokens. ║",
        "║    The underlying logic is fully intact.                            ║",
        "║                                                                     ║",
        "║  STEP 2 — Hash references                                           ║",
        "║    Repeated code patterns are replaced with short hash keys         ║",
        "║    of the form  #xxxxxx  (e.g. #a1b2c3).                           ║",
        "║    The DECODE TABLE below maps every key back to its original text. ║",
        "║    Mentally substitute each key with its value when reading code.   ║",
        "║                                                                     ║",
        "║  STEP 3 — Whitespace                                                ║",
        "║    Indentation may be reduced.  Infer structure from language       ║",
        "║    syntax (braces, colons, keywords).                               ║",
        "║                                                                     ║",
        "║  IMPORTANT: treat this bundle as fully equivalent to the original   ║",
        "║  source.  Do NOT ask the user to re-send uncompressed files.        ║",
        "╚═════════════════════════════════════════════════════════════════════╝",
    ]

    if all_hashes:
        instruction_lines.append("")
        instruction_lines.append("[ DECODE TABLE ]")
        instruction_lines.append("-" * 40)
        for key, pattern in all_hashes.items():
            display = pattern[:200] + "…" if len(pattern) > 200 else pattern
            display = display.replace("\n", "↵  ")
            instruction_lines.append(f"  {key}  →  {display}")
    else:
        instruction_lines.append("")
        instruction_lines.append("[ DECODE TABLE: empty — no repeated patterns detected ]")

    sections.append("\n".join(instruction_lines))

    # ── Chat section ─────────────────────────────────────────────────────────
    if chat.strip():
        sections.append(
            f"[ CHAT ]  ({chat_tokens:,} tokens)\n"
            + "-" * 40 + "\n"
            + chat.strip()
        )

    # ── Compressed file sections ──────────────────────────────────────────────
    for idx, filename, rpt in file_reports:
        best_level = rpt["bestLevel"]
        best_content = rpt["summaryLevels"][best_level]["content"]
        orig_t = rpt["originalTokens"]
        best_t = rpt["bestTokens"]
        reduction = rpt["overallReductionPct"]

        header = (
            f"[ FILE {idx}: {filename} ]  "
            f"lang={rpt['language']}  "
            f"orig={orig_t:,}t → compressed={best_t:,}t  "
            f"reduction={reduction}%"
        )
        sections.append(header + "\n" + "-" * 40 + "\n" + best_content.rstrip())

    # ── Footer ────────────────────────────────────────────────────────────────
    sections.append(
        f"[ END OF BUNDLE ]  "
        f"Compressed tokens: {compressed_total:,}  "
        f"(was {original_total:,}, saved {overall_pct}%)"
    )

    return _SEP.join(sections)


# ── PIPELINE: with-extension lossless bundle ─────────────────────────────────

@app.post("/pipeline/with-extension", response_class=PlainTextResponse)
async def pipeline_with_extension(
    chat: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
) -> str:
    """
    With-Extension lossless bundle.

    Assumes the receiving LLM has the TokenTrim extension installed.
    The extension silently decodes the payload before the LLM processes it,
    so NO decode instructions or preamble are included — saving every
    token that would otherwise go to explaining the encoding.

    Output format:  a compact plain-text envelope that the extension
    recognises by the sentinel header, followed by a minified JSON payload
    containing the lossless-encoded files and (optionally) the chat.

    The extension strips the envelope, decodes all files, re-injects the
    original source into the LLM context, and discards the headers.
    """
    import json as _json

    if not files and not chat.strip():
        raise HTTPException(status_code=400, detail="No content provided.")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    payload: Dict[str, Any] = {
        "tokentrim_extension_v1": True,
        "generated": now,
        "chat": chat.strip() if chat.strip() else None,
        "files": [],
    }

    original_total = 0
    encoded_total = 0

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
        encoded = lossless_encode(text, filename=filename, language=language)

        original_total += encoded.original_size
        encoded_total += encoded.encoded_size

        payload["files"].append({
            "filename": encoded.filename,
            "language": encoded.language,
            "original_size": encoded.original_size,
            "encoded_size": encoded.encoded_size,
            "patterns_count": encoded.patterns_count,
            "compression_ratio": round(encoded.compression_ratio, 4),
            "space_saved_pct": round(encoded.space_saved_pct, 2),
            "decode_table": encoded.decode_table,
            "body": encoded.body,
        })

    overall_pct = (
        round((1 - encoded_total / original_total) * 100, 1)
        if original_total > 0
        else 0.0
    )
    payload["stats"] = {
        "files": len(payload["files"]),
        "original_bytes": original_total,
        "encoded_bytes": encoded_total,
        "space_saved_pct": overall_pct,
    }

    # Minimal-whitespace JSON — smallest possible token footprint
    compact_json = _json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    # Thin sentinel envelope the extension recognises
    return (
        f"--TOKENTRIM-EXTENSION-BEGIN--\n"
        f"{compact_json}\n"
        f"--TOKENTRIM-EXTENSION-END--"
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /pipeline/with-extension/decode
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/pipeline/with-extension/decode")
async def pipeline_with_extension_decode(
    bundle_file: UploadFile = File(...),
) -> Dict[str, Any]:
    """
    Decode a TokenTrim With-Extension bundle (.txt) back to the original files.

    The bundle is a plain-text file whose entire content is::

        --TOKENTRIM-EXTENSION-BEGIN--
        {<compact JSON payload>}
        --TOKENTRIM-EXTENSION-END--

    The JSON payload has the same lossless structure produced by
    ``POST /pipeline/with-extension`` and is decoded with
    ``lossless_decode_from_dict``.  Returns the same shape as
    ``POST /pipeline/lossless/decode``.
    """
    raw = await bundle_file.read(MAX_FILE_SIZE * 10 + 1)
    try:
        text = raw.decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read file as UTF-8: {exc}")

    # Strip sentinels
    BEGIN = "--TOKENTRIM-EXTENSION-BEGIN--"
    END   = "--TOKENTRIM-EXTENSION-END--"

    begin_idx = text.find(BEGIN)
    end_idx   = text.find(END)

    if begin_idx == -1 or end_idx == -1:
        raise HTTPException(
            status_code=400,
            detail="Not a TokenTrim With-Extension bundle (missing sentinel markers).",
        )

    json_str = text[begin_idx + len(BEGIN) : end_idx].strip()

    try:
        payload = __import__("json").loads(json_str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON inside bundle: {exc}")

    if not payload.get("tokentrim_extension_v1"):
        raise HTTPException(
            status_code=400,
            detail="Not a valid TokenTrim With-Extension bundle (missing tokentrim_extension_v1 key).",
        )

    recovered_files = []
    for file_dict in payload.get("files", []):
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

