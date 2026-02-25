/**
 * useCompressor
 * ─────────────
 * Sends one or more files to the /compress endpoint and manages the
 * loading / result / error state for each. Returns a per-file map of
 * CompressionResult plus aggregate stats.
 */

import { useState, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HuffmanStats {
  compressedBits: number;
  compressionRatio: number;
  spaceSavedPct: number;
}

export interface MinificationStats {
  code: string;
  commentsRemoved: number;
  blankLinesRemoved: number;
  reductionPct: number;
  tokens: number;
}

export interface SummaryLevel {
  content: string;
  tokens: number;
}

export interface ChunkInfo {
  kind: string;
  name: string;
  startLine: number;
  endLine: number;
  tokens: number;
  signature: string | null;
}

export interface CompressionResult {
  filename: string;
  language: string;
  fileSize: number;
  originalLines: number;

  originalTokens: number;
  minifiedTokens: number;
  huffman: HuffmanStats;
  minification: MinificationStats;

  chunks: ChunkInfo[];
  totalChunks: number;

  summaryLevels: {
    skeleton: SummaryLevel;
    architecture: SummaryLevel;
    compressed: SummaryLevel;
  };

  hashTable: {
    decodeMap: Record<string, string>;
    entriesCount: number;
  };

  bestLevel: string;
  bestTokens: number;
  overallReductionPct: number;

  decodePreamble: string;
}

export interface FileCompressionEntry {
  id: string;
  fileName: string;
  originalContent: string;
  compressing: boolean;
  result: CompressionResult | null;
  error: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCompressor() {
  const [compResults, setCompResults] = useState<FileCompressionEntry[]>([]);
  const [compressing, setCompressing] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());

  /** Compress a batch of files. Each file is sent individually. */
  const compressFiles = useCallback(
    async (files: { id: string; file: File }[]) => {
      if (files.length === 0) return;
      setCompressing(true);

      // Initialize entries
      const initial: FileCompressionEntry[] = files.map((f) => ({
        id: f.id,
        fileName: f.file.name,
        originalContent: "",
        compressing: true,
        result: null,
        error: null,
      }));
      setCompResults(initial);

      const promises = files.map(async ({ id, file }) => {
        const controller = new AbortController();
        controllers.current.set(id, controller);

        try {
          // Read original content for display
          const text = await file.text();

          setCompResults((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, originalContent: text } : e
            )
          );

          const form = new FormData();
          form.append("file", file);

          const res = await fetch(`${API_BASE}/compress`, {
            method: "POST",
            body: form,
            signal: controller.signal,
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(
              (body as { detail?: string }).detail ?? `HTTP ${res.status}`
            );
          }

          const data: CompressionResult = await res.json();

          if (!controller.signal.aborted) {
            setCompResults((prev) =>
              prev.map((e) =>
                e.id === id
                  ? { ...e, compressing: false, result: data, error: null }
                  : e
              )
            );
          }
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          const message =
            err instanceof Error && err.message !== "Failed to fetch"
              ? err.message
              : "Could not reach the compression server. Make sure the backend is running.";
          console.error(`[useCompressor] ${file.name}:`, err);
          setCompResults((prev) =>
            prev.map((e) =>
              e.id === id
                ? { ...e, compressing: false, error: message }
                : e
            )
          );
        } finally {
          controllers.current.delete(id);
        }
      });

      await Promise.allSettled(promises);
      setCompressing(false);
    },
    []
  );

  /** Clear results and abort any in-flight requests. */
  const clearResults = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setCompResults([]);
    setCompressing(false);
  }, []);

  return { compResults, compressing, compressFiles, clearResults };
}
