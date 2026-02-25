import { useState } from "react";
import {
  FileText, Upload, X, Loader2, Hash, Cpu, HardDrive,
  AlertCircle, ChevronDown, Layers,
} from "lucide-react";
import type { FileEntry, AnalyzedFile } from "../hooks/useMultiFileAnalyzer";
import { formatSize } from "../hooks/useFileAnalyzer";

// ── FileCard ───────────────────────────────────────────────────────────────────
interface FileCardProps {
  entry: FileEntry;
  onRemove: (id: string) => void;
}

function FileCard({ entry, onRemove }: FileCardProps) {
  const [open, setOpen] = useState(false);
  const { file, analysis, id } = entry;
  const { analyzing, language, tokenCount, fileSize, sizeError, fetchError } = analysis;
  const hasError = !!(sizeError || fetchError);
  const errorMsg = sizeError || fetchError;

  return (
    <div className={`fc-card${hasError ? " fc-card--error" : ""}`}>
      {/* Header row — clicking toggles details */}
      <div
        className="fc-header"
        onClick={() => !hasError && setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !hasError && setOpen((v) => !v)}
      >
        <div className="fc-file-icon">
          {analyzing ? (
            <Loader2 size={16} className="fc-spinner" />
          ) : hasError ? (
            <AlertCircle size={16} className="fc-error-icon" />
          ) : (
            <FileText size={16} />
          )}
        </div>

        <span className="fc-name" title={file.name}>
          {file.name}
        </span>

        {!hasError && (
          <ChevronDown
            size={14}
            className={`fc-chevron${open ? " open" : ""}`}
          />
        )}

        <button
          className="fc-remove"
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          aria-label={`Remove ${file.name}`}
          type="button"
        >
          <X size={12} />
        </button>
      </div>

      {hasError && (
        <div className="fc-error-msg">{errorMsg}</div>
      )}

      {!hasError && (
        <div className={`fc-details${open ? " open" : ""}`}>
          <div className="fc-details-inner">
            <div className="fc-detail-row">
              <HardDrive size={12} className="fc-detail-icon" />
              <span className="fc-detail-label">File size</span>
              <span className="fc-detail-value">
                {fileSize || formatSize(file.size)}
              </span>
            </div>
            <div className="fc-detail-row">
              <Cpu size={12} className="fc-detail-icon" />
              <span className="fc-detail-label">Language</span>
              <span className={`fc-detail-value${language === "Detecting..." ? " fc-muted" : ""}`}>
                {language}
              </span>
            </div>
            <div className="fc-detail-row">
              <Hash size={12} className="fc-detail-icon" />
              <span className="fc-detail-label">Est. tokens</span>
              <span className={`fc-detail-value${tokenCount === "Calculating..." ? " fc-muted" : ""}`}>
                {tokenCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FilePanel ──────────────────────────────────────────────────────────────────
export interface FilePanelProps {
  entries: FileEntry[];
  resolvedFiles: AnalyzedFile[];
  onRemove: (id: string) => void;
}

export default function FilePanel({ entries, resolvedFiles, onRemove }: FilePanelProps) {
  const totalTokens = resolvedFiles.reduce((sum, f) => sum + f.tokenEstimate, 0);
  const hasResolved = resolvedFiles.length > 0;

  return (
    <aside className="file-panel">
      <div className="fp-header">
        <span className="fp-header-title">Attached Files</span>
        {entries.length > 0 && (
          <span className="fp-file-count">{entries.length}</span>
        )}
      </div>

      <div className="fp-body">
        {entries.length === 0 ? (
          <div className="fp-empty">
            <div className="fp-empty-icon">
              <Upload size={30} strokeWidth={1.5} />
            </div>
            <p className="fp-empty-title">No files attached yet</p>
            <p className="fp-empty-sub">
              Click the paperclip icon in the prompt bar to attach code files.
              Each file is analysed individually.
            </p>
          </div>
        ) : (
          <div className="fp-file-list">
            {entries.map((entry) => (
              <FileCard key={entry.id} entry={entry} onRemove={onRemove} />
            ))}
          </div>
        )}
      </div>

      {hasResolved && (
        <div className="fp-summary">
          <div className="fp-summary-row">
            <span className="fp-summary-label">
              <Layers size={13} /> Total files
            </span>
            <span className="fp-summary-value">{resolvedFiles.length}</span>
          </div>
          <div className="fp-summary-row fp-summary-tokens">
            <span className="fp-summary-label fp-summary-label--accent">
              <Hash size={13} /> Total Context Tokens
            </span>
            <span className="fp-summary-accent">{totalTokens.toLocaleString()}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
