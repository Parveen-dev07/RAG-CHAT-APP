"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  sources?: Record<string, any>[];
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <div className="page">
      <div className="header">
        <h1>RAG Chat</h1>
        <p>Ask a question. Answers are grounded in your ingested documents (Gemini + ChromaDB).</p>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            No messages yet. Try: "What is RAG?" (after running{" "}
            <code>npm run ingest</code>).
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`bubble ${m.role}${m.isError ? " error" : ""}`}
          >
            {m.content}
            {m.sources && m.sources.length > 0 && (
              <div className="sources">
                Sources: {m.sources.map((s) => s.source).join(", ")}
              </div>
            )}
          </div>
        ))}

        {loading && <div className="bubble assistant">Thinking…</div>}
      </div>

      <div className="input-bar">
        <div className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your documents..."
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
