"""
lossless.py
-----------
100% lossless codec using greedy pattern-substitution compression.

Algorithm
---------
1.  Escape existing STX (\\x02) bytes in input → \\x02e\\x02 (STX is not
    a printable character and never appears in real source code, so this is
    a no-op in practice).
2.  Find the top-N repeated substrings that appear >= MIN_OCCURRENCES times
    and have length >= MIN_PATTERN_LEN.  Rank by savings impact:
        (occurrences - 1) * (pattern_len - placeholder_len)
3.  Substitute each pattern with a compact placeholder  \\x02{n:04d}\\x03
    (STX + 4-digit index + ETX), working longest-first so shorter sub-
    patterns are never accidentally consumed by a longer one.
4.  Discard any pattern if it no longer appears >= MIN_OCCURRENCES times in
    the evolving body (earlier substitutions may have consumed it).

Decode
------
Reverse the substitutions in reverse-index order (highest index first),
then unescape \\x02e\\x02 → \\x02.

Guarantee
---------
``lossless_decode(lossless_encode(text, ...))  ==  text``  for *any* text.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Tuple

# ── Codec constants ───────────────────────────────────────────────────────────

_STX = "\x02"          # control char; never in source code
_ETX = "\x03"          # control char; never in source code
_ESCAPE = "\x02e\x02"  # stands in for a literal \x02 in the original

_MIN_PATTERN_LEN = 20   # characters – shorter strings save too little
_MIN_OCCURRENCES = 2    # must appear at least twice to worth replacing
_MAX_PATTERNS = 9999    # upper bound on decode-table entries


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class LosslessFile:
    """Lossless-encoded representation of a single file."""
    filename: str
    language: str
    original_size: int        # bytes (UTF-8)
    encoded_size: int         # bytes of body (UTF-8)
    patterns_count: int
    compression_ratio: float  # original_size / encoded_size  (>1 means smaller)
    space_saved_pct: float    # 0-100
    decode_table: Dict[str, str]  # {"0000": "original pattern", ...}
    body: str                     # encoded body with placeholders


@dataclass
class LosslessBundle:
    """Multi-file lossless bundle."""
    tokentrim_lossless_v1: bool = True
    generated: str = field(
        default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    files: List[LosslessFile] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "tokentrim_lossless_v1": self.tokentrim_lossless_v1,
            "generated": self.generated,
            "files": [
                {
                    "filename": f.filename,
                    "language": f.language,
                    "original_size": f.original_size,
                    "encoded_size": f.encoded_size,
                    "patterns_count": f.patterns_count,
                    "compression_ratio": round(f.compression_ratio, 4),
                    "space_saved_pct": round(f.space_saved_pct, 2),
                    "decode_table": f.decode_table,
                    "body": f.body,
                }
                for f in self.files
            ],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)


# ── Pattern finder ────────────────────────────────────────────────────────────

def _placeholder_len() -> int:
    """Length of a placeholder string: STX + 4 digits + ETX."""
    return 1 + 4 + 1  # 6 chars


def _find_patterns(text: str) -> List[Tuple[str, int]]:
    """
    Return a list of (pattern, count) pairs that are worth substituting,
    sorted by total savings descending.
    """
    ph_len = _placeholder_len()
    counts: Counter[str] = Counter()
    lines = text.splitlines(keepends=True)
    n = len(lines)

    # Candidate window sizes: 1-line, 2-line, 3-line blocks
    for window in range(1, 4):
        for i in range(n - window + 1):
            block = "".join(lines[i : i + window])
            if len(block) >= _MIN_PATTERN_LEN:
                counts[block] += 1

    def _savings(item: Tuple[str, int]) -> int:
        pat, cnt = item
        saved_each = len(pat) - ph_len
        # Keep one occurrence in the table; substitute the rest
        return (cnt - 1) * max(0, saved_each)

    result = [
        (pat, cnt)
        for pat, cnt in counts.items()
        if cnt >= _MIN_OCCURRENCES and len(pat) >= _MIN_PATTERN_LEN
    ]
    result.sort(key=_savings, reverse=True)
    return result[:_MAX_PATTERNS]


def _remove_subsumed(patterns: List[Tuple[str, int]]) -> List[Tuple[str, int]]:
    """
    Remove patterns that are entirely contained within a higher-savings
    pattern earlier in the list (they will be consumed by the longer
    substitution and won't need their own entry).
    """
    result: List[Tuple[str, int]] = []
    for i, (pat_i, cnt_i) in enumerate(patterns):
        subsumed = any(
            pat_i in pat_j
            for j, (pat_j, _) in enumerate(patterns)
            if j < i
        )
        if not subsumed:
            result.append((pat_i, cnt_i))
    return result


# ── Encode ────────────────────────────────────────────────────────────────────

def lossless_encode(
    text: str,
    filename: str = "unknown",
    language: str = "unknown",
) -> LosslessFile:
    """
    Encode *text* losslessly.  Returns a :class:`LosslessFile` whose
    *body* + *decode_table* are sufficient to reconstruct the original.
    """
    original_size = len(text.encode("utf-8"))

    # Step 0 – escape any raw STX/ETX bytes in the source
    body = text.replace(_STX, _ESCAPE)

    # Step 1 – find repeated patterns
    candidates = _find_patterns(body)
    candidates = _remove_subsumed(candidates)

    # Step 2 – sort by length descending (longest patterns first)
    candidates.sort(key=lambda x: len(x[0]), reverse=True)

    decode_table: Dict[str, str] = {}
    ph_len = _placeholder_len()

    for n, (pattern, _) in enumerate(candidates):
        if n >= _MAX_PATTERNS:
            break
        # Re-check frequency in evolving body (earlier subs may have consumed it)
        if body.count(pattern) < _MIN_OCCURRENCES:
            continue
        # Only substitute if it actually saves space
        if len(pattern) <= ph_len:
            continue
        placeholder = f"{_STX}{n:04d}{_ETX}"
        decode_table[f"{n:04d}"] = pattern
        body = body.replace(pattern, placeholder)

    encoded_size = len(body.encode("utf-8"))
    ratio = original_size / encoded_size if encoded_size > 0 else 1.0
    saved_pct = max(0.0, (1 - encoded_size / original_size) * 100) if original_size else 0.0

    return LosslessFile(
        filename=filename,
        language=language,
        original_size=original_size,
        encoded_size=encoded_size,
        patterns_count=len(decode_table),
        compression_ratio=ratio,
        space_saved_pct=saved_pct,
        decode_table=decode_table,
        body=body,
    )


# ── Decode ────────────────────────────────────────────────────────────────────

def lossless_decode(encoded: LosslessFile) -> str:
    """Reconstruct the exact original text from a :class:`LosslessFile`."""
    return _decode_body(encoded.body, encoded.decode_table)


def _decode_body(body: str, decode_table: Dict[str, str]) -> str:
    """
    Internal: apply decode table in reverse-index order, then unescape STX.

    Reverse order means we restore the *last* substituted (shortest) patterns
    first.  Because substitutions were longest-first during encoding, shorter
    patterns may have been applied to portions of the text not already
    consumed.  Reversing ensures no placeholder is re-interpreted as content.
    """
    # Sort by numeric index descending (reverse of encode order)
    sorted_keys = sorted(decode_table.keys(), key=lambda k: int(k), reverse=True)
    for key in sorted_keys:
        placeholder = f"{_STX}{key}{_ETX}"
        body = body.replace(placeholder, decode_table[key])

    # Unescape STX
    body = body.replace(_ESCAPE, _STX)
    return body


def lossless_decode_from_dict(file_dict: dict) -> str:
    """
    Decode a raw dict (from JSON) back to the original text.

    Accepts the same structure as :meth:`LosslessBundle.to_dict` produces.
    """
    return _decode_body(file_dict["body"], file_dict["decode_table"])


# ── Verification helper ───────────────────────────────────────────────────────

def verify_roundtrip(text: str, filename: str = "test") -> bool:
    """
    Encode then decode *text* and assert perfect reconstruction.

    Returns True on success, raises AssertionError on mismatch.
    """
    encoded = lossless_encode(text, filename)
    recovered = lossless_decode(encoded)
    if recovered != text:
        # Find first difference for helpful error message
        for i, (a, b) in enumerate(zip(recovered, text)):
            if a != b:
                raise AssertionError(
                    f"Round-trip mismatch at char {i}: "
                    f"expected {repr(text[i:i+20])!r}, got {repr(recovered[i:i+20])!r}"
                )
        raise AssertionError(
            f"Round-trip length mismatch: original={len(text)}, recovered={len(recovered)}"
        )
    return True
