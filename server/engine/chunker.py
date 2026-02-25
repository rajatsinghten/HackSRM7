"""
chunker.py
----------
Semantic-aware code chunker that splits source files at meaningful boundaries
(functions, classes, imports, top-level blocks) instead of arbitrary line counts.

This lets TokenTrim send *only* the relevant chunks to an LLM rather than the
entire file, dramatically reducing token usage while preserving context.

Supports: Python, JS/TS, C-family, Java, Go, Rust, Ruby, PHP, and fallback.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional


# ── Chunk types ───────────────────────────────────────────────────────────────

class ChunkKind(str, Enum):
    IMPORT = "import"
    CLASS = "class"
    FUNCTION = "function"
    METHOD = "method"
    INTERFACE = "interface"
    TYPE_ALIAS = "type_alias"
    CONSTANT = "constant"
    BLOCK = "block"             # top-level code that doesn't fit other buckets
    COMMENT = "comment"         # standalone top-level doc comments


@dataclass
class CodeChunk:
    """A semantically meaningful slice of a source file."""
    kind: ChunkKind
    name: str                    # identifier (function name, class name, …)
    start_line: int              # 1-based inclusive
    end_line: int                # 1-based inclusive
    content: str
    signature: Optional[str]     # first line / short signature for summary use
    token_estimate: int          # rough token count using char/4 heuristic

    @property
    def line_count(self) -> int:
        return self.end_line - self.start_line + 1


# ── Language patterns ─────────────────────────────────────────────────────────

# Each pattern yields (kind, name_group_index)

_PYTHON_PATTERNS: list[tuple[re.Pattern, ChunkKind, int]] = [
    (re.compile(r"^(from\s+\S+\s+import\s+.+|import\s+.+)$", re.M), ChunkKind.IMPORT, 0),
    (re.compile(r"^class\s+(\w+)"), ChunkKind.CLASS, 1),
    (re.compile(r"^(?:async\s+)?def\s+(\w+)"), ChunkKind.FUNCTION, 1),
    (re.compile(r"^\s+(?:async\s+)?def\s+(\w+)"), ChunkKind.METHOD, 1),
]

_JS_TS_PATTERNS: list[tuple[re.Pattern, ChunkKind, int]] = [
    (re.compile(r"^import\s+.+", re.M), ChunkKind.IMPORT, 0),
    (re.compile(r"^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)"), ChunkKind.CLASS, 1),
    (re.compile(r"^(?:export\s+)?interface\s+(\w+)"), ChunkKind.INTERFACE, 1),
    (re.compile(r"^(?:export\s+)?type\s+(\w+)"), ChunkKind.TYPE_ALIAS, 1),
    (re.compile(r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)"), ChunkKind.FUNCTION, 1),
    (re.compile(r"^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:\(|async\s*\()"), ChunkKind.FUNCTION, 1),
    (re.compile(r"^(?:export\s+)?(?:const|let|var)\s+(\w+)"), ChunkKind.CONSTANT, 1),
]

_C_FAMILY_PATTERNS: list[tuple[re.Pattern, ChunkKind, int]] = [
    (re.compile(r"^#include\s+.+", re.M), ChunkKind.IMPORT, 0),
    (re.compile(r"^(?:public|private|protected|static|abstract|virtual|override)?\s*class\s+(\w+)"), ChunkKind.CLASS, 1),
    (re.compile(r"^(?:public|private|protected|static|virtual|override|inline)?\s*\w[\w:<>,\s\*&]*\s+(\w+)\s*\("), ChunkKind.FUNCTION, 1),
]

_GO_PATTERNS: list[tuple[re.Pattern, ChunkKind, int]] = [
    (re.compile(r'^import\s+(?:\(|\")'), ChunkKind.IMPORT, 0),
    (re.compile(r"^type\s+(\w+)\s+struct"), ChunkKind.CLASS, 1),
    (re.compile(r"^type\s+(\w+)\s+interface"), ChunkKind.INTERFACE, 1),
    (re.compile(r"^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)"), ChunkKind.FUNCTION, 1),
]

_RUST_PATTERNS: list[tuple[re.Pattern, ChunkKind, int]] = [
    (re.compile(r"^use\s+.+;"), ChunkKind.IMPORT, 0),
    (re.compile(r"^(?:pub\s+)?struct\s+(\w+)"), ChunkKind.CLASS, 1),
    (re.compile(r"^(?:pub\s+)?trait\s+(\w+)"), ChunkKind.INTERFACE, 1),
    (re.compile(r"^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)"), ChunkKind.FUNCTION, 1),
    (re.compile(r"^impl\s+(?:<[^>]+>\s+)?(\w+)"), ChunkKind.CLASS, 1),
]


def _patterns_for(language: str) -> list[tuple[re.Pattern, ChunkKind, int]]:
    lang = language.lower()
    if "python" in lang:
        return _PYTHON_PATTERNS
    if "javascript" in lang or "typescript" in lang:
        return _JS_TS_PATTERNS
    if lang in ("go", "golang"):
        return _GO_PATTERNS
    if lang == "rust":
        return _RUST_PATTERNS
    if lang in ("c", "c++", "c#", "java", "kotlin", "scala", "dart", "swift", "php"):
        return _C_FAMILY_PATTERNS
    return _JS_TS_PATTERNS  # reasonable default


# ── Indentation-based block detection ─────────────────────────────────────────

def _indent_level(line: str) -> int:
    """Return the number of leading spaces (tabs → 4 spaces)."""
    expanded = line.expandtabs(4)
    return len(expanded) - len(expanded.lstrip())


def _is_blank(line: str) -> bool:
    return line.strip() == ""


# ── Brace-based block end detection ───────────────────────────────────────────

def _find_brace_block_end(lines: list[str], start: int) -> int:
    """
    Find the closing brace for a block that starts at *start*.
    Returns the 0-based line index of the closing brace.
    """
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if depth <= 0 and i > start:
            return i
    return len(lines) - 1


def _find_indent_block_end(lines: list[str], start: int, base_indent: int) -> int:
    """
    For indentation-based languages (Python), find where the block ends.
    """
    i = start + 1
    while i < len(lines):
        if _is_blank(lines[i]):
            i += 1
            continue
        if _indent_level(lines[i]) <= base_indent:
            return i - 1
        i += 1
    return len(lines) - 1


# ── Public API ────────────────────────────────────────────────────────────────

def chunk_code(text: str, language: str = "unknown") -> List[CodeChunk]:
    """
    Split *text* into semantically meaningful chunks based on language structure.

    Parameters
    ----------
    text:
        Full source code as string.
    language:
        Human-readable language name (e.g. "Python", "TypeScript (React)").

    Returns
    -------
    list[CodeChunk]
        Ordered list of chunks with type, name, content, and token estimates.
    """
    lines = text.splitlines()
    if not lines:
        return []

    patterns = _patterns_for(language)
    is_indent_lang = "python" in language.lower()
    uses_braces = not is_indent_lang

    chunks: list[CodeChunk] = []
    used_lines: set[int] = set()   # track which lines are claimed

    # ── Pass 1: find all top-level / named declarations ────────────────────
    for line_idx, line in enumerate(lines):
        if line_idx in used_lines:
            continue

        for pattern, kind, name_group in patterns:
            m = pattern.match(line)
            if not m:
                continue

            name = m.group(name_group).strip() if name_group else m.group(0).strip()

            # Determine block extent
            if kind == ChunkKind.IMPORT:
                # Imports: single line (or multi-line import block)
                end = line_idx
                if "(" in line and ")" not in line:
                    # Multi-line import
                    for j in range(line_idx + 1, len(lines)):
                        if ")" in lines[j]:
                            end = j
                            break
                block_start, block_end = line_idx, end
            elif is_indent_lang and kind in (ChunkKind.CLASS, ChunkKind.FUNCTION, ChunkKind.METHOD):
                base = _indent_level(line)
                block_end = _find_indent_block_end(lines, line_idx, base)
                block_start = line_idx
            elif uses_braces and "{" in line:
                block_end = _find_brace_block_end(lines, line_idx)
                block_start = line_idx
            elif uses_braces:
                # Opening brace may be on the next line
                if line_idx + 1 < len(lines) and "{" in lines[line_idx + 1]:
                    block_end = _find_brace_block_end(lines, line_idx + 1)
                    block_start = line_idx
                else:
                    block_end = line_idx
                    block_start = line_idx
            else:
                block_end = line_idx
                block_start = line_idx

            content = "\n".join(lines[block_start:block_end + 1])
            signature = lines[block_start].strip()

            for li in range(block_start, block_end + 1):
                used_lines.add(li)

            chunks.append(CodeChunk(
                kind=kind,
                name=name[:80],
                start_line=block_start + 1,
                end_line=block_end + 1,
                content=content,
                signature=signature,
                token_estimate=max(1, len(content) // 4),
            ))
            break  # first pattern match wins for this line

    # ── Pass 2: collect remaining unclaimed lines into BLOCK chunks ────────
    remaining_lines: list[int] = sorted(set(range(len(lines))) - used_lines)
    if remaining_lines:
        # Group contiguous lines
        groups: list[list[int]] = []
        current_group: list[int] = [remaining_lines[0]]
        for idx in remaining_lines[1:]:
            if idx == current_group[-1] + 1:
                current_group.append(idx)
            else:
                groups.append(current_group)
                current_group = [idx]
        groups.append(current_group)

        for group in groups:
            content = "\n".join(lines[i] for i in group)
            # Skip groups that are all blank
            if not content.strip():
                continue
            chunks.append(CodeChunk(
                kind=ChunkKind.BLOCK,
                name="<top-level>",
                start_line=group[0] + 1,
                end_line=group[-1] + 1,
                content=content,
                signature=lines[group[0]].strip() or "<block>",
                token_estimate=max(1, len(content) // 4),
            ))

    # Sort by start_line for stable output
    chunks.sort(key=lambda c: c.start_line)
    return chunks


def extract_signatures(chunks: List[CodeChunk]) -> str:
    """
    Build a concise *signature-only* summary from a list of chunks.

    This is useful when you want to send just the interface / overview of a
    file to an LLM to decide which chunks to request in full.
    """
    lines: list[str] = []
    for c in chunks:
        if c.kind == ChunkKind.IMPORT:
            continue  # imports are usually not useful as signatures
        prefix = f"[{c.kind.value}]"
        lines.append(f"{prefix:14s} L{c.start_line}-{c.end_line}  {c.signature}")
    return "\n".join(lines)
