// app/page.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type ChatMsg = { from: "you" | "ellie"; text: string };

const API = process.env.NEXT_PUBLIC_API_URL || "";          // e.g. https://ellie-api-1.onrender.com
const USER_ID = "default-user";                              // swap to your real user id if you have auth

// Keep this list in sync with server's SUPPORTED_LANGUAGES
const LANGS = [
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

export default function Page() {
  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Voice state
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Language gate state
  const [langReady, setLangReady] = useState(false);
  const [chosenLang, setChosenLang] = useState<string>("en");

  // ─────────────────────────────────────────────────────────────
  // First-run language gate:
  // 1) If localStorage has language, sync to backend & continue.
  // 2) Else ask backend (/api/get-language). If found, store & continue.
  // 3) Else block UI and show picker modal.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        if (!API) return; // don't proceed if env missing
        const stored = typeof window !== "undefined" ? localStorage.getItem("ellie_language") : null;
        if (stored) {
          await fetch(`${API}/api/set-language`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: USER_ID, language: stored }),
          });
          setChosenLang(stored);
          setLangReady(true);
          return;
        }
        const r = await fetch(`${API}/api/get-language?userId=${encodeURIComponent(USER_ID)}`);
        const data = await r.json();
        if (data?.language) {
          localStorage.setItem("ellie_language", data.language);
          setChosenLang(data.language);
          setLangReady(true);
        } else {
          setLangReady(false); // show modal
        }
      } catch {
        // If network hiccups, still show picker so the user can proceed
        setLangReady(false);
      }
    })();
  }, []);

  async function confirmLanguage() {
    if (!API) return;
    try {
      await fetch(`${API}/api/set-language`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, language: chosenLang }),
      });
      localStorage.setItem("ellie_language", chosenLang);
      setLangReady(true);
    } catch {
      alert("Could not save language. Please try again.");
    }
  }

  const add = (m: ChatMsg) => setMessages((prev) => [...prev, m]);

  // ─────────────────────────────────────────────────────────────
  // Text chat
  // ─────────────────────────────────────────────────────────────
  const sendText = useCallback(async () => {
    if (!input.trim() || !API || !langReady) return;
    const you = input.trim();
    setInput("");
    add({ from: "you", text: you });
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, message: you }),
      });
      const data = await r.json();
      add({ from: "ellie", text: data?.reply || "(no reply)" });
    } catch (e: any) {
      add({ from: "ellie", text: `Error: ${e?.message || e}` });
    } finally {
      setLoading(false);
    }
  }, [API, input, langReady]);

  // Ctrl/Cmd+Enter to send text
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendText();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendText]);

  // ─────────────────────────────────────────────────────────────
  // Voice chat: record via MediaRecorder → POST /api/voice-chat
  // (No language prompt here; language set on first load)
  // ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!API || !langReady) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
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
  }, [API, langReady]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  }, []);

  async function sendVoiceBlob(blob: Blob) {
    if (!API || !langReady) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "clip.webm");
      fd.append("userId", USER_ID);

      const r = await fetch(`${API}/api/voice-chat`, { method: "POST", body: fd });
      const data = await r.json();

      const transcript = data?.text || "";
      const reply = data?.reply || "";
      if (transcript) add({ from: "you", text: transcript });
      if (reply) add({ from: "ellie", text: reply });

      if (data?.audioMp3Base64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioMp3Base64}`);
        try {
          await audio.play();
        } catch {
          // some browsers require a user gesture; ignore if blocked
        }
      }
    } catch (e: any) {
      add({ from: "ellie", text: `Voice error: ${e?.message || e}` });
    } finally {
      setLoading(false);
    }
  }

  // Optional: reset conversation button (hits your /api/reset)
  async function resetConversation() {
    if (!API) return;
    setMessages([]);
    await fetch(`${API}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
    }).catch(() => {});
  }

  // If language not chosen yet, show blocking modal
  if (!langReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0f", color: "#fff" }}>
        <div style={{ background: "#111", padding: 24, borderRadius: 12, width: 360, border: "1px solid #222" }}>
          <h2 style={{ marginTop: 0 }}>Choose your language</h2>
          <p style={{ opacity: 0.8, marginBottom: 12 }}>Ellie will use this for voice and text.</p>
          <select
            value={chosenLang}
            onChange={(e) => setChosenLang(e.target.value)}
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

  // Main UI after language is set
  return (
    <div style={{ maxWidth: 820, margin: "32px auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#fff", background: "#0b0b0f", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Ellie</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <small style={{ opacity: 0.7 }}>Language: {typeof window !== "undefined" ? localStorage.getItem("ellie_language") : ""}</small>
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
        />
        <button
          onClick={sendText}
          disabled={loading || !input.trim()}
          style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #444", background: "#fff", color: "#000" }}
        >
          Send
        </button>
      </section>

      <section style={{ display: "flex", gap: 8 }}>
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={loading}
            style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #0a7", background: "#0a7", color: "#fff" }}
          >
            🎤 Start voice
          </button>
        ) : (
          <button
            onClick={stopRecording}
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
