"""Quick round-trip tests for the lossless codec."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from engine.lossless import lossless_encode, lossless_decode, lossless_decode_from_dict, verify_roundtrip

def test_repeated_patterns():
    src = (
        "import React from 'react';\n"
        "import { useState } from 'react';\n"
        "import { useEffect } from 'react';\n\n"
        "function ComponentA() {\n"
        "  const [state, setState] = useState(null);\n"
        "  useEffect(() => { setState(true); }, []);\n"
        "  return <div>ComponentA</div>;\n"
        "}\n\n"
        "function ComponentB() {\n"
        "  const [state, setState] = useState(null);\n"
        "  useEffect(() => { setState(true); }, []);\n"
        "  return <div>ComponentB</div>;\n"
        "}\n\n"
        "function ComponentC() {\n"
        "  const [state, setState] = useState(null);\n"
        "  useEffect(() => { setState(true); }, []);\n"
        "  return <div>ComponentC</div>;\n"
        "}\n"
    )
    enc = lossless_encode(src, "test.tsx", "TypeScript")
    ok = verify_roundtrip(src, "test.tsx")
    print(f"[PASS] Repeated patterns: ratio={enc.compression_ratio:.2f}x  "
          f"patterns={enc.patterns_count}  orig={enc.original_size}B  enc={enc.encoded_size}B")
    return ok

def test_tiny():
    tiny = "hello = 1\n"
    ok = verify_roundtrip(tiny, "tiny.py")
    print(f"[PASS] Tiny file: {ok}")
    return ok

def test_stx_in_source():
    # File containing literal STX/ETX control characters
    weird = "abc\x02def\x03ghi\x02\x02jkl\nmore lines\n" * 3
    ok = verify_roundtrip(weird, "weird.txt")
    print(f"[PASS] STX/ETX escape: {ok}")
    return ok

def test_no_patterns():
    # Unique content — no patterns to compress
    src = "\n".join(f"unique_line_{i}_abcdefghijklmnopqrstuvwxyz" for i in range(20))
    ok = verify_roundtrip(src, "unique.txt")
    enc = lossless_encode(src, "unique.txt")
    print(f"[PASS] No-pattern file: patterns={enc.patterns_count}  ratio={enc.compression_ratio:.2f}x")
    return ok

def test_dict_roundtrip():
    src = "x = 1\n" * 50 + "def foo():\n    return x\n" * 10
    enc = lossless_encode(src, "test.py", "Python")
    bundle_dict = {
        "filename": enc.filename,
        "language": enc.language,
        "original_size": enc.original_size,
        "encoded_size": enc.encoded_size,
        "patterns_count": enc.patterns_count,
        "compression_ratio": enc.compression_ratio,
        "space_saved_pct": enc.space_saved_pct,
        "decode_table": enc.decode_table,
        "body": enc.body,
    }
    recovered = lossless_decode_from_dict(bundle_dict)
    ok = recovered == src
    print(f"[PASS] Dict round-trip: {ok}")
    return ok

if __name__ == "__main__":
    results = [
        test_repeated_patterns(),
        test_tiny(),
        test_stx_in_source(),
        test_no_patterns(),
        test_dict_roundtrip(),
    ]
    if all(results):
        print("\n✓ ALL TESTS PASSED")
    else:
        print("\n✗ SOME TESTS FAILED")
        sys.exit(1)
