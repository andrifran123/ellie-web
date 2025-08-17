// app/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

type ChatMsg = { from: "you" | "ellie"; text: string };

type LangCode =
  | "en" | "is" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

type LangOption = { code: LangCode; name: string };

type GetLanguageResponse = { language?: LangCode | null };
type SetLanguageResponse = { ok?: boolean; language?: LangCode; label?: string };
type ChatResponse = { reply?: string; language?: LangCode };
type VoiceResponse = {
  text?: string;
  reply?: string;
  language?: LangCode;
  audioMp3Base64?: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "";   // e.g. https://ellie-api-1.onrender.com
const USER_ID = "default-user";                       // swap with your real user id if you have one

// Keep in sync with server SUPPORTED_LANGUAGES
const LANGS: LangOption[] = [
  { code: "en", name: "English" },
  { code: "is", name: "Icelandic" },
  { code: "pt", name: "Portuguese" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export default function Page() {
  // Chat UI
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Language gate
  const [langReady, setLangReady] = useState(false);
  const [chosenLang, setChosenLang] = useState<LangCode>("en");

  // ────────────────────────────────────────────────────────────
  // First-run language picker logic
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!API) return;

      // 1) Local storage wins (and syncs to backend)
      const stored = typeof window !== "undefined"
        ? (localStorage.getItem("ellie_language") as LangCode | null)
        : null;

      if (stored) {
        await fetch(`${API}/api/set-language`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: USER_ID, language: stored }),
        }).catch(() => {});
        setChosenLang(stored);
        setLangReady(true);
        return;
      }

      // 2) Otherwise ask backend
      try {
        const r = await fetch(`${API}/api/get-language?userId=${encodeURIComponent(USER_ID)}`);
        const data = (await r.json()) as GetLanguageResponse;
        if (data?.language) {
          localStorage.setItem("ellie_language", data.language);
          setChosenLang(data.language);
          setLangReady(true);
          return;
        }
      } catch {
        /* fall through to picker */
      }

      // 3) Not set → show picker
      setLangReady(false);
    })();
  }, []);

  async function confirmLanguage(): Promise<void> {
    if (!API) return;
    try {
      const r = await fetch(`${API}/api/set-language`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, language: chosenLang }),
      });
      const data = (await r.json()) as SetLanguageResponse;
      const saved = data?.language ?? chosenLang;
      localStorage.setItem("ellie_language", saved);
      setLangReady(true);
    } catch {
      alert("Could not save language. Please try again.");
    }
  }

  // ────────────────────────────────────────────────────────────
  // Chat helpers
  // ────────────────────────────────────────────────────────────
  function append(from: "you" | "ellie", text: string): void {
    setMessages((prev) => [...prev, { from, text }]);
  }

  async function sendText(): Promise<void> {
    if (!API || !langReady) return;
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    append("you", msg);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, message: msg }),
      });
      const data = (await r.json()) as ChatResponse;
      append("ellie", data?.reply ?? "(no reply)");
    } catch (e) {
      append("ellie", `Error: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function resetConversation(): Promise<void> {
    if (!API) return;
    setMessages([]);
    await fetch(`${API}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
    }).catch(() => {});
  }

  // ────────────────────────────────────────────────────────────
  // Voice recording → /api/voice-chat
  // (language already chosen on first load)
  // ────────────────────────────────────────────────────────────
  async function sendVoiceBlob(blob: Blob): Promise<void> {
    if (!API || !langReady) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "clip.webm");
      fd.append("userId", USER_ID);

      const r = await fetch(`${API}/api/voice-chat`, { method: "POST", body: fd });
      const data = (await r.json()) as VoiceResponse;

      if (data?.text) append("you", data.text);
      if (data?.reply) append("ellie", data.reply);

      if (data?.audioMp3Base64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioMp3Base64}`);
        try { await audio.play(); } catch { /* autoplay may be blocked */ }
      }
    } catch (e) {
      append("ellie", `Voice error: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording(): Promise<void> {
    if (!langReady) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev: { data: Blob }) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        sendVoiceBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("I need microphone permission to record.");
    }
  }

  function stopRecording(): void {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  }

  // ────────────────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────────────────

  // Block UI with language picker until chosen
  if (!langReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0f", color: "#fff" }}>
        <div style={{ background: "#111", padding: 24, borderRadius: 12, width: 360, border: "1px solid #222" }}>
          <h2 style={{ marginTop: 0 }}>Choose your language</h2>
          <p style={{ opacity: 0.8, marginBottom: 12 }}>Ellie will use this for voice and text.</p>
          <select
            value={chosenLang}
            onChange={(e) => setChosenLang(e.target.value as LangCode)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #333", background: "#1a1a1f", color: "#fff" }}
          >
            {LANGS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
          <button
            onClick={confirmLanguage}
            style={{ width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8, border: "1px solid #444", background: "#fff", color: "#000" }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Main chat UI
  return (
    <div style={{ maxWidth: 820, margin: "32px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#fff", background: "#0b0b0f", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Ellie</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <small style={{ opacity: 0.7 }}>
            Language: {typeof window !== "undefined" ? localStorage.getItem("ellie_language") : ""}
          </small>
          <button onClick={resetConversation} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #444", background: "#16161c", color: "#fff" }}>
            Reset
          </button>
        </div>
      </header>

      <section
        style={{
          border: "1px solid #222",
          borderRadius: 12,
          padding: 12,
          minHeight: 260,
          marginBottom: 16,
          background: "#101015",
          overflowY: "auto",
        }}
      >
        {messages.length === 0 && <div style={{ opacity: 0.6 }}>Say hi to Ellie…</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "8px 0" }}>
            <b>{m.from === "you" ? "You" : "Ellie"}</b>: {m.text}
          </div>
        ))}
      </section>

      <section style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #333", background: "#101015", color: "#fff" }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void sendText();
          }}
        />
        <button
          onClick={() => void sendText()}
          disabled={loading || !input.trim()}
          style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #444", background: "#fff", color: "#000" }}
        >
          Send
        </button>
      </section>

      <section style={{ display: "flex", gap: 8 }}>
        {!recording ? (
          <button
            onClick={() => void startRecording()}
            disabled={loading}
            style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #0a7", background: "#0a7", color: "#fff" }}
          >
            🎤 Start voice
          </button>
        ) : (
          <button
            onClick={() => stopRecording()}
            style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #a00", background: "#a00", color: "#fff" }}
          >
            ⏹ Stop & send
          </button>
        )}
        {loading && <span style={{ alignSelf: "center", opacity: 0.8 }}>Processing…</span>}
      </section>
    </div>
  );
}
