"""
minifier.py
-----------
Language-aware code minification that strips non-essential tokens to shrink
the character count before Huffman or LLM submission.

Supports:
  - Comment removal (single-line, multi-line, docstrings)
  - Whitespace normalisation (collapse blank lines, trim trailing spaces)
  - Optional aggressive mode (collapse all indentation, remove blank lines)

The output stays syntactically valid for reading — it's *not* an obfuscator.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


# ── Result ────────────────────────────────────────────────────────────────────

@dataclass
class MinifyResult:
    """Container for minification output and stats."""
    original: str
    minified: str
    original_chars: int
    minified_chars: int
    reduction_pct: float          # percentage of chars removed
    comments_removed: int         # approximate count of comment blocks stripped
    blank_lines_removed: int


# ── Language-specific comment patterns ────────────────────────────────────────

# C-family single + block comments  (JS, TS, Java, C, C++, C#, Go, Rust, etc.)
_C_STYLE = {
    "single": r"//[^\n]*",
    "block": r"/\*[\s\S]*?\*/",
}

# Python / Ruby / Shell single-line comments
_HASH_STYLE = {
    "single": r"#[^\n]*",
}

# Python triple-quote docstrings
_PYTHON_DOCSTRING = r'(\"\"\"[\s\S]*?\"\"\"|\'\'\'[\s\S]*?\'\'\')'

# HTML / XML
_HTML_COMMENT = r"<!--[\s\S]*?-->"

# CSS (same as C block comments, no single-line)
_CSS_BLOCK = r"/\*[\s\S]*?\*/"


def _pattern_for_language(language: str) -> Optional[str]:
    """
    Return a combined regex pattern that matches *all* comment forms for the
    given language, while protecting string literals from being mangled.
    """
    lang = language.lower()

    # Map language names to comment patterns
    if lang in (
        "javascript", "javascript (react)", "typescript", "typescript (react)",
        "java", "c", "c++", "c#", "go", "rust", "kotlin", "scala", "swift",
        "dart", "groovy", "php",
    ):
        # Protect string literals:  "…"  '…'  `…`
        string_literal = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`'
        comments = f'{_C_STYLE["block"]}|{_C_STYLE["single"]}'
        return f"({string_literal})|({comments})"

    if lang in ("python", "python (stub)"):
        string_literal = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
        comments = f'{_PYTHON_DOCSTRING}|{_HASH_STYLE["single"]}'
        return f"({string_literal})|({comments})"

    if lang in ("ruby", "shell", "bash", "zsh", "yaml", "toml", "dockerfile"):
        string_literal = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
        comments = _HASH_STYLE["single"]
        return f"({string_literal})|({comments})"

    if lang in ("html", "xml", "svg", "vue"):
        return f"({_HTML_COMMENT})"

    if lang in ("css", "scss", "sass", "less"):
        string_literal = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
        return f"({string_literal})|({_CSS_BLOCK})"

    # Unknown language — try C-style as fallback
    string_literal = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
    comments = f'{_C_STYLE["block"]}|{_C_STYLE["single"]}'
    return f"({string_literal})|({comments})"


def _strip_comments(text: str, language: str) -> tuple[str, int]:
    """
    Remove comments from *text* while preserving string literals.

    Returns (cleaned text, count of comment blocks removed).
    """
    pattern = _pattern_for_language(language)
    if pattern is None:
        return text, 0

    count = 0

    def _replacer(m: re.Match) -> str:
        nonlocal count
        # Group 1 is the string-literal capture — keep it untouched
        if m.group(1):
            return m.group(1)
        # Otherwise it's a comment — strip it
        count += 1
        return ""

    cleaned = re.sub(pattern, _replacer, text)
    return cleaned, count


def _normalise_whitespace(text: str, aggressive: bool = False) -> tuple[str, int]:
    """
    Collapse redundant whitespace.

    - Always: strip trailing spaces on each line, collapse 3+ blank lines → 1.
    - Aggressive: collapse all indentation to single space, remove all blank lines.

    Returns (normalised text, blank lines removed).
    """
    lines = text.splitlines()
    original_blank = sum(1 for ln in lines if ln.strip() == "")

    # Strip trailing whitespace on every line
    lines = [ln.rstrip() for ln in lines]

    if aggressive:
        # Collapse leading whitespace to single space (keeps structure hint)
        lines = [
            (" " + ln.lstrip() if ln and ln[0] in (" ", "\t") else ln)
            for ln in lines
        ]
        # Drop blank lines entirely
        lines = [ln for ln in lines if ln.strip()]
        removed = original_blank
    else:
        # Collapse runs of 3+ blank lines to a single blank line
        collapsed: list[str] = []
        blank_run = 0
        for ln in lines:
            if ln.strip() == "":
                blank_run += 1
                if blank_run <= 1:
                    collapsed.append(ln)
            else:
                blank_run = 0
                collapsed.append(ln)
        removed = len(lines) - len(collapsed)
        lines = collapsed

    return "\n".join(lines), removed


# ── Public API ────────────────────────────────────────────────────────────────

def minify_code(text: str, language: str = "unknown",
                aggressive: bool = False) -> MinifyResult:
    """
    Minify source code by removing comments and normalising whitespace.

    Parameters
    ----------
    text:
        Raw source code.
    language:
        Human-readable language name (as returned by ``detect_language``).
    aggressive:
        If True, also collapse indentation and remove all blank lines.
        Produces smaller output but is harder for humans (and LLMs) to scan.

    Returns
    -------
    MinifyResult
        Contains both the minified code and compression statistics.
    """
    original_chars = len(text)

    # Step 1: strip comments
    stripped, comments_removed = _strip_comments(text, language)

    # Step 2: normalise whitespace
    cleaned, blanks_removed = _normalise_whitespace(stripped, aggressive=aggressive)

    # Final trim
    cleaned = cleaned.strip() + "\n" if cleaned.strip() else ""

    minified_chars = len(cleaned)
    reduction = ((original_chars - minified_chars) / original_chars * 100
                 if original_chars else 0.0)

    return MinifyResult(
        original=text,
        minified=cleaned,
        original_chars=original_chars,
        minified_chars=minified_chars,
        reduction_pct=round(reduction, 2),
        comments_removed=comments_removed,
        blank_lines_removed=blanks_removed,
    )
