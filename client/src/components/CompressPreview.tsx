import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Zap,
  Layers,
  ArrowDown,
  ArrowRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { FileCompressionEntry } from "../hooks/useCompressor";
import MonacoViewer from "./MonacoViewer";

type PreviewTab = "original" | "compressed";

interface CompressPreviewProps {
  entries: FileCompressionEntry[];
  onShowDetails: () => void;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function CompressPreview({
  entries,
  onShowDetails,
  onClose,
  collapsed,
  onToggleCollapse,
}: CompressPreviewProps) {
  const [tab, setTab] = useState<PreviewTab>("compressed");
  const [copied, setCopied] = useState(false);

  // Find the best result (highest reduction %)
  const completedEntries = entries.filter((e) => e.result !== null);

  // ── Always render the collapsed strip when collapsed, regardless of load state ──
  if (collapsed) {
    return (
      <button
        className="cp-collapsed"
        onClick={onToggleCollapse}
        type="button"
        title="Expand results panel"
      >
        <ChevronRight size={14} />
        <Zap size={14} className="cp-collapsed-icon" />
        <span className="cp-collapsed-label">Results</span>
      </button>
    );
  }

  // Nothing to show yet — render idle or loading state inside the panel
  if (completedEntries.length === 0) {
    const isCompressing = entries.some((e) => e.compressing);
    return (
      <aside className="cp-panel">
        <div className="cp-header">
          <div className="cp-header-left">
            <Zap size={15} className="cp-header-icon" />
            <span className="cp-header-title">Compression</span>
          </div>
          <div className="cp-header-actions">
            <button
              className="cp-collapse-btn"
              onClick={onToggleCollapse}
              title="Collapse panel"
              type="button"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
        <div className="cp-empty">
          {isCompressing ? (
            <>
              <Loader2 size={28} className="cp-empty-spinner" />
              <p className="cp-empty-title">Compressing…</p>
              <p className="cp-empty-sub">Analysing and compressing your files</p>
            </>
          ) : (
            <>
              <div className="cp-empty-icon">
                <Zap size={26} strokeWidth={1.5} />
              </div>
              <p className="cp-empty-title">No results yet</p>
              <p className="cp-empty-sub">
                Attach files in the right panel and click
                &ldquo;Compress Files&rdquo; to see compression results here.
              </p>
            </>
          )}
        </div>
      </aside>
    );
  }

  const bestEntry = completedEntries.reduce((best, cur) =>
    (cur.result!.overallReductionPct > (best.result?.overallReductionPct ?? 0))
      ? cur
      : best
  );

  const r = bestEntry.result!;

  const content =
    tab === "original"
      ? bestEntry.originalContent
      : r.summaryLevels.compressed.content;

  // Aggregate stats
  const totalOriginal = completedEntries.reduce(
    (s, e) => s + (e.result?.originalTokens ?? 0),
    0
  );
  const totalBest = completedEntries.reduce(
    (s, e) => s + (e.result?.bestTokens ?? 0),
    0
  );
  const totalReduction =
    totalOriginal > 0
      ? ((1 - totalBest / totalOriginal) * 100).toFixed(1)
      : "0";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <aside className="cp-panel">
      {/* Header */}
      <div className="cp-header">
        <div className="cp-header-left">
          <Zap size={15} className="cp-header-icon" />
          <span className="cp-header-title">Best Compression</span>
        </div>
        <div className="cp-header-actions">
          <button
            className="cp-collapse-btn"
            onClick={onToggleCollapse}
            title="Collapse panel"
            type="button"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="cp-close-btn"
            onClick={onClose}
            title="Close results"
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="cp-summary">
        <div className="cp-summary-stat">
          <Layers size={12} />
          <span>{completedEntries.length} file{completedEntries.length > 1 ? "s" : ""}</span>
        </div>
        <div className="cp-summary-stat">
          <span className="cp-summary-tokens">
            {totalOriginal.toLocaleString()}
          </span>
          <ArrowRight size={11} />
          <span className="cp-summary-tokens cp-summary-tokens--accent">
            {totalBest.toLocaleString()}
          </span>
          <span className="cp-summary-unit">tokens</span>
        </div>
        <span className="cp-summary-badge">
          <ArrowDown size={10} />
          −{totalReduction}%
        </span>
      </div>

      {/* Best file name */}
      <div className="cp-best-file">
        <span className="cp-best-label">Best result:</span>
        <span className="cp-best-name" title={bestEntry.fileName}>
          {bestEntry.fileName}
        </span>
        <span className="cp-best-reduction">
          −{r.overallReductionPct.toFixed(1)}%
        </span>
      </div>

      {/* Tab bar */}
      <div className="cp-tabs">
        <button
          className={`cp-tab${tab === "original" ? " active" : ""}`}
          onClick={() => setTab("original")}
          type="button"
        >
          Original
          <span className="cp-tab-tokens">{r.originalTokens.toLocaleString()}t</span>
        </button>
        <button
          className={`cp-tab${tab === "compressed" ? " active" : ""}`}
          onClick={() => setTab("compressed")}
          type="button"
        >
          Compressed
          <span className="cp-tab-tokens">{r.bestTokens.toLocaleString()}t</span>
        </button>
      </div>

      {/* Code preview — Monaco Editor */}
      <div className="cp-code-wrap cp-code-wrap--monaco">
        <button
          className="cp-copy-btn"
          onClick={handleCopy}
          title="Copy to clipboard"
          type="button"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        <MonacoViewer
          value={content}
          language={r.language}
          lineNumbers={tab === "original"}
          maxHeight={280}
        />
      </div>

      {/* Show details button */}
      {completedEntries.length > 0 && (
        <div className="cp-footer">
          <button className="cp-details-btn" onClick={onShowDetails} type="button">
            <ExternalLink size={13} />
            Show Details
            {completedEntries.length > 1 && (
              <span className="cp-details-count">
                {completedEntries.length} files
              </span>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
