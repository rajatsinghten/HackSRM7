/**
 * useLossless
 * ────────────
 * Drives the lossless encode/decode pipeline.
 *
 * exportLossless — uploads attached files to POST /pipeline/lossless and
 *                  downloads the resulting .json bundle.
 *
 * decodeLossless — uploads a .json bundle to POST /pipeline/lossless/decode
 *                  and returns the recovered files so the UI can display /
 *                  download them individually.
 */

import { useState, useCallback } from "react";
import type { FileEntry } from "./useMultiFileAnalyzer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LosslessEncodedFile {
  filename: string;
  language: string;
  original_size: number;
  encoded_size: number;
  patterns_count: number;
  compression_ratio: number;
  space_saved_pct: number;
  decode_table: Record<string, string>;
  body: string;
}

export interface LosslessBundle {
  tokentrim_lossless_v1: true;
  generated: string;
  files: LosslessEncodedFile[];
}

export interface RecoveredFile {
  filename: string;
  language: string;
  original_size: number;
  recovered_size: number;
  match: boolean;
  content: string;
}

export interface DecodeResult {
  files: RecoveredFile[];
  total_files: number;
}

export type LosslessMode = "encoding" | "decoding" | null;

export interface LosslessState {
  running: LosslessMode;
  error: string | null;
  decodeResult: DecodeResult | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadJson(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json; charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bundleFilename(): string {
  const ts = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[:.]/g, "-");
  return `tokentrim-lossless-${ts}.json`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLossless() {
  const [state, setState] = useState<LosslessState>({
    running: null,
    error: null,
    decodeResult: null,
  });

  /**
   * Upload the currently attached files, receive a lossless JSON bundle
   * from the server, and trigger a browser download of the .json file.
   */
  const exportLossless = useCallback(
    async (fileEntries: FileEntry[]) => {
      const validEntries = fileEntries.filter(
        (e) =>
          !e.analysis.sizeError &&
          !e.analysis.fetchError &&
          !e.analysis.analyzing,
      );

      if (validEntries.length === 0) return;

      setState({ running: "encoding", error: null, decodeResult: null });

      try {
        const form = new FormData();
        for (const entry of validEntries) {
          form.append("files", entry.file);
        }

        const res = await fetch(`${API_BASE}/pipeline/lossless`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(body?.detail ?? `Server error ${res.status}`);
        }

        const bundle: LosslessBundle = await res.json();
        downloadJson(bundle, bundleFilename());
        setState({ running: null, error: null, decodeResult: null });
      } catch (err) {
        setState({
          running: null,
          error: err instanceof Error ? err.message : String(err),
          decodeResult: null,
        });
      }
    },
    [],
  );

  /**
   * Upload a lossless .json bundle file, get back the recovered originals,
   * and store them in state so the UI can show / download them.
   */
  const decodeLossless = useCallback(async (bundleFile: File) => {
    setState({ running: "decoding", error: null, decodeResult: null });

    try {
      const form = new FormData();
      form.append("bundle_file", bundleFile);

      const res = await fetch(`${API_BASE}/pipeline/lossless/decode`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }

      const result: DecodeResult = await res.json();
      setState({ running: null, error: null, decodeResult: result });
    } catch (err) {
      setState({
        running: null,
        error: err instanceof Error ? err.message : String(err),
        decodeResult: null,
      });
    }
  }, []);

  /** Download a single recovered file as a plain-text file. */
  const downloadRecovered = useCallback((file: RecoveredFile) => {
    downloadText(file.content, file.filename);
  }, []);

  /** Clear any decode result and errors from state. */
  const clearDecodeResult = useCallback(() => {
    setState({ running: null, error: null, decodeResult: null });
  }, []);

  return {
    running: state.running,
    error: state.error,
    decodeResult: state.decodeResult,
    exportLossless,
    decodeLossless,
    downloadRecovered,
    clearDecodeResult,
  };
}
