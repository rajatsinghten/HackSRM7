import { useState } from "react";
import { Plus, MessageSquare, Scissors, Trash2, AlertTriangle, Check, X } from "lucide-react";

export interface ChatEntry {
  id: string;
  title: string;
}

interface SidebarProps {
  chats: ChatEntry[];
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: SidebarProps) {
  // ID of the chat currently awaiting delete confirmation (null = none)
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // don't select the chat
    setConfirmingId(id);
  };

  const handleConfirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmingId(null);
    onDeleteChat(id);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingId(null);
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <Scissors size={18} className="nav-icon" />
        <span className="nav-title">TokenTrim</span>
      </div>

      {/* New Chat */}
      <button className="new-chat-btn" onClick={onNewChat}>
        <Plus size={16} />
        New Chat
      </button>

      {/* History */}
      <div className="sidebar-history-label">Recent</div>
      <ul className="sidebar-chat-list">
        {chats.length === 0 && (
          <li className="sidebar-empty">
            <MessageSquare size={28} strokeWidth={1.25} className="sidebar-empty-icon" />
            <span>No chats yet</span>
          </li>
        )}
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;
          const isConfirming = confirmingId === chat.id;

          return (
            <li
              key={chat.id}
              className={`sidebar-chat-item${
                isActive ? " active" : ""
              }${isConfirming ? " confirming" : ""}`}
              onClick={() => !isConfirming && onSelectChat(chat.id)}
              title={chat.title}
            >
              {isConfirming ? (
                /* ── Inline delete confirmation ── */
                <div className="sidebar-confirm">
                  <AlertTriangle size={13} className="sidebar-confirm-icon" />
                  <span className="sidebar-confirm-text">Delete?</span>
                  <div className="sidebar-confirm-actions">
                    <button
                      className="sidebar-confirm-yes"
                      onClick={(e) => handleConfirmDelete(e, chat.id)}
                      aria-label="Confirm delete"
                      type="button"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      className="sidebar-confirm-no"
                      onClick={handleCancelDelete}
                      aria-label="Cancel delete"
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal item ── */
                <>
                  <MessageSquare size={14} className="sidebar-chat-icon" />
                  <span className="sidebar-chat-title">{chat.title}</span>
                  <button
                    className="sidebar-delete-btn"
                    onClick={(e) => handleDeleteClick(e, chat.id)}
                    aria-label={`Delete "${chat.title}"`}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
