import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Galaxy from "../background";
import AppNav from "../components/AppNav";
import ChatArea from "../components/ChatArea";
import type { Message } from "../components/ChatArea";
import PromptInput from "../components/PromptInput";
import FilePanel from "../components/FilePanel";
import { useMultiFileAnalyzer } from "../hooks/useMultiFileAnalyzer";
import { useCompressor } from "../hooks/useCompressor";
import { useCompressResults } from "../contexts/CompressResultsContext";

let msgCounter = 0;
function uid() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { setResultsData, setExportContext } = useCompressResults();
  const [messages, setMessages] = useState<Message[]>([]);
  const { entries: fileEntries, resolvedFiles, addFiles, removeFile } = useMultiFileAnalyzer();
  const { compResults, compressing, compressFiles } = useCompressor();

  // Track when compression finishes so we can navigate
  const wasCompressing = useRef(false);
  useEffect(() => {
    if (wasCompressing.current && !compressing && compResults.length > 0) {
      setResultsData(compResults);
      navigate("/export");
    }
    wasCompressing.current = compressing;
  }, [compressing, compResults, setResultsData, navigate]);

  const handleCompress = useCallback(() => {
    const filesToCompress = fileEntries
      .filter((e) => !e.analysis.sizeError && !e.analysis.fetchError && !e.analysis.analyzing)
      .map((e) => ({ id: e.id, file: e.file }));
    if (filesToCompress.length === 0) return;
    // Save export context before compressing so ExportPage can use them
    setExportContext(messages, fileEntries);
    compressFiles(filesToCompress);
  }, [fileEntries, messages, compressFiles, setExportContext]);

  /** When code is pasted in the prompt, treat it as a virtual file and compress immediately. */
  const handlePasteCode = useCallback(
    (text: string) => {
      const blob = new Blob([text], { type: "text/plain" });
      const file = new File([blob], "pasted-code.txt", { type: "text/plain" });
      const id = `paste-${Date.now()}`;
      // Add to FilePanel so the user can see it
      addFiles([file]);
      // Save context and kick off compression immediately
      setExportContext(messages, fileEntries);
      compressFiles([{ id, file }]);
    },
    [addFiles, compressFiles, messages, fileEntries, setExportContext]
  );

  const handleSend = useCallback(
    (text: string) => {
      const userMsg: Message = { id: uid(), role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);

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

      {/* Centered column: topbar → chat → file tray → input */}
      <div className="chat-center">
        <AppNav
          left={
            <button className="app-nav-back" onClick={() => navigate("/")} type="button">
              <ArrowLeft size={14} /> Home
            </button>
          }
          right={<span className="app-nav-hint">Attach files · write a prompt · compress</span>}
        />

        <ChatArea messages={messages} />

        <FilePanel
          entries={fileEntries}
          resolvedFiles={resolvedFiles}
          onRemove={removeFile}
          onCompress={handleCompress}
          compressing={compressing}
          hasCompressResults={compResults.length > 0}
        />

        <PromptInput
          onSend={handleSend}
          onAddFiles={addFiles}
          onPasteCode={handlePasteCode}
          hasFiles={fileEntries.length > 0}
        />
      </div>
    </div>
  );
}
