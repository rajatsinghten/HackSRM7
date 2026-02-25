"""Quick smoke test for all engine modules."""

from engine import huffman_encode, huffman_decode
from engine.minifier import minify_code
from engine.chunker import chunk_code
from engine.summariser import summarise
from engine.pipeline import compress_to_dict

# ── Test Huffman ──────────────────────────────────────────────────────────────
result = huffman_encode("hello world hello world")
decoded = huffman_decode(result.encoded_bits, result.code_table)
assert decoded == "hello world hello world", f"Huffman roundtrip failed: {decoded}"
print(f"✅ Huffman: ratio={result.compression_ratio}x, saved={result.space_saved_pct}%")

# ── Test minifier ─────────────────────────────────────────────────────────────
py_code = """# This is a comment
import os

def hello():
    '''Docstring'''
    # Another comment
    return 42

def world():
    return 99
"""
m = minify_code(py_code, "Python")
print(f"✅ Minifier: {m.original_chars} -> {m.minified_chars} chars (-{m.reduction_pct}%), {m.comments_removed} comments removed")

# ── Test chunker ──────────────────────────────────────────────────────────────
chunks = chunk_code(py_code, "Python")
print(f"✅ Chunker: {len(chunks)} chunks: {[c.kind.value for c in chunks]}")

# ── Test summariser ───────────────────────────────────────────────────────────
summary = summarise(py_code, "Python", "test.py")
print(f"✅ Summariser: skeleton={summary.skeleton_tokens}t, arch={summary.architecture_tokens}t, compressed={summary.compressed_tokens}t")
print(f"   Best level: {summary.recommended_level} ({summary.best_reduction_pct}% reduction)")

# ── Test full pipeline ────────────────────────────────────────────────────────
report = compress_to_dict(py_code, "test.py", "Python")
print(f"✅ Pipeline: {report['originalTokens']} -> {report['bestTokens']} tokens ({report['overallReductionPct']}% reduction)")
print(f"   Huffman ratio: {report['huffman']['compressionRatio']}x")
print(f"   Chunks: {report['totalChunks']}")
print(f"   Best level: {report['bestLevel']}")
print(f"   Decode preamble: {len(report['decodePreamble'])} chars")
print()
print("All engine tests passed!")
