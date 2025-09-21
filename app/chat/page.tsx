"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API, refreshSession, apiPost, apiPostForm } from "@/lib/api";

type ChatMsg = { from: "you" | "ellie"; text: string; ts: number };

type LangCode =
  | "en" | "is" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

type LangOption = { code: LangCode; name: string };

type GetLanguageResponse = { language?: LangCode | null };
type SetLanguageResponse = { ok?: boolean; language?: LangCode; label?: string };
type ChatResponse = { reply?: string; language?: LangCode; voiceMode?: string };
type VoiceResponse = {
  text?: string; // we do NOT render this in the chat bubbles
  reply?: string;
  language?: LangCode;
  voiceMode?: string;
  audioMp3Base64?: string | null;
};

type PresetItem = { key: string; label: string; voice: string };
type PresetsResponse = { presets: PresetItem[] };
type CurrentPresetResponse = { preset: string | null };
type ApplyPresetResponse = { ok?: boolean; preset?: string; voice?: string };

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

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Tiny toast helper (no libs)
type ToastItem = { id: number; text: string };
function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const show = useCallback((text: string) => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return { toasts, show };
}

export default function ChatPage() {
  const router = useRouter();
  const { toasts, show } = useToasts();

  // messages & composer
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
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

  // settings drawer
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [currentPreset, setCurrentPreset] = useState<string | null>(null);
  const loadingPresets = useRef(false);

  // ───────────────────────────────────────────────
  // Language picker logic
  // ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!API) return;

      // Ensure session + CSRF token is loaded
      await refreshSession().catch(() => {});

      const stored = typeof window !== "undefined"
        ? (localStorage.getItem("ellie_language") as LangCode | null)
        : null;

      if (stored) {
        await fetch(`${API}/api/set-language`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: USER_ID, language: stored }),
          credentials: "include", // <-- keep cookie
        }).catch(() => {});
        setChosenLang(stored);
        setLangReady(true);
        return;
      }

      try {
        const r = await fetch(
          `${API}/api/get-language?userId=${encodeURIComponent(USER_ID)}`,
          { credentials: "include" } // <-- keep cookie
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
        credentials: "include", // <-- keep cookie
      });
      const data = (await r.json()) as SetLanguageResponse;
      const saved = data?.language ?? chosenLang;
      localStorage.setItem("ellie_language", saved);
      setLangReady(true);
      show("Language saved");
    } catch {
      show("Could not save language. Please try again.");
    }
  }, [chosenLang, show]);

  // smooth scroll to latest message
  const append = useCallback((from: "you" | "ellie", text: string) => {
    setMessages((prev) => [...prev, { from, text, ts: Date.now() }]);
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const sendText = useCallback(async () => {
    if (!API || !langReady) return;
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    append("you", msg);
    setTyping(true);
    setLoading(true);
    try {
      const data = await apiPost<ChatResponse>("/api/chat", { userId: USER_ID, message: msg });
      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);
    } catch (e) {
      const msgText =
        e instanceof Error && e.message === "401_NOT_LOGGED_IN"
          ? "You’re not logged in. Please sign in."
          : e instanceof Error && e.message === "402_PAYMENT_REQUIRED"
          ? "Subscription required. Please subscribe."
          : `Error: ${errorMessage(e)}`;
      append("ellie", msgText);
      if (msgText.includes("logged")) router.push("/login");
      if (msgText.includes("Subscription")) router.push("/pricing");
      else show("Failed to send. Check your API URL.");
    } finally {
      setTyping(false);
      setLoading(false);
    }
  }, [append, input, langReady, show, router]);

  const resetConversation = useCallback(async () => {
    if (!API) return;
    setMessages([]);
    setVoiceMode(null);
    await fetch(`${API}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
      credentials: "include", // <-- keep cookie
    }).catch(() => {});
    show("Conversation reset");
  }, [show]);

  // Voice chat utils (unchanged) …
  const isTypeSupported = (mime: string): boolean =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(mime);

  const sendVoiceBlob = useCallback(async (blob: Blob, mimeType?: string) => {
    if (!API || !langReady) return;
    setTyping(true);
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

      const data = await apiPostForm<VoiceResponse>("/api/voice-chat", fd);

      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);

      if (data?.audioMp3Base64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioMp3Base64}`);
        try { await audio.play(); } catch { /* autoplay block */ }
      }
    } catch (e) {
      const msgText =
        e instanceof Error && e.message === "401_NOT_LOGGED_IN"
          ? "You’re not logged in. Please sign in."
          : e instanceof Error && e.message === "402_PAYMENT_REQUIRED"
          ? "Subscription required. Please subscribe."
          : `Voice error: ${errorMessage(e)}`;
      append("ellie", msgText);
      if (msgText.includes("logged")) router.push("/login");
      if (msgText.includes("Subscription")) router.push("/pricing");
      else show("Voice send failed.");
    } finally {
      setTyping(false);
      setLoading(false);
    }
  }, [append, chosenLang, langReady, show, router]);

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
      show("Microphone permission required.");
    }
  }, [langReady, sendVoiceBlob, show]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  }, []);

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    if (loadingPresets.current || !API) return;
    loadingPresets.current = true;
    try {
      const [pr, cr] = await Promise.all([
        fetch(`${API}/api/get-voice-presets`, { credentials: "include" }).then((r) =>
          r.json() as Promise<PresetsResponse>
        ),
        fetch(`${API}/api/get-voice-preset?userId=${encodeURIComponent(USER_ID)}`, {
          credentials: "include",
        }).then((r) => r.json() as Promise<CurrentPresetResponse>),
      ]);
      setPresets(pr.presets || []);
      setCurrentPreset(cr.preset ?? null);
    } catch {
      show("Could not load voice presets.");
    } finally {
      loadingPresets.current = false;
    }
  }, [show]);

  const applyPreset = useCallback(async (key: string) => {
    try {
      const r = await fetch(`${API}/api/apply-voice-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, preset: key }),
        credentials: "include", // <-- keep cookie
      });
      const data = (await r.json()) as ApplyPresetResponse;
      if (data?.ok) {
        setCurrentPreset(key);
        show(`Voice preset set to “${key}”`);
      } else {
        show("Could not apply preset.");
      }
    } catch {
      show("Could not apply preset.");
    }
  }, [show]);

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
    <div className="min-h-screen text-white px-4 py-6 pb-24 safe-bottom">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-9 grid place-items-center rounded-xl bg-white/10">✨</div>
            <h1 className="text-2xl font-semibold">Ellie</h1>
            {/* Use voiceMode so ESLint doesn't flag it as unused (no UI impact) */}
            <span className="sr-only">voiceMode:{voiceMode ?? "unknown"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openSettings}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm"
            >
              Settings
            </button>
            <Link
              href="/"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm"
            >
              Home
            </Link>
          </div>
        </header>

        {/* Chat card */}
        <div className="glass rounded-2xl p-3">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="h-[56vh] md:h-[420px] overflow-y-auto px-2 space-y-3"
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
                    <div className="size-8 rounded-full bg-gradient-to-br from-pink-400/80 to-rose-500/80 grid place-items-center text-xs font-bold">
                      E
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm leading-6 ${
                      m.from === "you"
                        ? "bg-white text-black"
                        : "bg-white/8 border border-white/10"
                    }`}
                  >
                    <div>{m.text}</div>
                    <div
                      className={`mt-1 text-[10px] ${
                        m.from === "you" ? "text-black/60" : "text-white/60"
                      }`}
                    >
                      {fmtTime(m.ts)}
                    </div>
                  </div>
                  {m.from === "you" && (
                    <div className="size-8 rounded-full bg-white text-black grid place-items-center text-xs font-bold">
                      Y
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div className="flex justify-start">
                <div className="flex items-end gap-2 max-w-[85%]">
                  <div className="size-8 rounded-full bg-gradient-to-br from-pink-400/80 to-rose-500/80 grid place-items-center text-xs font-bold">
                    E
                  </div>
                  <div className="rounded-2xl px-3 py-2 text-sm leading-6 bg-white/8 border border-white/10">
                    <span className="inline-flex gap-1">
                      <span className="typing-dot">•</span>
                      <span className="typing-dot">•</span>
                      <span className="typing-dot">•</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Composer (sticky) */}
          <div className="mt-3 sticky bottom-3 left-0 right-0">
            <div className="flex items-center gap-2">
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
              {!recording ? (
                <button
                  onClick={() => void startRecording()}
                  disabled={loading}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/25 px-4 py-2"
                >
                  🎤
                </button>
              ) : (
                <button
                  onClick={() => stopRecording()}
                  className="rounded-xl border border-rose-500/50 bg-rose-600/80 px-4 py-2"
                >
                  ⏹
                </button>
              )}
              <button
                onClick={resetConversation}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2"
              >
                Reset
              </button>
              <button
                onClick={() => router.push("/call")}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold"
              >
                📞
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass rounded-lg px-3 py-2 text-sm shadow-lg border border-white/15"
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Settings Drawer */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setSettingsOpen(false)}
          aria-hidden
        >
          <div
            className="absolute right-0 top-0 h-full w-[92%] max-w-sm glass p-4 pt-6 border-l border-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Settings</h3>
              <button
                className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm"
                onClick={() => setSettingsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-5">
              {/* Language */}
              <section>
                <div className="text-sm font-medium mb-2">Language</div>
                <div className="flex gap-2">
                  <select
                    value={chosenLang}
                    onChange={(e) => setChosenLang(e.target.value as LangCode)}
                    className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
                  >
                    {LANGS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.name} ({o.code})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={confirmLanguage}
                    className="rounded-lg bg-white text-black font-semibold px-3"
                  >
                    Save
                  </button>
                </div>
              </section>

              {/* Voice preset */}
              <section>
                <div className="text-sm font-medium mb-2">Voice preset</div>
                <div className="space-y-2 max-h-48 overflow-auto pr-1">
                  {presets.length === 0 && (
                    <div className="text-white/60 text-sm">
                      {loadingPresets.current
                        ? "Loading presets…"
                        : "Open Settings again to load presets."}
                    </div>
                  )}
                  {presets.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => void applyPreset(p.key)}
                      className={`w-full text-left rounded-lg px-3 py-2 border ${
                        currentPreset === p.key
                          ? "bg-white text-black border-white"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-white/60">voice: {p.voice}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Memory */}
              <section>
                <div className="text-sm font-medium mb-2">Memory</div>
                <button
                  onClick={resetConversation}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
                >
                  Clear conversation (keeps saved facts)
                </button>
                <div className="text-xs text-white/50 mt-1">
                  Saved facts/emotions remain in your DB; this only resets chat history.
                </div>
              </section>

              {/* Call */}
              <section>
                <div className="text-sm font-medium mb-2">Call Mode</div>
                <Link
                  className="rounded-lg bg-white text-black font-semibold px-3 py-2 inline-block"
                  href="/call"
                >
                  Open Call
                </Link>
                <div className="text-xs text-white/50 mt-1">
                  Mic gain slider is available on the call screen.
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
