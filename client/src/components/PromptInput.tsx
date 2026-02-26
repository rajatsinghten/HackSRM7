import { useRef, useState } from "react";
import type { KeyboardEvent, ClipboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface PromptInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  /** Called with every new file the user picks (may be multiple). */
  onAddFiles: (files: File[]) => void;
  /** True when at least one file is attached — used for canSend logic. */
  hasFiles?: boolean;
  /** Called when the user pastes what looks like code (multiline / large block). */
  onPasteCode?: (text: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PromptInput({
  onSend,
  disabled = false,
  onAddFiles,
  hasFiles = false,
  onPasteCode,
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

  /** Intercept pastes that look like code blocks and route them to onPasteCode. */
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteCode) return;
    const text = e.clipboardData.getData("text");
    const lineCount = (text.match(/\n/g) ?? []).length;
    // Treat as code if it has 3+ lines OR is a large single-line snippet (>120 chars with code chars)
    const looksLikeCode =
      lineCount >= 2 ||
      (text.length > 120 && /[{}();=<>]/.test(text));
    if (looksLikeCode) {
      e.preventDefault();
      onPasteCode(text);
    }
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
          onPaste={handlePaste}
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
