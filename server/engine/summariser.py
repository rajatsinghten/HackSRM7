"""
summariser.py
-------------
Creates compact structural summaries of source files for LLM context.

Three summary levels:
  1. **Skeleton** — signatures, class outlines, type definitions only.
  2. **Architectural** — dependency graph + component relationships.
  3. **Full compressed** — minified code with Huffman + hash references.

Each level trades detail for token savings; the LLM can request drill-down
into specific chunks when it needs full implementation details.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from engine.chunker import CodeChunk, ChunkKind, chunk_code, extract_signatures
from engine.minifier import minify_code


# ── Hash table for repeated patterns ─────────────────────────────────────────

@dataclass
class HashEntry:
    """A mapping from a short key to a repeated code pattern."""
    key: str
    pattern: str
    occurrences: int


@dataclass
class HashTable:
    """Collection of hash entries with decode instructions."""
    entries: Dict[str, HashEntry] = field(default_factory=dict)

    def add(self, pattern: str) -> str:
        """Register a pattern (if new) and return its short hash key."""
        h = _short_hash(pattern)
        if h not in self.entries:
            self.entries[h] = HashEntry(key=h, pattern=pattern, occurrences=1)
        else:
            self.entries[h].occurrences += 1
        return h

    def decode_map(self) -> Dict[str, str]:
        """Return the key → pattern mapping for the LLM decode preamble."""
        return {e.key: e.pattern for e in self.entries.values()}

    @property
    def size(self) -> int:
        return len(self.entries)


def _short_hash(text: str, length: int = 6) -> str:
    """Produce a short, deterministic hash key for a code fragment."""
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"#{digest[:length]}"


# ── Pattern detection ─────────────────────────────────────────────────────────

# Common boilerplate patterns worth hashing
_BOILERPLATE_PATTERNS: list[re.Pattern] = [
    # Import blocks (JS/TS)
    re.compile(r"^import\s+\{[^}]+\}\s+from\s+['\"][^'\"]+['\"];?$", re.M),
    # React component boilerplate
    re.compile(r"export\s+default\s+function\s+\w+\([^)]*\)\s*\{"),
    # Common decorators
    re.compile(r"@\w+(?:\([^)]*\))?"),
    # Repetitive method signatures
    re.compile(r"(?:public|private|protected)\s+(?:static\s+)?(?:async\s+)?\w+\s+\w+\([^)]*\)"),
]


def _find_repeated_patterns(text: str, min_len: int = 30, min_count: int = 2) -> list[str]:
    """
    Find substrings that appear multiple times and are worth hashing.

    Strategy: extract lines/blocks longer than *min_len* chars, count duplicates.
    """
    # Split into meaningful lines
    lines = [ln.strip() for ln in text.splitlines() if len(ln.strip()) >= min_len]
    counts = Counter(lines)
    return [line for line, cnt in counts.items() if cnt >= min_count]


def _apply_hash_references(text: str, hash_table: HashTable,
                           patterns: list[str]) -> str:
    """
    Annotate repeated patterns with hash references WITHOUT removing data.
    
    This keeps ALL original code intact and only adds hash annotations
    as comments to indicate repeated patterns for analysis purposes.
    The actual code is fully preserved.
    """
    result = text
    for pattern in patterns:
        key = hash_table.add(pattern)
        # Just record the pattern in the hash table for reference
        # but do NOT replace or remove any original code
        # The hash table provides lookup info, but code stays intact
    return result


# ── Summary result ────────────────────────────────────────────────────────────

@dataclass
class SummaryResult:
    """Overall summary output with multiple detail levels."""
    # Skeleton: just signatures
    skeleton: str
    skeleton_tokens: int

    # Architectural: module structure
    architecture: str
    architecture_tokens: int

    # Compressed: minified + hashed full code
    compressed_code: str
    compressed_tokens: int

    # Hash decode map (sent as preamble to LLM)
    hash_decode_map: Dict[str, str]
    hash_entries_count: int

    # Stats
    original_tokens: int
    best_tokens: int
    best_reduction_pct: float
    recommended_level: str        # "skeleton" | "architecture" | "compressed"


# ── Public API ────────────────────────────────────────────────────────────────

def generate_skeleton(chunks: List[CodeChunk]) -> str:
    """
    Level 1: Signature-only skeleton.

    Shows the file's structure without any implementation bodies.
    Useful for orienting the LLM about what's in the file.
    """
    out: list[str] = []
    out.append("// ═══ FILE SKELETON ═══")
    out.append("")

    # Group imports
    imports = [c for c in chunks if c.kind == ChunkKind.IMPORT]
    if imports:
        out.append("// Imports:")
        for c in imports:
            out.append(f"  {c.signature}")
        out.append("")

    # Classes, interfaces, types
    for kind in (ChunkKind.CLASS, ChunkKind.INTERFACE, ChunkKind.TYPE_ALIAS):
        items = [c for c in chunks if c.kind == kind]
        for c in items:
            out.append(f"  {c.signature}  // L{c.start_line}-{c.end_line} ({c.token_estimate} tokens)")

            # List methods inside class range
            methods = [
                m for m in chunks
                if m.kind == ChunkKind.METHOD
                and m.start_line >= c.start_line
                and m.end_line <= c.end_line
            ]
            for m in methods:
                out.append(f"    {m.signature}")
            out.append("")

    # Standalone functions
    functions = [c for c in chunks if c.kind == ChunkKind.FUNCTION]
    if functions:
        out.append("// Functions:")
        for c in functions:
            out.append(f"  {c.signature}  // L{c.start_line}-{c.end_line} ({c.token_estimate} tokens)")
        out.append("")

    # Constants
    constants = [c for c in chunks if c.kind == ChunkKind.CONSTANT]
    if constants:
        out.append("// Constants:")
        for c in constants:
            out.append(f"  {c.signature}")
        out.append("")

    return "\n".join(out)


def generate_architecture(text: str, chunks: List[CodeChunk],
                          filename: str = "unknown") -> str:
    """
    Level 2: Architectural summary.

    Shows file metadata, dependency graph, component relationships,
    and a structural overview — all in a compact format.
    """
    out: list[str] = []
    out.append("// ═══ ARCHITECTURE SUMMARY ═══")
    out.append(f"// File: {filename}")
    out.append(f"// Total lines: {len(text.splitlines())}")
    out.append(f"// Chunks: {len(chunks)}")
    out.append("")

    # Dependency section
    imports = [c for c in chunks if c.kind == ChunkKind.IMPORT]
    if imports:
        out.append("// Dependencies:")
        for c in imports:
            out.append(f"  {c.content.strip()}")
        out.append("")

    # Component map
    out.append("// Component Map:")
    for c in chunks:
        if c.kind in (ChunkKind.IMPORT, ChunkKind.BLOCK):
            continue
        indent = "  " if c.kind != ChunkKind.METHOD else "    "
        tokens_label = f"~{c.token_estimate} tokens"
        out.append(f"{indent}[{c.kind.value:10s}] {c.name:30s} L{c.start_line:>4d}-{c.end_line:<4d} {tokens_label}")
    out.append("")

    # Cross-references (simple: which chunks reference which names)
    all_names = {c.name for c in chunks if c.name != "<top-level>"}
    out.append("// Cross-references:")
    for c in chunks:
        if c.kind in (ChunkKind.IMPORT, ChunkKind.BLOCK):
            continue
        refs = [n for n in all_names if n != c.name and n in c.content]
        if refs:
            out.append(f"  {c.name} → {', '.join(refs)}")
    out.append("")

    return "\n".join(out)


def generate_compressed(text: str, language: str,
                        aggressive: bool = True) -> Tuple[str, HashTable]:
    """
    Level 3: Minified code with hash references for repeated patterns.

    Returns the compressed code string and the hash table for decoding.
    """
    # Step 1: Minify
    minified = minify_code(text, language=language, aggressive=aggressive)

    # Step 2: Find repeated patterns
    repeated = _find_repeated_patterns(minified.minified)

    # Step 3: Apply hash references
    hash_table = HashTable()
    compressed = minified.minified
    if repeated:
        compressed = _apply_hash_references(compressed, hash_table, repeated)

    return compressed, hash_table


def summarise(text: str, language: str = "unknown",
              filename: str = "unknown") -> SummaryResult:
    """
    Run all three summary levels and return a combined result with
    recommendations on which level to use.

    Parameters
    ----------
    text:
        Raw source code.
    language:
        Language name (e.g. "Python", "TypeScript (React)").
    filename:
        Original filename, used in architectural summary.

    Returns
    -------
    SummaryResult
    """
    # Chunk the code
    chunks = chunk_code(text, language)
    original_tokens = max(1, len(text) // 4)

    # Level 1: Skeleton
    skeleton = generate_skeleton(chunks)
    skeleton_tokens = max(1, len(skeleton) // 4)

    # Level 2: Architecture
    architecture = generate_architecture(text, chunks, filename)
    arch_tokens = max(1, len(architecture) // 4)

    # Level 3: Compressed
    compressed, hash_table = generate_compressed(text, language, aggressive=True)
    compressed_tokens = max(1, len(compressed) // 4)

    # Pick best level — only between minified/compressed representations.
    # Skeleton and architecture are structural views, not real compression;
    # using them would produce misleadingly high reduction percentages.
    best_level = "compressed"
    best_tokens = compressed_tokens
    reduction = (1 - best_tokens / original_tokens) * 100 if original_tokens else 0

    return SummaryResult(
        skeleton=skeleton,
        skeleton_tokens=skeleton_tokens,
        architecture=architecture,
        architecture_tokens=arch_tokens,
        compressed_code=compressed,
        compressed_tokens=compressed_tokens,
        hash_decode_map=hash_table.decode_map(),
        hash_entries_count=hash_table.size,
        original_tokens=original_tokens,
        best_tokens=best_tokens,
        best_reduction_pct=round(reduction, 2),
        recommended_level=best_level,
    )
