/**
 * MonacoViewer
 * ─────────────
 * A lightweight read-only Monaco Editor wrapper used for all code
 * previews in TokenTrim's compression result panels.
 *
 * Features
 * ────────
 * - Auto-detects Monaco language from a backend language string
 *   ("Python", "TypeScript (React)", "C/C++", …).
 * - Dark theme matching the TokenTrim purple palette.
 * - Read-only (no cursor / line numbers for compressed/summary output,
 *   line numbers kept only for 'original' content).
 * - Auto-sizing: grows with content up to a configurable max-height.
 */

import Editor, { useMonaco } from "@monaco-editor/react";
import { useEffect } from "react";

// ── Language mapper ───────────────────────────────────────────────────────────

/** Map backend language strings → Monaco language IDs. */
function toMonacoLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l.includes("typescript") || l.includes("tsx")) return "typescript";
  if (l.includes("javascript") || l.includes("jsx") || l.includes("node"))
    return "javascript";
  if (l.includes("python")) return "python";
  if (l.includes("java") && !l.includes("javascript")) return "java";
  if (l.includes("c#") || l.includes("csharp")) return "csharp";
  if (l.includes("c/c++") || l.includes("c++") || l.includes("cpp") || l.startsWith("c "))
    return "cpp";
  if (l.includes("go") || l === "go") return "go";
  if (l.includes("rust")) return "rust";
  if (l.includes("ruby")) return "ruby";
  if (l.includes("php")) return "php";
  if (l.includes("swift")) return "swift";
  if (l.includes("kotlin")) return "kotlin";
  if (l.includes("html")) return "html";
  if (l.includes("css") || l.includes("scss") || l.includes("sass")) return "css";
  if (l.includes("json")) return "json";
  if (l.includes("yaml") || l.includes("yml")) return "yaml";
  if (l.includes("toml")) return "ini"; // closest Monaco has
  if (l.includes("sql")) return "sql";
  if (l.includes("shell") || l.includes("bash") || l.includes("sh"))
    return "shell";
  if (l.includes("markdown") || l.includes("md")) return "markdown";
  if (l.includes("xml")) return "xml";
  if (l.includes("dockerfile") || l.includes("docker")) return "dockerfile";
  return "plaintext";
}

// ── Theme defintion (registered once) ────────────────────────────────────────

const THEME_NAME = "tokentrim-dark";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MonacoViewerProps {
  /** The code / text to display. */
  value: string;
  /**
   * Backend language string, e.g. "Python", "TypeScript (React)".
   * Falls back to "plaintext" when omitted.
   */
  language?: string;
  /**
   * Maximum editor height in px before scrollbars appear.
   * Defaults to 320.
   */
  maxHeight?: number;
  /**
   * Minimum editor height in px.
   * Defaults to 80.
   */
  minHeight?: number;
  /** Show line numbers. Defaults to false (cleaner for compressed output). */
  lineNumbers?: boolean;
  /** Extra CSS class applied to the outer wrapper div. */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MonacoViewer({
  value,
  language = "plaintext",
  maxHeight = 320,
  minHeight = 80,
  lineNumbers = false,
  className = "",
}: MonacoViewerProps) {
  const monaco = useMonaco();

  // Register custom theme once Monaco is loaded
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme(THEME_NAME, {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5a5a8a", fontStyle: "italic" },
        { token: "keyword", foreground: "c084fc" },
        { token: "string", foreground: "86efac" },
        { token: "number", foreground: "fb923c" },
        { token: "type", foreground: "67e8f9" },
        { token: "variable", foreground: "e2e8f0" },
        { token: "function", foreground: "a78bfa" },
        { token: "class", foreground: "67e8f9" },
        { token: "decorator", foreground: "fb923c" },
        { token: "operator", foreground: "94a3b8" },
        { token: "", foreground: "c8c8e8" },
      ],
      colors: {
        "editor.background": "#0d0d1a",
        "editor.foreground": "#c8c8e8",
        "editorLineNumber.foreground": "#3a3a5c",
        "editorLineNumber.activeForeground": "#7c3aed",
        "editor.lineHighlightBackground": "#1a1a28",
        "editor.selectionBackground": "#7c3aed40",
        "editorCursor.foreground": "#a78bfa",
        "editor.inactiveSelectionBackground": "#7c3aed20",
        "scrollbarSlider.background": "#7c3aed30",
        "scrollbarSlider.hoverBackground": "#7c3aed55",
        "scrollbarSlider.activeBackground": "#7c3aed80",
        "editorWidget.background": "#12121f",
        "editorWidget.border": "#2a2a3c",
        "editorGutter.background": "#0d0d1a",
        "editorIndentGuide.background": "#1e1e2e",
        "editorIndentGuide.activeBackground": "#3a3a5c",
        "editorBracketMatch.background": "#7c3aed30",
        "editorBracketMatch.border": "#a78bfa",
      },
    });
    monaco.editor.setTheme(THEME_NAME);
  }, [monaco]);

  // Compute height: clamp line-height estimate between min and max
  const lineCount = Math.max(value.split("\n").length, 3);
  const estimated = lineCount * 19 + 24; // ~19px per line + padding
  const height = Math.min(Math.max(estimated, minHeight), maxHeight);

  const monacoLang = toMonacoLang(language);

  return (
    <div
      className={`monaco-viewer-wrap${className ? ` ${className}` : ""}`}
      style={{ height }}
    >
      <Editor
        height="100%"
        language={monacoLang}
        value={value}
        theme={THEME_NAME}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: lineNumbers ? "on" : "off",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: lineNumbers ? 8 : 4,
          lineNumbersMinChars: lineNumbers ? 3 : 0,
          renderLineHighlight: "none",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          fontSize: 12.5,
          fontFamily:
            '"SF Mono","Fira Code","Cascadia Code","Consolas",monospace',
          fontLigatures: true,
          padding: { top: 10, bottom: 10 },
          overviewRulerBorder: false,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
            useShadows: false,
          },
          contextmenu: false,
          automaticLayout: true,
          // Disable all interactive hints in read-only view
          hover: { enabled: false },
          parameterHints: { enabled: false },
          suggestOnTriggerCharacters: false,
          quickSuggestions: false,
          snippetSuggestions: "none",
          codeLens: false,
          lightbulb: { enabled: 0 },
          renderValidationDecorations: "off",
        }}
      />
    </div>
  );
}
