"""
pipeline.py
-----------
The main compression orchestrator.  Chains together:

  1. Language detection
  2. Token estimation (original)
  3. Code minification
  4. Semantic chunking
  5. Huffman encoding
  6. Summarisation (skeleton / architecture / compressed)
  7. Decode preamble generation

And returns a single, unified ``CompressionReport``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from engine import huffman_encode, huffman_decode, HuffmanResult
from engine.minifier import minify_code, MinifyResult
from engine.chunker import chunk_code, CodeChunk, ChunkKind, extract_signatures
from engine.summariser import summarise, SummaryResult


# ── Report ────────────────────────────────────────────────────────────────────

@dataclass
class ChunkReport:
    """Per-chunk breakdown."""
    kind: str
    name: str
    start_line: int
    end_line: int
    original_tokens: int
    signature: Optional[str]


@dataclass
class CompressionReport:
    """End-to-end result of the TokenTrim compression pipeline."""

    # ── File metadata ──
    filename: str
    language: str
    file_size: int
    original_lines: int

    # ── Token counts ──
    original_tokens: int
    minified_tokens: int
    huffman_compressed_bits: int
    huffman_ratio: float
    huffman_space_saved_pct: float

    # ── Minification ──
    minified_code: str
    comments_removed: int
    blank_lines_removed: int
    minify_reduction_pct: float

    # ── Chunks ──
    chunks: List[ChunkReport]
    total_chunks: int

    # ── Summary levels ──
    skeleton: str
    skeleton_tokens: int
    architecture: str
    architecture_tokens: int
    compressed_code: str
    compressed_tokens: int

    # ── Hash table ──
    hash_decode_map: Dict[str, str]
    hash_entries_count: int

    # ── Best result ──
    best_level: str
    best_tokens: int
    overall_reduction_pct: float

    # ── Decode preamble ──
    decode_preamble: str


# ── Decode preamble generator ────────────────────────────────────────────────

def _build_decode_preamble(hash_map: Dict[str, str], language: str) -> str:
    """
    Generate the short instruction block an LLM should receive alongside
    compressed code with analysis of repeated patterns.
    """
    lines: list[str] = []
    lines.append("// ═══ TOKENTRIM COMPRESSION ANALYSIS ═══")
    lines.append("// This code has been analyzed by TokenTrim.")
    lines.append("// All original code is preserved — only comments and blank lines removed.")
    lines.append("//")

    if hash_map:
        lines.append("// ── Repeated Patterns Detected ──")
        lines.append("// The following patterns appear multiple times in the code:")
        for key, pattern in hash_map.items():
            # Truncate long patterns in the preamble
            display = pattern[:120] + "…" if len(pattern) > 120 else pattern
            display = display.replace("\n", "\\n")
            lines.append(f"//  {key}: {display}")
        lines.append("//")

    lines.append("// ── Code Info ──")
    lines.append(f"// Language: {language}")
    lines.append("// 1. All actual code logic is fully preserved.")
    lines.append("// 2. Comments and blank lines have been stripped for token efficiency.")
    lines.append("// 3. No data has been omitted or replaced.")
    lines.append("// ═══════════════════════════════════")
    lines.append("")

    return "\n".join(lines)


# ── Public API ────────────────────────────────────────────────────────────────

def compress(text: str, filename: str = "unknown",
             language: str = "unknown",
             aggressive_minify: bool = False) -> CompressionReport:
    """
    Run the full TokenTrim compression pipeline on a source file.

    Parameters
    ----------
    text:
        Raw source code.
    filename:
        Original filename (used for language detection fallback).
    language:
        Detected language. If "unknown", language detection should be done
        by the caller before invoking this.
    aggressive_minify:
        If True, collapse indentation and remove all blank lines.

    Returns
    -------
    CompressionReport
        Full breakdown of all compression stages.
    """
    original_tokens = max(1, len(text) // 4)
    original_lines = len(text.splitlines())

    # ── Step 1: Minify ────────────────────────────────────────────────────────
    minified: MinifyResult = minify_code(
        text, language=language, aggressive=aggressive_minify
    )
    minified_tokens = max(1, len(minified.minified) // 4)

    # ── Step 2: Chunk ─────────────────────────────────────────────────────────
    chunks: List[CodeChunk] = chunk_code(text, language)
    chunk_reports = [
        ChunkReport(
            kind=c.kind.value,
            name=c.name,
            start_line=c.start_line,
            end_line=c.end_line,
            original_tokens=c.token_estimate,
            signature=c.signature,
        )
        for c in chunks
    ]

    # ── Step 3: Huffman encode the minified code ──────────────────────────────
    huffman: HuffmanResult = huffman_encode(minified.minified)

    # ── Step 4: Summarise (skeleton / architecture / compressed) ──────────────
    summary: SummaryResult = summarise(text, language, filename)

    # ── Step 5: Build decode preamble ─────────────────────────────────────────
    preamble = _build_decode_preamble(summary.hash_decode_map, language)

    # ── Overall best reduction ─────────────────────────────────────────────────
    # Only compare against minified/compressed output — skeleton and architecture
    # are structural summaries, not actual compression, so they must not be used
    # to claim a compression ratio.
    if minified_tokens <= summary.compressed_tokens:
        best_tokens = minified_tokens
        best_level = "minified"
    else:
        best_tokens = summary.compressed_tokens
        best_level = "compressed"
    overall_reduction = (1 - best_tokens / original_tokens) * 100 if original_tokens else 0

    return CompressionReport(
        filename=filename,
        language=language,
        file_size=len(text.encode("utf-8")),
        original_lines=original_lines,

        original_tokens=original_tokens,
        minified_tokens=minified_tokens,
        huffman_compressed_bits=huffman.compressed_size_bits,
        huffman_ratio=huffman.compression_ratio,
        huffman_space_saved_pct=huffman.space_saved_pct,

        minified_code=minified.minified,
        comments_removed=minified.comments_removed,
        blank_lines_removed=minified.blank_lines_removed,
        minify_reduction_pct=minified.reduction_pct,

        chunks=chunk_reports,
        total_chunks=len(chunks),

        skeleton=summary.skeleton,
        skeleton_tokens=summary.skeleton_tokens,
        architecture=summary.architecture,
        architecture_tokens=summary.architecture_tokens,
        compressed_code=summary.compressed_code,
        compressed_tokens=summary.compressed_tokens,

        hash_decode_map=summary.hash_decode_map,
        hash_entries_count=summary.hash_entries_count,

        best_level=best_level,
        best_tokens=best_tokens,
        overall_reduction_pct=round(overall_reduction, 2),

        decode_preamble=preamble,
    )


def compress_to_dict(text: str, filename: str = "unknown",
                     language: str = "unknown",
                     aggressive_minify: bool = False) -> Dict[str, Any]:
    """
    Convenience wrapper that returns the compression report as a plain dict
    (suitable for JSON serialisation / FastAPI response).
    """
    report = compress(text, filename, language, aggressive_minify)
    return {
        "filename": report.filename,
        "language": report.language,
        "fileSize": report.file_size,
        "originalLines": report.original_lines,

        "originalTokens": report.original_tokens,
        "minifiedTokens": report.minified_tokens,
        "huffman": {
            "compressedBits": report.huffman_compressed_bits,
            "compressionRatio": report.huffman_ratio,
            "spaceSavedPct": report.huffman_space_saved_pct,
        },

        "minification": {
            "code": report.minified_code,
            "commentsRemoved": report.comments_removed,
            "blankLinesRemoved": report.blank_lines_removed,
            "reductionPct": report.minify_reduction_pct,
            "tokens": report.minified_tokens,
        },

        "chunks": [
            {
                "kind": c.kind,
                "name": c.name,
                "startLine": c.start_line,
                "endLine": c.end_line,
                "tokens": c.original_tokens,
                "signature": c.signature,
            }
            for c in report.chunks
        ],
        "totalChunks": report.total_chunks,

        "summaryLevels": {
            "skeleton": {
                "content": report.skeleton,
                "tokens": report.skeleton_tokens,
            },
            "architecture": {
                "content": report.architecture,
                "tokens": report.architecture_tokens,
            },
            "compressed": {
                "content": report.compressed_code,
                "tokens": report.compressed_tokens,
            },
        },

        "hashTable": {
            "decodeMap": report.hash_decode_map,
            "entriesCount": report.hash_entries_count,
        },

        "bestLevel": report.best_level,
        "bestTokens": report.best_tokens,
        "overallReductionPct": report.overall_reduction_pct,

        "decodePreamble": report.decode_preamble,
    }
