/**
 * useFileAnalyzer
 * ---------------
 * Custom hook that sends a file to the /analyze-file endpoint and surfaces
 * the result (language, token count, formatted size) plus loading/error state.
 *
 * Guarantees:
 *  - Frontend 10 MB guard fires before any network request.
 *  - Every fetch is tied to an AbortController that is cancelled on cleanup,
 *    so stale state updates and memory leaks are impossible.
 *  - All async state mutations are guarded on abort status.
 */

import { useState, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Shared types (exported so consumers can annotate without duplication) ──────

export interface FileAnalysis {
  /** True while the network request is in flight. */
  analyzing: boolean;
  /** Human-readable language name, e.g. "TypeScript (React)". */
  language: string;
  /** Formatted token estimate, e.g. "12,340". */
  tokenCount: string;
  /** Formatted file size, e.g. "4.2 KB". */
  fileSize: string;
  /** Non-null when the file was rejected before being sent (size guard). */
  sizeError: string | null;
  /** Non-null when the backend request failed (network error, server down, etc.). */
  fetchError: string | null;
}

interface AnalyzeResponse {
  fileName: string;
  fileSize: number;
  language: string;
  tokenEstimate: number;
}

// ── Helper ────────────────────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function resetState(): FileAnalysis {
  return {
    analyzing: false,
    language: "Detecting...",
    tokenCount: "Calculating...",
    fileSize: "",
    sizeError: null,
    fetchError: null,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Analyzes a file via the backend on every change.
 * Returns a stable `FileAnalysis` object that updates reactively.
 */
export function useFileAnalyzer(file: File | null): FileAnalysis {
  const [state, setState] = useState<FileAnalysis>(resetState);
  // Keep a ref to the current controller so we can abort on re-run / unmount.
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort any in-flight request from a previous file.
    controllerRef.current?.abort();
    controllerRef.current = null;

    if (file === null) {
      setState(resetState());
      return;
    }

    // ── Frontend size guard ──────────────────────────────────────────────────
    if (file.size > MAX_BYTES) {
      setState({
        analyzing: false,
        language: "—",
        tokenCount: "—",
        fileSize: formatSize(file.size),
        sizeError: `File is too large (${formatSize(file.size)}). Maximum allowed size is 10 MB.`,
        fetchError: null,
      });
      return;
    }

    // ── Begin analysis ───────────────────────────────────────────────────────
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({
      analyzing: true,
      language: "Detecting...",
      tokenCount: "Calculating...",
      fileSize: formatSize(file.size), // optimistic local size
      sizeError: null,
      fetchError: null,
    });

    const run = async () => {
      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch(`${API_BASE}/analyze-file`, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail ?? `HTTP ${res.status}`);
        }

        const data: AnalyzeResponse = await res.json();

        if (!controller.signal.aborted) {
          setState({
            analyzing: false,
            language: data.language,
            tokenCount: data.tokenEstimate.toLocaleString(),
            fileSize: formatSize(data.fileSize),
            sizeError: null,
            fetchError: null,
          });
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return; // Expected: component unmounted or file changed
        const message = err instanceof Error && err.message !== "Failed to fetch"
          ? err.message
          : "Could not reach the analysis server. Make sure the backend is running on port 8000.";
        console.error("[useFileAnalyzer] analyze-file error:", err);
        setState((prev) => ({
          ...prev,
          analyzing: false,
          language: "—",
          tokenCount: "—",
          fetchError: message,
        }));
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [file]);

  return state;
}
