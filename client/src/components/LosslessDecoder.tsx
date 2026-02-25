/**
 * LosslessDecoder
 * ───────────────
 * Panel that lets the user upload a TokenTrim lossless bundle (.json) and
 * instantly recover all original files with byte-perfect fidelity.
 *
 * States:
 *   idle     — drag-and-drop zone
 *   decoding — spinner
 *   results  — grid of recovered files with individual download buttons
 *   error    — error message + retry
 */

import { useRef, useCallback, useState } from "react";
import {
  Upload, Download, CheckCircle, AlertCircle,
  Loader2, FileText, X, RotateCcw, ShieldCheck,
} from "lucide-react";
import type { RecoveredFile } from "../hooks/useLossless";
import { formatSize } from "../hooks/useFileAnalyzer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface LosslessDecoderProps {
  running: "encoding" | "decoding" | null;
  error: string | null;
  decodeResult: { files: RecoveredFile[]; total_files: number } | null;
  onDecode: (file: File) => void;
  onDownloadFile: (file: RecoveredFile) => void;
  onClear: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LosslessDecoder({
  running,
  error,
  decodeResult,
  onDecode,
  onDownloadFile,
  onClear,
}: LosslessDecoderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // ── File acceptance ───────────────────────────────────────────────────────

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".json")) {
        return; // silently ignore non-JSON drops
      }
      onDecode(file);
    },
    [onDecode],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // reset so the same file can be loaded again
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const isDecoding = running === "decoding";

  // ── Idle / drop zone ──────────────────────────────────────────────────────
  if (!isDecoding && !decodeResult && !error) {
    return (
      <div className="ld-wrap">
        <div className="ld-header">
          <ShieldCheck size={15} className="ld-header-icon" />
          <span>Decode Lossless Bundle</span>
        </div>

        <div
          className={`ld-dropzone${dragging ? " ld-dropzone--active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          title="Drop a .json lossless bundle here"
        >
          <Upload size={22} className="ld-drop-icon" />
          <p className="ld-drop-title">Drop lossless bundle</p>
          <p className="ld-drop-sub">
            .json file exported by TokenTrim Lossless Bundle
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            onChange={onInputChange}
            style={{ display: "none" }}
          />
        </div>
      </div>
    );
  }

  // ── Decoding spinner ──────────────────────────────────────────────────────
  if (isDecoding) {
    return (
      <div className="ld-wrap">
        <div className="ld-header">
          <ShieldCheck size={15} className="ld-header-icon" />
          <span>Decode Lossless Bundle</span>
        </div>
        <div className="ld-loading">
          <Loader2 size={28} className="ld-spinner" />
          <p>Reconstructing original files…</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="ld-wrap">
        <div className="ld-header">
          <ShieldCheck size={15} className="ld-header-icon ld-header-icon--error" />
          <span>Decode Failed</span>
          <button className="ld-close" onClick={onClear} title="Dismiss">
            <X size={13} />
          </button>
        </div>
        <div className="ld-error">
          <AlertCircle size={18} />
          <p>{error}</p>
        </div>
        <button className="ld-retry-btn" onClick={onClear}>
          <RotateCcw size={13} /> Try again
        </button>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (decodeResult) {
    const allMatch = decodeResult.files.every((f) => f.match);

    return (
      <div className="ld-wrap">
        <div className="ld-header">
          <ShieldCheck
            size={15}
            className={`ld-header-icon${allMatch ? " ld-header-icon--ok" : " ld-header-icon--warn"}`}
          />
          <span>
            {decodeResult.total_files} file
            {decodeResult.total_files !== 1 ? "s" : ""} recovered
          </span>
          <button className="ld-close" onClick={onClear} title="Clear results">
            <X size={13} />
          </button>
        </div>

        {allMatch ? (
          <div className="ld-badge ld-badge--ok">
            <CheckCircle size={13} /> 100% lossless — byte-perfect match
          </div>
        ) : (
          <div className="ld-badge ld-badge--warn">
            <AlertCircle size={13} /> Some files may have size mismatches
          </div>
        )}

        <div className="ld-file-list">
          {decodeResult.files.map((rf) => (
            <div key={rf.filename} className="ld-file-row">
              <div className="ld-file-info">
                <FileText size={13} className="ld-file-icon" />
                <span className="ld-file-name" title={rf.filename}>
                  {rf.filename}
                </span>
                <span
                  className={`ld-file-badge${rf.match ? " ld-file-badge--ok" : " ld-file-badge--warn"}`}
                >
                  {rf.match ? "✓" : "!"}
                </span>
              </div>

              <div className="ld-file-meta">
                <span>{formatSize(rf.recovered_size)}</span>
                <span className="ld-file-lang">{rf.language}</span>
              </div>

              <button
                className="ld-dl-btn"
                onClick={() => onDownloadFile(rf)}
                title={`Download ${rf.filename}`}
              >
                <Download size={12} /> Download
              </button>
            </div>
          ))}
        </div>

        <button className="ld-retry-btn ld-retry-btn--decode-another" onClick={onClear}>
          <RotateCcw size={12} /> Decode another bundle
        </button>
      </div>
    );
  }

  return null;
}
