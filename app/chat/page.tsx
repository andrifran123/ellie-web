"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ChatMsg = { from: "you" | "ellie"; text: string };

type LangCode =
  | "en" | "is" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

type LangOption = { code: LangCode; name: string };

type GetLanguageResponse = { language?: LangCode | null };
type SetLanguageResponse = { ok?: boolean; language?: LangCode; label?: string };
type ChatResponse = { reply?: string; language?: LangCode; voiceMode?: string };
type VoiceResponse = {
  text?: string; // we purposely do NOT render this in the chat bubbles
  reply?: string;
  language?: LangCode;
  voiceMode?: string;
  audioMp3Base64?: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "";
const USER_ID = "default-user";

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

export default function ChatPage() {
  const router = useRouter();

  // messages & composer
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // voice recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // language gate
  const [langReady, setLangReady] = useState(false);
  const [chosenLang, setChosenLang] = useState<LangCode>("en");

  // Ellie can hint voice mode
  const [voiceMode, setVoiceMode] = useState<string | null>(null);

  // ───────────────────────────────────────────────
  // Language picker logic
  // ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!API) return;

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

      try {
        const r = await fetch(
          `${API}/api/get-language?userId=${encodeURIComponent(USER_ID)}`
        );
        const data = (await r.json()) as GetLanguageResponse;
        if (data?.language) {
          localStorage.setItem("ellie_language", data.language);
          setChosenLang(data.language);
          setLangReady(true);
          return;
        }
      } catch { /* ignore */ }

      setLangReady(false);
    })();
  }, []);

  const confirmLanguage = useCallback(async () => {
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
  }, [chosenLang]);

  // ───────────────────────────────────────────────
  // Chat helpers
  // ───────────────────────────────────────────────
  function append(from: "you" | "ellie", text: string): void {
    setMessages((prev) => [...prev, { from, text }]);
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  const sendText = useCallback(async () => {
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
      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);
    } catch (e) {
      append("ellie", `Error: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, [API, input, langReady]);

  const resetConversation = useCallback(async () => {
    if (!API) return;
    setMessages([]);
    setVoiceMode(null);
    await fetch(`${API}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
    }).catch(() => {});
  }, [API]);

  // ───────────────────────────────────────────────
  // Voice chat (record → send) — DO NOT append transcript
  // ───────────────────────────────────────────────
  const isTypeSupported = (mime: string): boolean =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(mime);

  const startRecording = useCallback(async () => {
    if (!langReady) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = "audio/webm;codecs=opus";
      const fallback = "audio/webm";
      const picked = isTypeSupported(preferred)
        ? preferred
        : isTypeSupported(fallback)
          ? fallback
          : "";

      const mr = new MediaRecorder(stream, picked ? { mimeType: picked } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const uploadType = picked || mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: uploadType });
        void sendVoiceBlob(blob, uploadType);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("Microphone permission required.");
    }
  }, [langReady]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  }, []);

  async function sendVoiceBlob(blob: Blob, mimeType?: string): Promise<void> {
    if (!API || !langReady) return;
    setLoading(true);
    try {
      const mt = (mimeType || blob.type || "").toLowerCase();
      const ext = mt.includes("webm") ? "webm"
        : mt.includes("ogg") ? "ogg"
        : mt.includes("mpeg") ? "mp3"
        : mt.includes("mp4") ? "m4a"
        : mt.includes("wav") ? "wav"
        : "webm";

      const fd = new FormData();
      fd.append("audio", blob, `clip.${ext}`);
      fd.append("userId", USER_ID);
      fd.append(
        "language",
        (typeof window !== "undefined" && (localStorage.getItem("ellie_language") as LangCode | null)) ||
          chosenLang ||
          "en"
      );

      const r = await fetch(`${API}/api/voice-chat`, { method: "POST", body: fd });
      const data = (await r.json()) as VoiceResponse;

      // IMPORTANT: do NOT append user's transcribed text into the chat.
      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);

      if (data?.audioMp3Base64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioMp3Base64}`);
        try { await audio.play(); } catch { /* autoplay block */ }
      }
    } catch (e) {
      append("ellie", `Voice error: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // ───────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────
  if (!langReady) {
    return (
      <div className="min-h-screen grid place-items-center text-white">
        <div className="glass rounded-2xl p-6 w-[360px]">
          <h2 className="text-xl font-semibold">Choose your language</h2>
          <select
            value={chosenLang}
            onChange={(e) => setChosenLang(e.target.value as LangCode)}
            className="mt-3 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
          >
            {LANGS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
          <button
            onClick={confirmLanguage}
            className="mt-3 w-full rounded-lg bg-white text-black font-semibold px-4 py-2"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-9 grid place-items-center rounded-xl bg-white/10">✨</div>
            <h1 className="text-2xl font-semibold">Ellie</h1>
          </div>
          <div className="text-right text-sm">
            <div className="text-white/70">
              Lang: {typeof window !== "undefined" ? localStorage.getItem("ellie_language") : ""}
            </div>
            {voiceMode && <div className="text-white/70">Mode: {voiceMode}</div>}
            <button
              onClick={resetConversation}
              className="mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5"
            >
              Reset
            </button>
          </div>
        </header>

        {/* Chat card */}
        <div className="glass rounded-2xl p-3">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="h-[380px] overflow-y-auto px-2 space-y-3"
          >
            {messages.length === 0 && (
              <div className="text-white/50 text-sm px-1">Say hi to Ellie…</div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
              >
                <div className="flex items-end gap-2 max-w-[85%]">
                  {/* Avatar */}
                  {m.from === "ellie" && (
                    <div className="size-8 rounded-full bg-white/10 grid place-items-center text-sm">E</div>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-6 ${
                      m.from === "you"
                        ? "bg-white text-black"
                        : "bg-white/8 border border-white/10"
                    }`}
                  >
                    {m.text}
                  </div>
                  {m.from === "you" && (
                    <div className="size-8 rounded-full bg-white text-black grid place-items-center text-sm">Y</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void sendText();
              }}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none"
            />
            <button
              onClick={() => void sendText()}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-white text-black font-semibold px-4 py-2 disabled:opacity-60"
            >
              Send
            </button>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            {!recording ? (
              <button
                onClick={() => void startRecording()}
                disabled={loading}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/25 px-4 py-2"
              >
                🎤 Start voice
              </button>
            ) : (
              <button
                onClick={() => stopRecording()}
                className="rounded-xl border border-rose-500/50 bg-rose-600/80 px-4 py-2"
              >
                ⏹ Stop & send
              </button>
            )}
            {loading && <span className="text-white/70 text-sm">Processing…</span>}

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                ⌂ Home
              </Link>
              <button
                onClick={() => router.push("/call")}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold"
              >
                📞 Start call
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
