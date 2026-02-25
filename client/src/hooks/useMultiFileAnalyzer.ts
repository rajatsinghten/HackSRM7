/**
 * useMultiFileAnalyzer
 * ─────────────────────
 * Manages a list of attached files, each with its own analysis state.
 * Sends every added file to /analyze-file independently.
 * Each in-flight request is tied to an AbortController so removing a
 * file mid-analysis never produces stale state updates.
 */

import { useState, useRef, useCallback } from "react";
import type { FileAnalysis } from "./useFileAnalyzer";
import { formatSize } from "./useFileAnalyzer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileEntry {
  /** Stable key for React lists and controller map. */
  id: string;
  file: File;
  analysis: FileAnalysis;
}

/** Settled result from a completed (non-error) backend analysis. */
export interface AnalyzedFile {
  id: string;
  fileName: string;
  fileSize: number;
  language: string;
  tokenEstimate: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

let counter = 0;
function genId(): string {
  return `fe-${++counter}-${Date.now()}`;
}

function buildInitialAnalysis(file: File): FileAnalysis {
  if (file.size > MAX_BYTES) {
    return {
      analyzing: false,
      language: "—",
      tokenCount: "—",
      fileSize: formatSize(file.size),
      sizeError: `File is too large (${formatSize(file.size)}). Maximum is 10 MB.`,
      fetchError: null,
    };
  }
  return {
    analyzing: true,
    language: "Detecting...",
    tokenCount: "Calculating...",
    fileSize: formatSize(file.size),
    sizeError: null,
    fetchError: null,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMultiFileAnalyzer() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [resolvedFiles, setResolvedFiles] = useState<AnalyzedFile[]>([]);
  /** Map from FileEntry.id → AbortController for in-flight fetches. */
  const controllers = useRef(new Map<string, AbortController>());

  // ── Internal: fetch one file ─────────────────────────────────────────────
  const fetchAnalysis = useCallback(async (id: string, file: File) => {
    // Size-guard: initial analysis already marked error, nothing to fetch.
    if (file.size > MAX_BYTES) return;

    const controller = new AbortController();
    controllers.current.set(id, controller);

    const patchEntry = (patch: Partial<FileAnalysis>) =>
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, analysis: { ...e.analysis, ...patch } } : e
        )
      );

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/analyze-file`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        fileName: string;
        fileSize: number;
        language: string;
        tokenEstimate: number;
      };

      if (!controller.signal.aborted) {
        patchEntry({
          analyzing: false,
          language: data.language,
          tokenCount: data.tokenEstimate.toLocaleString(),
          fileSize: formatSize(data.fileSize),
          sizeError: null,
          fetchError: null,
        });
        setResolvedFiles((prev) => {
          // Replace if already present (re-upload), otherwise append
          const exists = prev.some((f) => f.id === id);
          const entry: AnalyzedFile = {
            id,
            fileName: data.fileName,
            fileSize: data.fileSize,
            language: data.language,
            tokenEstimate: data.tokenEstimate,
          };
          return exists ? prev.map((f) => (f.id === id ? entry : f)) : [...prev, entry];
        });
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error && err.message !== "Failed to fetch"
          ? err.message
          : "Could not reach the analysis server. Make sure the backend is running on port 8000.";
      console.error(`[useMultiFileAnalyzer] ${file.name}:`, err);
      patchEntry({
        analyzing: false,
        language: "—",
        tokenCount: "—",
        fetchError: message,
      });
    } finally {
      controllers.current.delete(id);
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  /** Append one or more files to the list and kick off analysis for each. */
  const addFiles = useCallback(
    (newFiles: File[]) => {
      const newEntries: FileEntry[] = newFiles.map((file) => ({
        id: genId(),
        file,
        analysis: buildInitialAnalysis(file),
      }));

      setEntries((prev) => [...prev, ...newEntries]);

      for (const entry of newEntries) {
        fetchAnalysis(entry.id, entry.file);
      }
    },
    [fetchAnalysis]
  );

  /** Remove a file and cancel its in-flight request (if any). */
  const removeFile = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setResolvedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /** Remove all files and cancel all in-flight requests. */
  const clearFiles = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setEntries([]);
    setResolvedFiles([]);
  }, []);

  return { entries, resolvedFiles, addFiles, removeFile, clearFiles };
}
