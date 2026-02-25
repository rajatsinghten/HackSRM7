"""
language.py
-----------
Maps a filename's extension to its human-readable programming / markup language.
All lookups are case-insensitive on the extension.
"""

# Extension → language display name.
# Keys are lowercase, no leading dot.
_EXT_MAP: dict[str, str] = {
    # JavaScript family
    "js": "JavaScript",
    "jsx": "JavaScript (React)",
    "mjs": "JavaScript",
    "cjs": "JavaScript",

    # TypeScript family
    "ts": "TypeScript",
    "tsx": "TypeScript (React)",

    # Python
    "py": "Python",
    "pyw": "Python",
    "pyi": "Python",

    # C family
    "c": "C",
    "h": "C",
    "cpp": "C++",
    "cc": "C++",
    "cxx": "C++",
    "hpp": "C++",
    "hxx": "C++",
    "cs": "C#",

    # Java / JVM
    "java": "Java",
    "kt": "Kotlin",
    "kts": "Kotlin",
    "scala": "Scala",
    "groovy": "Groovy",

    # Web
    "html": "HTML",
    "htm": "HTML",
    "css": "CSS",
    "scss": "SCSS",
    "sass": "Sass",
    "less": "Less",
    "vue": "Vue",
    "svelte": "Svelte",

    # Data / config
    "json": "JSON",
    "jsonc": "JSON",
    "yaml": "YAML",
    "yml": "YAML",
    "toml": "TOML",
    "xml": "XML",
    "csv": "CSV",
    "env": "Dotenv",

    # Systems
    "go": "Go",
    "rs": "Rust",
    "swift": "Swift",
    "dart": "Dart",
    "rb": "Ruby",
    "php": "PHP",
    "r": "R",
    "lua": "Lua",
    "zig": "Zig",
    "nim": "Nim",
    "ex": "Elixir",
    "exs": "Elixir",
    "erl": "Erlang",
    "hs": "Haskell",
    "ml": "OCaml",
    "clj": "Clojure",

    # Shell / scripting
    "sh": "Shell",
    "bash": "Shell",
    "zsh": "Shell",
    "fish": "Shell",
    "ps1": "PowerShell",
    "bat": "Batch",
    "cmd": "Batch",

    # Query / data
    "sql": "SQL",
    "graphql": "GraphQL",
    "gql": "GraphQL",

    # Docs / text
    "md": "Markdown",
    "mdx": "MDX",
    "rst": "reStructuredText",
    "txt": "Plain Text",
    "tex": "LaTeX",
    "log": "Plain Text",
}


def detect_language(filename: str) -> str:
    """
    Return the language name for *filename* based on its extension.

    Uses a case-insensitive match on the last extension component.
    Returns ``"Plain Text"`` when the extension is absent or unrecognised.

    Examples
    --------
    >>> detect_language("app.tsx")
    'TypeScript (React)'
    >>> detect_language("main.cpp")
    'C++'
    >>> detect_language("README")
    'Plain Text'
    """
    if "." not in filename:
        return "Plain Text"
    ext = filename.rsplit(".", 1)[-1].lower()
    return _EXT_MAP.get(ext, "Plain Text")
