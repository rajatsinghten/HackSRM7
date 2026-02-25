import { useState, useCallback } from "react";
import Galaxy from "../background";
import Sidebar from "../components/Sidebar";
import type { ChatEntry } from "../components/Sidebar";
import ChatArea from "../components/ChatArea";
import type { Message } from "../components/ChatArea";
import PromptInput from "../components/PromptInput";
import FilePanel from "../components/FilePanel";
import { useMultiFileAnalyzer } from "../hooks/useMultiFileAnalyzer";

let msgCounter = 0;
function uid() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

let chatCounter = 0;
function chatId() {
  return `chat-${++chatCounter}`;
}

function newChat(firstMsg?: string): ChatEntry {
  return {
    id: chatId(),
    title: firstMsg ? firstMsg.slice(0, 36) + (firstMsg.length > 36 ? "…" : "") : "New Chat",
  };
}

export default function ChatPage() {
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({});
  const { entries: fileEntries, resolvedFiles, addFiles, removeFile } = useMultiFileAnalyzer();

  const activeMessages: Message[] = (activeChatId && messagesByChat[activeChatId]) || [];

  const handleNewChat = useCallback(() => {
    const entry = newChat();
    setChats((prev) => [entry, ...prev]);
    setActiveChatId(entry.id);
    setMessagesByChat((prev) => ({ ...prev, [entry.id]: [] }));
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id);
  }, []);

  const handleDeleteChat = useCallback((id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      // Synchronously compute fallback active chat inside the batch
      setActiveChatId((curActive) =>
        curActive === id ? (next[0]?.id ?? null) : curActive
      );
      return next;
    });
    setMessagesByChat((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      let currentId = activeChatId;

      // If no active chat, create one automatically
      if (!currentId) {
        const entry = newChat(text);
        currentId = entry.id;
        setChats((prev) => [entry, ...prev]);
        setActiveChatId(currentId);
        setMessagesByChat((prev) => ({ ...prev, [currentId!]: [] }));
      } else {
        // Update title from first message if still "New Chat"
        setChats((prev) =>
          prev.map((c) =>
            c.id === currentId && c.title === "New Chat"
              ? { ...c, title: text.slice(0, 36) + (text.length > 36 ? "…" : "") }
              : c
          )
        );
      }

      const userMsg: Message = { id: uid(), role: "user", content: text };

      setMessagesByChat((prev) => ({
        ...prev,
        [currentId!]: [...(prev[currentId!] || []), userMsg],
      }));

      // Placeholder assistant response
      setTimeout(() => {
        const assistantMsg: Message = {
          id: uid(),
          role: "assistant",
          content: "⏳ Processing your request…",
        };
        setMessagesByChat((prev) => ({
          ...prev,
          [currentId!]: [...(prev[currentId!] || []), assistantMsg],
        }));
      }, 600);
    },
    [activeChatId]
  );

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

      {/* Sidebar */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
      />

      {/* Center column */}
      <div className="chat-center">
        <ChatArea messages={activeMessages} />
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
      />
    </div>
  );
}
