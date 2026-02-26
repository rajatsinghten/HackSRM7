/**
 * ExportPage
 * ──────────
 * Full-page view after compression.
 * Three tabs: Results · Export · Decode
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowRight, BarChart3, Binary, Code, Copy, Check,
  FileText, Hash, Layers, Minimize2, Zap, AlertCircle, Loader2, ChevronDown,
  Download, ShieldCheck, Puzzle,
} from "lucide-react";
import AppNav from "../components/AppNav";
import Galaxy from "../background";
import type { FileCompressionEntry } from "../hooks/useCompressor";
import { useCompressResults } from "../contexts/CompressResultsContext";
import { usePipeline } from "../hooks/usePipeline";
import { useLossless } from "../hooks/useLossless";
import MonacoViewer from "../components/MonacoViewer";
import LosslessDecoder from "../components/LosslessDecoder";

// ── Tab type ─────────────────────────────────────────────────────────────────

type ExportTab = "results" | "export" | "decode";

// ── ResultCard (reused from AllResultsPage) ──────────────────────────────────

type ViewTab = "original" | "compressed" | "minified" | "skeleton" | "architecture";

function ResultCard({ entry }: { entry: FileCompressionEntry }) {
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
        <div className="cr-loading-bar"><div className="cr-loading-bar-inner" /></div>
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

  const tabContent: Record<ViewTab, string> = {
    original: originalContent,
    compressed: r.summaryLevels.compressed.content,
    minified: r.minification.code,
    skeleton: r.summaryLevels.skeleton.content,
    architecture: r.summaryLevels.architecture.content,
  };
  const tabLabels: Record<ViewTab, string> = {
    original: "Original", compressed: "Compressed", minified: "Minified",
    skeleton: "Skeleton", architecture: "Architecture",
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
    } catch { /* noop */ }
  };

  return (
    <div className="cr-card">
      <div
        className="cr-card-header"
        onClick={() => setExpanded((v) => !v)}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
      >
        <FileText size={16} className="cr-file-icon" />
        <span className="cr-card-name">{fileName}</span>
        <span className="cr-badge cr-badge--success">
          <ArrowDown size={11} />{r.overallReductionPct.toFixed(1)}% smaller
        </span>
        <ChevronDown size={14} className={`cr-chevron${expanded ? " open" : ""}`} />
      </div>

      {expanded && (
        <>
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
              <span className="cr-stat-value cr-stat-value--accent">{r.bestTokens.toLocaleString()} tokens</span>
            </div>
          </div>

          <div className="cr-metrics">
            <div className="cr-metric"><Minimize2 size={12} /><span>Minify</span><span className="cr-metric-val">−{r.minification.reductionPct.toFixed(1)}%</span></div>
            <div className="cr-metric"><Binary size={12} /><span>Huffman</span><span className="cr-metric-val">{r.huffman.compressionRatio.toFixed(2)}x</span></div>
            <div className="cr-metric"><Hash size={12} /><span>Hashes</span><span className="cr-metric-val">{r.hashTable.entriesCount}</span></div>
            <div className="cr-metric"><Code size={12} /><span>Chunks</span><span className="cr-metric-val">{r.totalChunks}</span></div>
          </div>

          <div className="cr-tabs">
            {(Object.keys(tabLabels) as ViewTab[]).map((key) => (
              <button key={key} className={`cr-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key)} type="button">
                {tabLabels[key]}<span className="cr-tab-tokens">{tabTokens[key].toLocaleString()}t</span>
              </button>
            ))}
          </div>

          <div className="cr-code-wrap cr-code-wrap--monaco">
            <button className="cr-copy-btn" onClick={handleCopy} title="Copy to clipboard" type="button">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <MonacoViewer value={tabContent[tab]} language={r.language} maxHeight={480} minHeight={120} lineNumbers={tab === "original"} />
          </div>

          {r.decodePreamble && <DecodePreamble preamble={r.decodePreamble} />}
        </>
      )}
    </div>
  );
}

// ── Decode preamble collapsible ─────────────────────────────────────────────

function DecodePreamble({ preamble }: { preamble: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preamble);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <div className="cr-preamble">
      <button className="cr-preamble-toggle" onClick={() => setOpen((v) => !v)} type="button">
        <BarChart3 size={13} /><span>Decode Preamble for LLM</span>
        <ChevronDown size={13} className={`cr-chevron-sm${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="cr-preamble-body">
          <button className="cr-copy-btn cr-copy-btn--preamble" onClick={handleCopy} title="Copy preamble" type="button">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <MonacoViewer value={preamble} language="plaintext" maxHeight={320} minHeight={80} />
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ExportPage() {
  const navigate = useNavigate();
  const {
    resultsData: entries,
    messages,
    fileEntries,
  } = useCompressResults();

  const {
    running: pipelineRunning,
    error: pipelineError,
    exportRaw,
    exportCompressed,
    exportNoExtension,
    exportWithExtension,
    clearError: clearPipelineError,
  } = usePipeline();

  const {
    running: losslessRunning,
    error: losslessError,
    decodeResult: losslessDecodeResult,
    exportLossless,
    decodeLossless,
    decodeWithExtension,
    downloadRecovered,
    clearDecodeResult,
  } = useLossless();

  const [activeTab, setActiveTab] = useState<ExportTab>("results");

  // Redirect if no data
  if (entries.length === 0) {
    navigate("/chat", { replace: true });
    return null;
  }

  const anyExporting =
    pipelineRunning === "raw" ||
    pipelineRunning === "compressed" ||
    pipelineRunning === "no-extension" ||
    pipelineRunning === "with-extension" ||
    losslessRunning === "encoding";

  const handleExportRaw = useCallback(
    () => exportRaw(messages, fileEntries), [exportRaw, messages, fileEntries],
  );
  const handleExportCompressed = useCallback(
    () => exportCompressed(messages, fileEntries), [exportCompressed, messages, fileEntries],
  );
  const handleExportNoExt = useCallback(
    () => exportNoExtension(messages, fileEntries), [exportNoExtension, messages, fileEntries],
  );
  const handleExportWithExt = useCallback(
    () => exportWithExtension(messages, fileEntries), [exportWithExtension, messages, fileEntries],
  );
  const handleExportLossless = useCallback(
    () => exportLossless(fileEntries), [exportLossless, fileEntries],
  );

  // ── Tabs ────────────────────────────────────────────────────────────────
  const tabs: { id: ExportTab; label: string; icon: React.ReactNode }[] = [
    { id: "results",  label: "Results",  icon: <BarChart3 size={14} /> },
    { id: "export",   label: "Export",   icon: <Download size={14} /> },
    { id: "decode",   label: "Decode",   icon: <ShieldCheck size={14} /> },
  ];

  return (
    <div className="ep-layout">
      {/* Background */}
      <div className="galaxy-bg" style={{ zIndex: 0 }}>
        <Galaxy
          speed={0.3} density={0.6} hueShift={220}
          glowIntensity={0.1} saturation={0.25} twinkleIntensity={0.2}
          rotationSpeed={0.015} transparent={false} autoCenterRepulsion={0.4}
        />
      </div>

      {/* Top bar */}
      <AppNav
        left={
          <button className="app-nav-back" onClick={() => navigate("/chat")} type="button">
            <ArrowLeft size={14} /> Back to Chat
          </button>
        }
      />

      {/* Tabs */}
      <nav className="ep-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`ep-tab${activeTab === t.id ? " ep-tab--active" : ""}`}
            onClick={() => setActiveTab(t.id)}
            type="button"
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Error banner */}
      {(pipelineError || losslessError) && (
        <div className="ep-error-banner">
          <AlertCircle size={14} />
          <span>{pipelineError || losslessError}</span>
          <button onClick={() => { clearPipelineError(); }} type="button">×</button>
        </div>
      )}

      {/* ── RESULTS TAB ───────────────────────────────────────────────────── */}
      {activeTab === "results" && (
        <div className="ep-body">
          <div className="ep-results-list">
            {entries.map((entry) => (
              <ResultCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* ── EXPORT TAB ────────────────────────────────────────────────────── */}
      {activeTab === "export" && (
        <div className="ep-body">
          <div className="ep-export-grid">
            {/* No Extension card */}
            <div className="ep-card ep-card--no-ext">
              <div className="ep-card-icon"><Zap size={28} /></div>
              <h3 className="ep-card-title">No Extension</h3>
              <p className="ep-card-sub">LLM self-decodes</p>
              <p className="ep-card-desc">
                Compressed text bundled with a full decode guide.
                Any LLM can expand it on its own — no plugin needed.
              </p>
              <button
                className="ep-card-btn ep-card-btn--no-ext"
                onClick={handleExportNoExt}
                disabled={anyExporting}
                type="button"
              >
                {pipelineRunning === "no-extension" ? (
                  <><Loader2 size={15} className="fc-spinner" /> Building…</>
                ) : (
                  <><Download size={15} /> Export Bundle (.txt)</>
                )}
              </button>
            </div>

            {/* With Extension card */}
            <div className="ep-card ep-card--with-ext">
              <div className="ep-card-icon"><Puzzle size={28} /></div>
              <h3 className="ep-card-title">With Extension</h3>
              <p className="ep-card-sub">Silent auto-decode</p>
              <p className="ep-card-desc">
                Lossless payload in a sentinel envelope.
                The TokenTrim extension decodes silently — zero overhead tokens.
              </p>
              <button
                className="ep-card-btn ep-card-btn--with-ext"
                onClick={handleExportWithExt}
                disabled={anyExporting}
                type="button"
              >
                {pipelineRunning === "with-extension" ? (
                  <><Loader2 size={15} className="fc-spinner" /> Encoding…</>
                ) : (
                  <><Download size={15} /> Export Bundle (.txt)</>
                )}
              </button>
            </div>
          </div>

          {/* Other formats */}
          <div className="ep-other-formats">
            <span className="ep-other-label">Other formats</span>
            <div className="ep-other-btns">
              <button
                className="ep-other-btn"
                onClick={handleExportRaw}
                disabled={anyExporting}
                type="button"
              >
                {pipelineRunning === "raw" ? (
                  <><Loader2 size={14} className="fc-spinner" /> Building…</>
                ) : (
                  <><Download size={14} /> Raw Bundle (.txt)</>
                )}
              </button>
              <button
                className="ep-other-btn"
                onClick={handleExportCompressed}
                disabled={anyExporting}
                type="button"
              >
                {pipelineRunning === "compressed" ? (
                  <><Loader2 size={14} className="fc-spinner" /> Compressing…</>
                ) : (
                  <><Zap size={14} /> Compressed Bundle (.txt)</>
                )}
              </button>
              <button
                className="ep-other-btn"
                onClick={handleExportLossless}
                disabled={anyExporting}
                type="button"
              >
                {losslessRunning === "encoding" ? (
                  <><Loader2 size={14} className="fc-spinner" /> Encoding…</>
                ) : (
                  <><ShieldCheck size={14} /> Lossless Archive (.json)</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DECODE TAB ────────────────────────────────────────────────────── */}
      {activeTab === "decode" && (
        <div className="ep-body">
          <p className="ep-decode-desc">
            Upload a <strong>Lossless Bundle (.json)</strong> or a
            <strong> With-Extension bundle (.txt)</strong> to recover all
            original files — byte-perfect, zero data loss.
          </p>
          <LosslessDecoder
            running={losslessRunning}
            error={losslessError}
            decodeResult={losslessDecodeResult}
            onDecode={decodeLossless}
            onDecodeExt={decodeWithExtension}
            onDownloadFile={downloadRecovered}
            onClear={clearDecodeResult}
          />
        </div>
      )}
    </div>
  );
}
