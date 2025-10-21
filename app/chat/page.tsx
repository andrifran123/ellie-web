"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSession, apiPost, apiPostForm } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   Types & constants (unchanged logic)
───────────────────────────────────────────────────────────── */
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

/* Tiny toast helper (unchanged) */
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

/* ─────────────────────────────────────────────────────────────
   Visual helpers (new)
───────────────────────────────────────────────────────────── */
const AuroraBG = () => (
  <>
    {/* animated aurora layers */}
    <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-[#0B0B11] via-[#161625] to-[#1A1A2B]" />
    <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 animate-aurora">
      <div className="absolute -left-1/4 top-[-10%] h-[60vh] w-[80vw] rounded-[999px] blur-[90px]"
        style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.35), transparent 70%)" }} />
      <div className="absolute right-[-20%] bottom-[-10%] h-[60vh] w-[80vw] rounded-[999px] blur-[100px]"
        style={{ background: "radial-gradient(closest-side, rgba(94,234,212,0.30), transparent 70%)" }} />
    </div>

    {/* a faint grid for texture */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
      style={{
        background:
          "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
        mixBlendMode: "screen",
      }}
    />
  </>
);

/* ─────────────────────────────────────────────────────────────
   Main component (merged features + new look)
───────────────────────────────────────────────────────────── */
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

  /* Language picker logic (unchanged) */
  useEffect(() => {
    (async () => {
      await refreshSession().catch(() => {});
      const stored = typeof window !== "undefined"
        ? (localStorage.getItem("ellie_language") as LangCode | null)
        : null;

      if (stored) {
        await apiPost<SetLanguageResponse>("/api/set-language", { userId: USER_ID, language: stored }).catch(() => {});
        setChosenLang(stored);
        setLangReady(true);
        return;
      }

      try {
        const r = await fetch(`/api/get-language?userId=${encodeURIComponent(USER_ID)}`, { credentials: "include" });
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
    try {
      const data = await apiPost<SetLanguageResponse>("/api/set-language", { userId: USER_ID, language: chosenLang });
      const saved = data?.language ?? chosenLang;
      localStorage.setItem("ellie_language", saved);
      setLangReady(true);
      show("Language saved");
    } catch {
      show("Could not save language. Please try again.");
    }
  }, [chosenLang, show]);

  // smooth scroll to latest
  const append = useCallback((from: "you" | "ellie", text: string) => {
    setMessages((prev) => [...prev, { from, text, ts: Date.now() }]);
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const sendText = useCallback(async () => {
    if (!langReady) return;
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
    setMessages([]);
    setVoiceMode(null);
    await apiPost("/api/reset", { userId: USER_ID }).catch(() => {});
    show("Conversation reset");
  }, [show]);

  /* Voice chat utils (unchanged) */
  const isTypeSupported = (mime: string): boolean =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(mime);

  const sendVoiceBlob = useCallback(async (blob: Blob, mimeType?: string) => {
    if (!langReady) return;
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
    if (loadingPresets.current) return;
    loadingPresets.current = true;
    try {
      const [pr, cr] = await Promise.all([
        fetch(`/api/get-voice-presets`, { credentials: "include" }).then((r) =>
          r.json() as Promise<PresetsResponse>
        ),
        fetch(`/api/get-voice-preset?userId=${encodeURIComponent(USER_ID)}`, {
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
      const r = await fetch(`/api/apply-voice-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, preset: key }),
        credentials: "include",
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

  /* ─────────────────────────────────────────────
     Language gating screen (restyled)
  ───────────────────────────────────────────── */
  if (!langReady) {
    return (
      <div className="relative min-h-screen w-full text-white">
        <AuroraBG />
        <div className="min-h-screen grid place-items-center px-6">
          <div className="w-[360px] max-w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_10px_80px_rgba(140,110,255,0.22)] p-6">
            <h2 className="text-xl font-semibold">Choose your language</h2>
            <select
              value={chosenLang}
              onChange={(e) => setChosenLang(e.target.value as LangCode)}
              className="mt-3 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-[#A78BFA]/40 transition"
            >
              {LANGS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
            <button
              onClick={confirmLanguage}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#A78BFA] to-[#5EEAD4] text-black font-semibold px-4 py-2 shadow-lg hover:opacity-90 transition"
            >
              Continue
            </button>
          </div>
        </div>

        {/* Keyframes (global) */}
        <StyleKeyframes />
      </div>
    );
  }

  /* ─────────────────────────────────────────────
     Chat page
  ───────────────────────────────────────────── */
  return (
    <div className="relative min-h-screen w-full text-white">
      <AuroraBG />

      {/* Header (floating) */}
      <header className="relative z-10 max-w-5xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 grid place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">✨</div>
          <h1 className="text-2xl font-semibold">Ellie</h1>
          <span className="sr-only">voiceMode:{voiceMode ?? "unknown"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSettings}
            className="rounded-xl border border-white/15 bg-white/5 backdrop-blur px-3 py-1.5 text-sm hover:bg-white/10 transition"
          >
            Settings
          </button>
          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-white/5 backdrop-blur px-3 py-1.5 text-sm hover:bg-white/10 transition"
          >
            Home
          </Link>
        </div>
      </header>

      {/* Chat container */}
      <main className="relative z-10 max-w-3xl mx-auto px-6 pb-28">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_10px_120px_rgba(140,110,255,0.18)] overflow-hidden animate-drop-in">
          {/* Chat inner header strip */}
          <div className="px-6 py-4 border-b border-white/10 text-sm text-white/70 flex items-center justify-between">
            <span>Futuristic Cozy Lounge</span>
            <span className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/60">Ready</span>
            </span>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-[64vh] md:h-[58vh] overflow-y-auto px-4 py-5 space-y-4">
            {messages.length === 0 && (
              <div className="text-white/60 text-sm px-2">Say hi to Ellie…</div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m, i) => {
                const isYou = m.from === "you";
                return (
                  <motion.div
                    key={m.ts + ":" + i}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={`flex ${isYou ? "justify-end" : "justify-start"}`}
                  >
                    <div className="flex items-end gap-2 max-w-[85%]">
                      {!isYou && (
                        <div className="size-8 rounded-full bg-gradient-to-br from-[#A78BFA]/80 to-[#5EEAD4]/70 grid place-items-center text-[11px] font-bold shadow-[0_0_32px_rgba(140,110,255,0.25)]">
                          E
                        </div>
                      )}

                      <div
                        className={[
                          "rounded-2xl px-3 py-2 text-sm leading-6",
                          isYou
                            ? "bg-white/10 border border-white/10"
                            : "bg-gradient-to-br from-[#A78BFA]/20 to-[#5EEAD4]/15 border border-[#A78BFA]/25 shadow-[0_10px_40px_rgba(140,110,255,0.15)]",
                        ].join(" ")}
                      >
                        <div>{m.text}</div>
                        <div className={`mt-1 text-[10px] ${isYou ? "text-white/60" : "text-white/70"}`}>
                          {fmtTime(m.ts)}
                        </div>
                      </div>

                      {isYou && (
                        <div className="size-8 rounded-full bg-white text-black grid place-items-center text-[11px] font-bold">
                          Y
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Typing indicator */}
            {typing && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex items-end gap-2 max-w-[85%]">
                  <div className="size-8 rounded-full bg-gradient-to-br from-[#A78BFA]/80 to-[#5EEAD4]/70 grid place-items-center text-[11px] font-bold">
                    E
                  </div>
                  <div className="rounded-2xl px-3 py-2 text-sm leading-6 bg-gradient-to-br from-[#A78BFA]/20 to-[#5EEAD4]/15 border border-[#A78BFA]/25">
                    <span className="inline-flex gap-1">
                      <span className="typing-dot">•</span>
                      <span className="typing-dot">•</span>
                      <span className="typing-dot">•</span>
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 px-2 py-2 focus-within:ring-2 focus-within:ring-[#A78BFA]/40 transition">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void sendText();
                }}
                className="flex-1 bg-transparent px-3 py-2 outline-none text-sm placeholder:text-white/40"
              />
              <div className="flex items-center gap-2 pr-1">
                {!recording ? (
                  <button
                    onClick={() => void startRecording()}
                    disabled={loading}
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 hover:bg-emerald-500/25 transition"
                    title="Record voice"
                  >
                    🎤
                  </button>
                ) : (
                  <button
                    onClick={() => stopRecording()}
                    className="rounded-xl border border-rose-500/50 bg-rose-600/80 px-3 py-2 hover:bg-rose-600/90 transition"
                    title="Stop"
                  >
                    ⏹
                  </button>
                )}
                <button
                  onClick={() => void sendText()}
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-gradient-to-r from-[#A78BFA] to-[#5EEAD4] text-black font-semibold px-4 py-2 shadow-lg hover:opacity-90 transition disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>

            {/* utility row */}
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={resetConversation}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 transition"
              >
                Reset
              </button>
              <button
                onClick={() => router.push("/call")}
                className="rounded-lg bg-white text-black px-3 py-2 text-xs font-semibold hover:opacity-90 transition"
              >
                📞 Call
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-lg px-3 py-2 text-sm shadow-lg border border-white/15 bg-white/10 backdrop-blur"
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Settings Drawer (restyled glass + glow) */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
            <motion.div
              className="absolute right-0 top-0 h-full w-[92%] max-w-sm border-l border-white/15 bg-white/10 backdrop-blur-2xl p-5 shadow-[0_10px_80px_rgba(140,110,255,0.25)]"
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Settings</h3>
                <button
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm hover:bg-white/10 transition"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-6">
                {/* Language */}
                <section>
                  <div className="text-sm font-medium mb-2">Language</div>
                  <div className="flex gap-2">
                    <select
                      value={chosenLang}
                      onChange={(e) => setChosenLang(e.target.value as LangCode)}
                      className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-[#A78BFA]/40 transition"
                    >
                      {LANGS.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.name} ({o.code})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={confirmLanguage}
                      className="rounded-lg bg-gradient-to-r from-white to-white text-black font-semibold px-3"
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
                        className={`w-full text-left rounded-lg px-3 py-2 border transition ${
                          currentPreset === p.key
                            ? "bg-white text-black border-white shadow"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
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
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
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
                    className="rounded-lg bg-white text-black font-semibold px-3 py-2 inline-block hover:opacity-90 transition"
                    href="/call"
                  >
                    Open Call
                  </Link>
                  <div className="text-xs text-white/50 mt-1">
                    Mic gain slider is available on the call screen.
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyframes (global) */}
      <StyleKeyframes />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Global keyframes (styled-jsx)
───────────────────────────────────────────────────────────── */
function StyleKeyframes() {
  return (
    <style jsx global>{`
      @keyframes aurora {
        0% { transform: translate3d(0,0,0) scale(1); }
        50% { transform: translate3d(2%, -2%, 0) scale(1.03); }
        100% { transform: translate3d(0,0,0) scale(1); }
      }
      .animate-aurora { animation: aurora 16s ease-in-out infinite; }

      @keyframes dropIn {
        0% { opacity: 0; transform: translateY(8px) scale(0.995); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .animate-drop-in { animation: dropIn 420ms ease-out both; }

      .typing-dot {
        display: inline-block;
        width: 0.35rem;
        height: 0.35rem;
        line-height: 0.35rem;
        border-radius: 999px;
        margin-right: 0.15rem;
        color: rgba(255,255,255,0.85);
        animation: typing 1.2s infinite ease-in-out;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.15s; }
      .typing-dot:nth-child(3) { animation-delay: 0.3s; }
      @keyframes typing {
        0%, 80%, 100% { transform: translateY(0); opacity: .6; }
        40% { transform: translateY(-2px); opacity: 1; }
      }
    `}</style>
  );
}
