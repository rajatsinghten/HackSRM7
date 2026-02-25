import { useState, useRef } from "react";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Binary,
  Code,
  Copy,
  Check,
  FileText,
  Hash,
  Layers,
  Minimize2,
  Zap,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import type { FileCompressionEntry } from "../hooks/useCompressor";

// ── Per-file result card ────────────────────────────────────────────────────

interface ResultCardProps {
  entry: FileCompressionEntry;
}

type ViewTab = "original" | "compressed" | "minified" | "skeleton" | "architecture";

function ResultCard({ entry }: ResultCardProps) {
  const { fileName, originalContent, compressing, result, error } = entry;
  const [tab, setTab] = useState<ViewTab>("compressed");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (compressing) {
    return (
      <div className="cr-card cr-card--loading">
        <div className="cr-card-header">
          <Loader2 size={16} className="cr-spinner" />
          <span className="cr-card-name">{fileName}</span>
          <span className="cr-badge cr-badge--loading">Compressing…</span>
        </div>
        <div className="cr-loading-bar">
          <div className="cr-loading-bar-inner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cr-card cr-card--error">
        <div className="cr-card-header">
          <AlertCircle size={16} className="cr-error-icon" />
          <span className="cr-card-name">{fileName}</span>
        </div>
        <div className="cr-error-body">{error}</div>
      </div>
    );
  }

  if (!result) return null;

  const r = result;

  // Get the content for the active tab
  const tabContent: Record<ViewTab, string> = {
    original: originalContent,
    compressed: r.summaryLevels.compressed.content,
    minified: r.minification.code,
    skeleton: r.summaryLevels.skeleton.content,
    architecture: r.summaryLevels.architecture.content,
  };

  const tabLabels: Record<ViewTab, string> = {
    original: "Original",
    compressed: "Compressed",
    minified: "Minified",
    skeleton: "Skeleton",
    architecture: "Architecture",
  };

  const tabTokens: Record<ViewTab, number> = {
    original: r.originalTokens,
    compressed: r.summaryLevels.compressed.tokens,
    minified: r.minification.tokens,
    skeleton: r.summaryLevels.skeleton.tokens,
    architecture: r.summaryLevels.architecture.tokens,
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tabContent[tab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="cr-card">
      {/* Header */}
      <div
        className="cr-card-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      >
        <FileText size={16} className="cr-file-icon" />
        <span className="cr-card-name">{fileName}</span>
        <span className="cr-badge cr-badge--success">
          <ArrowDown size={11} />
          {r.overallReductionPct.toFixed(1)}% smaller
        </span>
        <ChevronDown
          size={14}
          className={`cr-chevron${expanded ? " open" : ""}`}
        />
      </div>

      {expanded && (
        <>
          {/* Stats bar */}
          <div className="cr-stats">
            <div className="cr-stat">
              <Layers size={13} className="cr-stat-icon" />
              <span className="cr-stat-label">Original</span>
              <span className="cr-stat-value">{r.originalTokens.toLocaleString()} tokens</span>
            </div>
            <ArrowRight size={14} className="cr-stat-arrow" />
            <div className="cr-stat">
              <Zap size={13} className="cr-stat-icon cr-stat-icon--accent" />
              <span className="cr-stat-label">Best ({r.bestLevel})</span>
              <span className="cr-stat-value cr-stat-value--accent">
                {r.bestTokens.toLocaleString()} tokens
              </span>
            </div>
          </div>

          {/* Detail metrics */}
          <div className="cr-metrics">
            <div className="cr-metric">
              <Minimize2 size={12} />
              <span>Minify</span>
              <span className="cr-metric-val">−{r.minification.reductionPct.toFixed(1)}%</span>
            </div>
            <div className="cr-metric">
              <Binary size={12} />
              <span>Huffman</span>
              <span className="cr-metric-val">{r.huffman.compressionRatio.toFixed(2)}x</span>
            </div>
            <div className="cr-metric">
              <Hash size={12} />
              <span>Hashes</span>
              <span className="cr-metric-val">{r.hashTable.entriesCount}</span>
            </div>
            <div className="cr-metric">
              <Code size={12} />
              <span>Chunks</span>
              <span className="cr-metric-val">{r.totalChunks}</span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="cr-tabs">
            {(Object.keys(tabLabels) as ViewTab[]).map((key) => (
              <button
                key={key}
                className={`cr-tab${tab === key ? " active" : ""}`}
                onClick={() => setTab(key)}
                type="button"
              >
                {tabLabels[key]}
                <span className="cr-tab-tokens">{tabTokens[key].toLocaleString()}t</span>
              </button>
            ))}
          </div>

          {/* Code viewer */}
          <div className="cr-code-wrap">
            <button
              className="cr-copy-btn"
              onClick={handleCopy}
              title="Copy to clipboard"
              type="button"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <pre className="cr-code">
              <code>{tabContent[tab]}</code>
            </pre>
          </div>

          {/* Decode preamble (collapsible) */}
          {r.decodePreamble && (
            <DecodePreamble preamble={r.decodePreamble} />
          )}
        </>
      )}
    </div>
  );
}

// ── Decode preamble collapsible ─────────────────────────────────────────────

function DecodePreamble({ preamble }: { preamble: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // After the DOM updates, scroll the preamble body into view
      setTimeout(() => {
        bodyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preamble);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="cr-preamble" ref={bodyRef}>
      <button
        className="cr-preamble-toggle"
        onClick={handleToggle}
        type="button"
      >
        <BarChart3 size={13} />
        <span>Decode Preamble for LLM</span>
        <ChevronDown
          size={13}
          className={`cr-chevron-sm${open ? " open" : ""}`}
        />
      </button>
      {open && (
        <div className="cr-preamble-body">
          <button
            className="cr-copy-btn cr-copy-btn--preamble"
            onClick={handleCopy}
            title="Copy preamble"
            type="button"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <pre className="cr-code cr-code--preamble">
            <code>{preamble}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main CompressResults panel ──────────────────────────────────────────────

export interface CompressResultsProps {
  entries: FileCompressionEntry[];
  onClose: () => void;
}

export default function CompressResults({ entries, onClose }: CompressResultsProps) {
  if (entries.length === 0) return null;

  // Aggregate stats
  const completed = entries.filter((e) => e.result !== null);
  const totalOriginal = completed.reduce((s, e) => s + (e.result?.originalTokens ?? 0), 0);
  const totalBest = completed.reduce((s, e) => s + (e.result?.bestTokens ?? 0), 0);
  const totalReduction =
    totalOriginal > 0 ? ((1 - totalBest / totalOriginal) * 100).toFixed(1) : "0";

  return (
    <div className="cr-panel">
      <div className="cr-panel-header">
        <div className="cr-panel-title-row">
          <Zap size={16} className="cr-panel-icon" />
          <span className="cr-panel-title">Compression Results</span>
        </div>
        {completed.length > 0 && (
          <div className="cr-panel-summary">
            <span className="cr-panel-stat">
              {totalOriginal.toLocaleString()} <ArrowRight size={12} />{" "}
              <strong>{totalBest.toLocaleString()}</strong> tokens
            </span>
            <span className="cr-panel-reduction">−{totalReduction}%</span>
          </div>
        )}
        <button className="cr-panel-close" onClick={onClose} type="button" aria-label="Close">
          ×
        </button>
      </div>
      <div className="cr-panel-body">
        {entries.map((entry) => (
          <ResultCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
