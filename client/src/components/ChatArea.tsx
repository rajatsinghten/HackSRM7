import { useEffect, useRef } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatAreaProps {
  messages: Message[];
}

export default function ChatArea({ messages }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <div className="chat-empty">
          <p className="chat-empty-title">How can I help?</p>
          <p className="chat-empty-sub">
            Paste code or describe your file — TokenTrim will compress it for
            you.
          </p>
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`chat-bubble-wrap ${msg.role === "user" ? "user" : "assistant"}`}
        >
          <div className="chat-bubble">{msg.content}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
