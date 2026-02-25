import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Galaxy from "../background";
import ChatArea from "../components/ChatArea";
import type { Message } from "../components/ChatArea";
import PromptInput from "../components/PromptInput";
import FilePanel from "../components/FilePanel";
import CompressPreview from "../components/CompressPreview";
import { useMultiFileAnalyzer } from "../hooks/useMultiFileAnalyzer";
import { useCompressor } from "../hooks/useCompressor";
import { useCompressResults } from "../contexts/CompressResultsContext";

let msgCounter = 0;
function uid() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { setResultsData } = useCompressResults();
  const [messages, setMessages] = useState<Message[]>([]);
  const { entries: fileEntries, resolvedFiles, addFiles, removeFile } = useMultiFileAnalyzer();
  const { compResults, compressing, compressFiles, clearResults } = useCompressor();
  const [showResults, setShowResults] = useState(false);

  const handleCompress = useCallback(() => {
    const filesToCompress = fileEntries
      .filter((e) => !e.analysis.sizeError && !e.analysis.fetchError && !e.analysis.analyzing)
      .map((e) => ({ id: e.id, file: e.file }));
    if (filesToCompress.length === 0) return;
    setShowResults(true);
    compressFiles(filesToCompress);
  }, [fileEntries, compressFiles]);

  const handleCloseResults = useCallback(() => {
    setShowResults(false);
    clearResults();
  }, [clearResults]);

  const handleShowDetails = useCallback(() => {
    setResultsData(compResults);
    navigate("/details");
  }, [setResultsData, compResults, navigate]);

  const handleSend = useCallback(
    (text: string) => {
      const userMsg: Message = { id: uid(), role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);

      // Placeholder assistant response
      setTimeout(() => {
        const assistantMsg: Message = {
          id: uid(),
          role: "assistant",
          content: "⏳ Processing your request…",
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }, 600);
    },
    []
  );

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="chat-layout">
      {/* OGL Galaxy background — kept alive */}
      <div className="galaxy-bg" style={{ zIndex: 0 }}>
        <Galaxy
          speed={0.4}
          density={0.8}
          hueShift={200}
          glowIntensity={0.15}
          saturation={0.3}
          twinkleIntensity={0.3}
          rotationSpeed={0.02}
          transparent={false}
          autoCenterRepulsion={0.5}
        />
      </div>

      {/* Left: Compression preview (replaces former sidebar) */}
      {showResults && compResults.length > 0 && (
        <CompressPreview
          entries={compResults}
          onShowDetails={handleShowDetails}
          onClose={handleCloseResults}
        />
      )}

      {/* Center column */}
      <div className="chat-center">
        <ChatArea messages={messages} />
        <PromptInput
          onSend={handleSend}
          onAddFiles={addFiles}
          hasFiles={fileEntries.length > 0}
        />
      </div>

      {/* Right file panel */}
      <FilePanel
        entries={fileEntries}
        resolvedFiles={resolvedFiles}
        onRemove={removeFile}
        onCompress={handleCompress}
        compressing={compressing}
        hasCompressResults={compResults.length > 0 && showResults}
      />
    </div>
  );
}
