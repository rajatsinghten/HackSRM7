import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface PromptInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  /** Called with every new file the user picks (may be multiple). */
  onAddFiles: (files: File[]) => void;
  /** True when at least one file is attached — used for canSend logic. */
  hasFiles?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PromptInput({
  onSend,
  disabled = false,
  onAddFiles,
  hasFiles = false,
}: PromptInputProps) {
  const [value, setValue] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = !!(value.trim() || hasFiles) && !disabled;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length > 0) onAddFiles(picked);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="prompt-bar">
      <div className="prompt-inner">
        <textarea
          ref={textareaRef}
          className="prompt-textarea"
          placeholder="Paste code or ask something… (Shift+Enter for new line)"
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <button
          className="prompt-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Attach files"
          type="button"
        >
          <Paperclip size={17} />
        </button>

        <button
          className="prompt-send-btn"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          type="button"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}
