"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSession, apiPost, apiPostForm } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   Types & constants (UPDATED WITH RELATIONSHIP)
───────────────────────────────────────────────────────────── */
type ChatMsg = { from: "you" | "ellie"; text: string; ts: number };

// NEW: Relationship types
interface RelationshipStatus {
  level: number;
  stage: string;
  streak: number;
  mood: string;
  emotionalInvestment?: number;
  totalInteractions?: number;
  longestStreak?: number;
  lastInteraction?: string;
}

type LangCode =
  | "en" | "is" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

type LangOption = { code: LangCode; name: string };

type GetLanguageResponse = { language?: LangCode | null };
type SetLanguageResponse = { ok?: boolean; language?: LangCode; label?: string };

// UPDATED: Chat response now includes relationship status
type ChatResponse = { 
  reply?: string; 
  language?: LangCode; 
  voiceMode?: string;
  relationshipStatus?: RelationshipStatus; // NEW
};

type VoiceResponse = {
  text?: string;
  reply?: string;
  language?: LangCode;
  voiceMode?: string;
  audioMp3Base64?: string | null;
  relationshipStatus?: RelationshipStatus; // NEW
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

// NEW: Relationship stage configurations
const STAGE_STYLES = {
  "Curious Stranger": { color: "#94a3b8", emoji: "👀", bg: "from-slate-500/20", hint: "She doesn't know you yet. Be interesting!" },
  "Friend with Tension": { color: "#fbbf24", emoji: "😊", bg: "from-amber-500/20", hint: "Chemistry is building. Keep the momentum!" },
  "It's Complicated": { color: "#f87171", emoji: "😰", bg: "from-red-500/20", hint: "She has feelings but she's scared. Be patient." },
  "Almost Together": { color: "#c084fc", emoji: "💕", bg: "from-purple-500/20", hint: "So close! Show her you're serious." },
  "Exclusive": { color: "#f472b6", emoji: "❤️", bg: "from-pink-500/20", hint: "You did it! Keep the spark alive." }
};

// NEW: Mood indicators
const MOOD_INDICATORS = {
  flirty: "😘 Flirty",
  playful: "😊 Playful", 
  distant: "😔 Distant",
  vulnerable: "🥺 Vulnerable",
  normal: "😌 Normal",
  mysterious: "🤔 Mysterious"
};

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
   Visual helpers (unchanged)
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
   Main component (WITH RELATIONSHIP PROGRESSION)
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

  // NEW: Relationship tracking
  const [relationship, setRelationship] = useState<RelationshipStatus | null>(null);
  const [showRelDetails, setShowRelDetails] = useState(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);

  // NEW: Fetch relationship status
  const fetchRelationshipStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/relationship-status", {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setRelationship(data);
      }
    } catch (err) {
      console.error("Failed to fetch relationship status:", err);
    }
  }, []);

  // NEW: Track last seen
  useEffect(() => {
    const lastSeenStr = localStorage.getItem("ellie_last_seen");
    if (lastSeenStr) {
      setLastSeen(new Date(lastSeenStr));
    }
    localStorage.setItem("ellie_last_seen", new Date().toISOString());
  }, []);

  // NEW: Fetch relationship on mount and periodically
  useEffect(() => {
    fetchRelationshipStatus();
    const interval = setInterval(fetchRelationshipStatus, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchRelationshipStatus]);

  /* Language picker logic with better session handling */
  useEffect(() => {
    (async () => {
      // Always refresh session first to prevent auth issues
      try {
        await refreshSession();
      } catch (err) {
        console.error("Session refresh failed:", err);
      }

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
      // Refresh session before sending
      await refreshSession().catch(() => {});
      
      const data = await apiPost<ChatResponse>("/api/chat", { userId: USER_ID, message: msg });
      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);
      
      // NEW: Update relationship if included in response
      if (data?.relationshipStatus) {
        setRelationship(data.relationshipStatus);
      }
    } catch (e) {
      const msgText =
        e instanceof Error && e.message === "401_NOT_LOGGED_IN"
          ? "Session expired. Refreshing..."
          : `Error: ${errorMessage(e)}`;
      show(msgText);
      
      // If auth error, try to refresh session instead of redirecting
      if (e instanceof Error && e.message === "401_NOT_LOGGED_IN") {
        try {
          await refreshSession();
          show("Session refreshed. Please try sending again.");
        } catch {
          show("Please refresh the page and log in again.");
          setTimeout(() => router.push("/login"), 2000);
        }
      }
    } finally {
      setTyping(false);
      setLoading(false);
    }
  }, [langReady, input, append, show, router]);

  // NEW: Handle Enter key to send message
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  }, [sendText]);

  /* Voice recording logic */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setLoading(true);
        setTyping(true);

        try {
          // Refresh session before voice request
          await refreshSession().catch(() => {});
          
          const data = await apiPostForm<VoiceResponse>("/api/voice", {
            audio: new File([blob], "voice.webm", { type: "audio/webm" }),
            userId: USER_ID,
          });
          
          if (data?.text) append("you", data.text);
          if (data?.reply) append("ellie", data.reply);
          if (data?.voiceMode) setVoiceMode(data.voiceMode);
          
          // NEW: Update relationship if included in response
          if (data?.relationshipStatus) {
            setRelationship(data.relationshipStatus);
          }

          if (data?.audioMp3Base64) {
            try {
              const audioBlob = await (await fetch(`data:audio/mp3;base64,${data.audioMp3Base64}`)).blob();
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              audio.play().catch((err) => console.error("Audio playback error:", err));
            } catch (err) {
              console.error("Audio decode error:", err);
            }
          }
        } catch (e) {
          show(`Error: ${errorMessage(e)}`);
          
          // Handle auth errors for voice too
          if (e instanceof Error && e.message === "401_NOT_LOGGED_IN") {
            try {
              await refreshSession();
              show("Session refreshed. Please try recording again.");
            } catch {
              show("Please refresh the page and log in again.");
              setTimeout(() => router.push("/login"), 2000);
            }
          }
        } finally {
          setLoading(false);
          setTyping(false);
        }
      };

      mr.start();
      setRecording(true);
    } catch (err) {
      show(`Could not start recording: ${errorMessage(err)}`);
    }
  }, [append, show, router]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  /* Reset conversation */
  const resetConversation = useCallback(async () => {
    try {
      await apiPost("/api/reset", { userId: USER_ID });
      setMessages([]);
      show("Conversation cleared");
    } catch (e) {
      show(`Error resetting: ${errorMessage(e)}`);
    }
  }, [show]);

  /* Preset logic */
  const loadPresets = useCallback(async () => {
    if (loadingPresets.current) return;
    loadingPresets.current = true;
    try {
      const data = await apiPost<PresetsResponse>("/api/get-presets", { userId: USER_ID });
      setPresets(data?.presets ?? []);
      const cur = await apiPost<CurrentPresetResponse>("/api/get-current-preset", { userId: USER_ID });
      setCurrentPreset(cur?.preset ?? null);
    } catch (e) {
      show(`Could not load presets: ${errorMessage(e)}`);
    } finally {
      loadingPresets.current = false;
    }
  }, [show]);

  const applyPreset = useCallback(async (key: string) => {
    try {
      const data = await apiPost<ApplyPresetResponse>("/api/apply-preset", { userId: USER_ID, preset: key });
      if (data?.ok) {
        setCurrentPreset(data.preset ?? key);
        show(`Preset applied: ${data.preset}`);
      }
    } catch (e) {
      show(`Could not apply preset: ${errorMessage(e)}`);
    }
  }, [show]);

  useEffect(() => {
    if (settingsOpen) loadPresets();
  }, [settingsOpen, loadPresets]);

  // Get current stage style for relationship card
  const currentStageStyle = relationship 
    ? STAGE_STYLES[relationship.stage as keyof typeof STAGE_STYLES] || STAGE_STYLES["Curious Stranger"]
    : null;

  /* ─────────────────────────────────────────────────────────────
     UI render
  ───────────────────────────────────────────────────────────── */
  if (!langReady) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center text-white">
        <AuroraBG />
        <div className="relative z-10 w-full max-w-sm mx-auto p-6">
          <h2 className="text-3xl font-bold mb-6 text-center">Choose your language</h2>
          <div className="space-y-4">
            <select
              value={chosenLang}
              onChange={(e) => setChosenLang(e.target.value as LangCode)}
              className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#A78BFA]/40"
            >
              {LANGS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
            <button
              onClick={confirmLanguage}
              className="w-full rounded-lg bg-gradient-to-r from-[#A78BFA] to-[#5EEAD4] text-black font-semibold px-4 py-3 hover:opacity-90 transition"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <AuroraBG />

      {/* NEW: Relationship status card */}
      {relationship && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute top-4 left-4 right-4 z-30 flex justify-center"
        >
          <div className="w-full max-w-2xl">
            <div 
              className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl cursor-pointer hover:bg-black/50 transition-colors"
              onClick={() => setShowRelDetails(!showRelDetails)}
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{currentStageStyle?.emoji}</span>
                  <div>
                    <h3 
                      className="font-semibold text-lg"
                      style={{ color: currentStageStyle?.color }}
                    >
                      {relationship.stage}
                    </h3>
                    <p className="text-xs text-white/50">
                      {MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS] || relationship.mood}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color: currentStageStyle?.color }}>
                    {relationship.level}
                  </div>
                  <div className="text-xs text-white/50">
                    🔥 {relationship.streak} day{relationship.streak !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 bg-white/10 rounded-full overflow-hidden mt-3">
                <motion.div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${currentStageStyle?.bg} to-transparent`}
                  initial={{ width: 0 }}
                  animate={{ width: `${relationship.level}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>

              {/* Expanded details */}
              <AnimatePresence>
                {showRelDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="text-white/60">Total Interactions:</span>
                          <span className="ml-2 text-white/90">{relationship.totalInteractions || 0}</span>
                        </div>
                        <div>
                          <span className="text-white/60">Emotional Bond:</span>
                          <span className="ml-2 text-white/90">
                            {Math.round((relationship.emotionalInvestment || 0) * 100)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-white/60">Longest Streak:</span>
                          <span className="ml-2 text-white/90">{relationship.longestStreak || 0} days</span>
                        </div>
                        <div>
                          <span className="text-white/60">Last Interaction:</span>
                          <span className="ml-2 text-white/90">
                            {relationship.lastInteraction 
                              ? new Date(relationship.lastInteraction).toLocaleDateString()
                              : 'Today'
                            }
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-white/50 italic">
                        {currentStageStyle?.hint}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-4" style={{ height: "85vh" }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-2">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#A78BFA] via-white to-[#5EEAD4] bg-clip-text text-transparent">
              Ellie
            </h1>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
            >
              ⚙️ Settings
            </button>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto space-y-3 px-2" ref={scrollRef}>
            {messages.map((m, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    m.from === "you"
                      ? "bg-gradient-to-r from-[#A78BFA] to-[#5EEAD4] text-black"
                      : "bg-white/10 backdrop-blur-md border border-white/15"
                  }`}
                >
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text}</div>
                  <div className={`text-[10px] mt-1 ${m.from === "you" ? "text-black/60" : "text-white/50"}`}>
                    {fmtTime(m.ts)}
                  </div>
                </div>
              </motion.div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="typing-dot bg-white"></span>
                    <span className="typing-dot bg-white"></span>
                    <span className="typing-dot bg-white"></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Voice mode hint */}
          {voiceMode && (
            <div className="px-2">
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white/70 text-center">
                💡 {voiceMode === "suggest_voice" && "Ellie suggests trying voice chat"}
                {voiceMode === "request_voice" && (
                  <>
                    Ellie is asking you to use voice. 
                    <button
                      onClick={startRecording}
                      disabled={recording || loading}
                      className="ml-2 underline hover:text-white transition"
                    >
                      Start recording
                    </button>
                    {" or "}
                    <button
                      onClick={() => setVoiceMode(null)}
                      className="underline hover:text-white transition"
                      title="Dismiss this hint"
                    >
                      Ignore
                    </button>
                  </>
                )}
                {voiceMode === "insist_voice" && (
                  <>
                    🎤 Ellie really wants to hear your voice! 
                    <button
                      onClick={startRecording}
                      disabled={recording || loading}
                      className="ml-2 underline hover:text-white transition"
                    >
                      Record now
                    </button>
                    {" or "}
                    <button
                      onClick={() => append("you", "Can I just type instead?")}
                      className="underline hover:text-white transition"
                      title="Ask her"
                    >
                      Ask her
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Composer */}
          <div className="px-2">
            <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-3">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Ellie... (Press Enter to send)"
                  rows={2}
                  className="flex-1 bg-transparent outline-none resize-none placeholder:text-white/40"
                  disabled={loading}
                />
                <button
                  onClick={() => void (recording ? stopRecording() : startRecording())}
                  disabled={loading}
                  className={`rounded-xl px-4 py-2 font-semibold transition disabled:opacity-60 ${
                    recording
                      ? "bg-red-600 text-white"
                      : "bg-white/10 hover:bg-white/20 border border-white/15"
                  }`}
                  title={recording ? "Stop" : "Record"}
                >
                  {recording ? "⏹" : "🎤"}
                </button>
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
              <Link
                href="/call"
                className="rounded-lg bg-white text-black px-3 py-2 text-xs font-semibold hover:opacity-90 transition"
              >
                📞 Call
              </Link>
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

      {/* Settings Drawer */}
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
                {/* Relationship Info */}
                {relationship && (
                  <section>
                    <div className="text-sm font-medium mb-2">Relationship Progress</div>
                    <div className="bg-white/5 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/60">Stage:</span>
                        <span>{relationship.stage}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/60">Level:</span>
                        <span>{relationship.level}/100</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/60">Current Streak:</span>
                        <span>{relationship.streak} days</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/60">Longest Streak:</span>
                        <span>{relationship.longestStreak || 0} days</span>
                      </div>
                    </div>
                  </section>
                )}

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
