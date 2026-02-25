"""
huffman.py
----------
Huffman coding implementation for token compression.

Builds a frequency-based binary tree over the input tokens (characters or
byte-level symbols), producing a variable-length prefix-free code table.

The encode/decode cycle is **lossless** — every character round-trips exactly.

Public API
----------
- ``huffman_encode(text)`` → encoded bitstring, code table, and stats
- ``huffman_decode(encoded, code_table)`` → original text
- ``HuffmanResult`` — typed container for compression output
"""

from __future__ import annotations

import heapq
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple


# ── Huffman Tree Node ─────────────────────────────────────────────────────────

@dataclass(order=True)
class _HuffmanNode:
    """Priority-queue friendly tree node."""
    freq: int
    char: Optional[str] = field(default=None, compare=False)
    left: Optional["_HuffmanNode"] = field(default=None, compare=False)
    right: Optional["_HuffmanNode"] = field(default=None, compare=False)


# ── Result container ──────────────────────────────────────────────────────────

@dataclass
class HuffmanResult:
    """Immutable result of a Huffman encode pass."""
    encoded_bits: str              # The "0"/"1" encoded bitstring
    code_table: Dict[str, str]     # char → bit-code mapping
    original_size_bits: int        # len(text) * 8
    compressed_size_bits: int      # len(encoded_bits)
    compression_ratio: float       # original / compressed
    space_saved_pct: float         # percentage reduction


# ── Internal helpers ──────────────────────────────────────────────────────────

def _build_tree(freq: Dict[str, int]) -> Optional[_HuffmanNode]:
    """Build a Huffman tree from a frequency map."""
    if not freq:
        return None

    heap: list[_HuffmanNode] = [_HuffmanNode(f, ch) for ch, f in freq.items()]
    heapq.heapify(heap)

    while len(heap) > 1:
        left = heapq.heappop(heap)
        right = heapq.heappop(heap)
        merged = _HuffmanNode(freq=left.freq + right.freq, left=left, right=right)
        heapq.heappush(heap, merged)

    return heap[0] if heap else None


def _build_codes(node: Optional[_HuffmanNode], prefix: str = "",
                 table: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Walk the tree and assign bit-codes to each leaf."""
    if table is None:
        table = {}
    if node is None:
        return table
    if node.char is not None:
        # Single-character edge case: assign "0" if tree has one node
        table[node.char] = prefix or "0"
        return table
    _build_codes(node.left, prefix + "0", table)
    _build_codes(node.right, prefix + "1", table)
    return table


# ── Public API ────────────────────────────────────────────────────────────────

def huffman_encode(text: str) -> HuffmanResult:
    """
    Encode *text* using Huffman coding.

    Returns a ``HuffmanResult`` with the encoded bitstring, the code table
    needed for decoding, and compression statistics.
    """
    if not text:
        return HuffmanResult(
            encoded_bits="",
            code_table={},
            original_size_bits=0,
            compressed_size_bits=0,
            compression_ratio=1.0,
            space_saved_pct=0.0,
        )

    freq = Counter(text)
    tree = _build_tree(dict(freq))
    code_table = _build_codes(tree)

    encoded_bits = "".join(code_table[ch] for ch in text)

    original_bits = len(text) * 8
    compressed_bits = len(encoded_bits)
    ratio = original_bits / compressed_bits if compressed_bits else 1.0
    saved = (1 - compressed_bits / original_bits) * 100 if original_bits else 0.0

    return HuffmanResult(
        encoded_bits=encoded_bits,
        code_table=code_table,
        original_size_bits=original_bits,
        compressed_size_bits=compressed_bits,
        compression_ratio=round(ratio, 3),
        space_saved_pct=round(saved, 2),
    )


def huffman_decode(encoded_bits: str, code_table: Dict[str, str]) -> str:
    """
    Decode a Huffman-encoded bitstring back to the original text.

    Parameters
    ----------
    encoded_bits:
        The "0"/"1" string produced by ``huffman_encode``.
    code_table:
        The char → bit-code mapping from the same encode run.

    Returns
    -------
    str
        The original text, losslessly reconstructed.
    """
    if not encoded_bits:
        return ""

    # Invert: bit-code → char
    inverse = {bits: ch for ch, bits in code_table.items()}

    decoded_chars: list[str] = []
    buffer = ""
    for bit in encoded_bits:
        buffer += bit
        if buffer in inverse:
            decoded_chars.append(inverse[buffer])
            buffer = ""

    return "".join(decoded_chars)
