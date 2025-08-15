"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "ellie"; text: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const STORAGE_KEY = "ellie_user_id";

function getOrMakeUserId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "default-user";
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "ellie", text: "Hey there! 😊 How’s it going, Andri?" },
  ]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;

    const userId = getOrMakeUserId();
    setText("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text: content }]);
    setSending(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: "ellie", text: data?.reply || "(no reply)" }]);
    } catch (e) {
      setError("Couldn’t reach Ellie. Is your API URL correct and running?");
      setMessages((m) => [...m, { role: "ellie", text: "Oops—API error." }]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function resetConvo() {
    const userId = getOrMakeUserId();
    try {
      await fetch(`${API_URL}/api/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch {}
    setMessages([{ role: "ellie", text: "Reset done. What should we talk about next? Andri" }]);
  }

  return (
    <div className="chat-root">
      <header className="chat-header">
        <div className="chat-title">Ellie</div>
        <div className="header-actions">
          <button className="btn ghost" onClick={resetConvo}>Reset</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div ref={listRef} className="chat-list">
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role === "user" ? "right" : "left"}`}>
            <div className={`bubble ${m.role}`}>{m.text}</div>
          </div>
        ))}
        {sending && <div className="typing">Ellie is typing…</div>}
      </div>

      <div className="chat-input">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Say something… (Enter to send, Shift+Enter for newline)"
        />
        <button className="btn primary" disabled={!text.trim() || sending} onClick={send}>
          Send
        </button>
      </div>

      <footer className="hint">
        Using API: <code>{API_URL}</code>
      </footer>
    </div>
  );
}
