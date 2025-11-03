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

// UPDATED: Chat response now includes relationship status and manual override flag
type ChatResponse = { 
  reply?: string; 
  language?: LangCode; 
  voiceMode?: string;
  relationshipStatus?: RelationshipStatus;
  in_manual_override?: boolean; // NEW: Flag when admin is in control
};

type VoiceResponse = {
  text?: string;
  reply?: string;
  language?: LangCode;
  voiceMode?: string;
  audioMp3Base64?: string | null;
  relationshipStatus?: RelationshipStatus;
};

// Manual override message from server
interface ManualMessage {
  reply: string;
  timestamp: string;
  id: string;
}

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
   Main component (WITH RELATIONSHIP PROGRESSION + MANUAL OVERRIDE POLLING)
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

  // NEW: Manual override tracking
  const [inManualOverride, setInManualOverride] = useState(false);
  const lastFetchTimestampRef = useRef<string>('1970-01-01'); // Track last fetched message timestamp
  const generalPollIntervalRef = useRef<NodeJS.Timeout | null>(null); // For continuous polling

  // NEW: Continuous polling for new messages (catches manual override messages)
  const checkForNewMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/manual-override/pending-response/${USER_ID}?since=${encodeURIComponent(lastFetchTimestampRef.current)}`,
        { credentials: "include" }
      );
      
      if (res.ok) {
        const data = await res.json();
        
        // If there are new messages, add them to chat
        if (data.has_response && data.messages && data.messages.length > 0) {
          setMessages((prev) => [
            ...prev,
            ...data.messages.map((msg: ManualMessage) => ({
              from: "ellie" as const,
              text: msg.reply,
              ts: new Date(msg.timestamp).getTime()
            }))
          ]);
          
          // Update timestamp
          const latestTimestamp = data.messages[data.messages.length - 1].timestamp;
          lastFetchTimestampRef.current = latestTimestamp;
          
          // Hide typing if admin stopped typing
          if (!data.is_admin_typing) {
            setTyping(false);
          }
        }
        
        // Update typing indicator if admin is typing
        if (data.in_override && data.is_admin_typing) {
          setTyping(true);
        } else if (!data.in_override) {
          // Override ended
          setInManualOverride(false);
          setTyping(false);
        }
      }
    } catch (err) {
      console.error("Failed to check for new messages:", err);
    }
  }, []);

  // Start continuous polling when component mounts
  useEffect(() => {
    // Initialize timestamp to now so we only get future messages
    lastFetchTimestampRef.current = new Date().toISOString();
    
    // Poll every 2 seconds for new messages
    generalPollIntervalRef.current = setInterval(checkForNewMessages, 2000);
    
    return () => {
      if (generalPollIntervalRef.current) {
        clearInterval(generalPollIntervalRef.current);
      }
    };
  }, [checkForNewMessages]);

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

  // NEW: Poll for manual override responses

  // NEW: Fetch relationship on mount and periodically
  useEffect(() => {
    fetchRelationshipStatus();
    const interval = setInterval(fetchRelationshipStatus, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchRelationshipStatus]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  useEffect(() => {
    refreshSession()
      .then((ok) => {
        if (!ok) router.push("/");
      })
      .catch(() => router.push("/"));
  }, [router]);

  useEffect(() => {
    if (!langReady) {
      fetch("/api/get-language", { credentials: "include" })
        .then((r) => r.json())
        .then((d: GetLanguageResponse) => {
          const code = d?.language;
          if (code && LANGS.some((o) => o.code === code)) {
            setChosenLang(code);
            setLangReady(true);
            return;
          }
          setLangReady(false);
        })
        .catch(() => setLangReady(false));
    }
  }, [langReady]);

  const handleSendText = useCallback(
    async (txt: string) => {
      if (!txt.trim() || loading) return;
      const userMsg: ChatMsg = { from: "you", text: txt, ts: Date.now() };
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setLoading(true);
      setTyping(true);

      try {
        const data = await apiPost<ChatResponse>("/api/chat", { message: txt });
        
        // Check if in manual override
        if (data.in_manual_override) {
          // Don't reset timestamp - continuous polling is handling new messages
          setInManualOverride(true);
          setTyping(true); // Keep typing indicator while waiting for response
          // Continuous polling will display admin's response
          setLoading(false);
          return;
        }

        // Add 1 second artificial delay to make responses feel more natural
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setTyping(false);
        
        // Update relationship if provided
        if (data.relationshipStatus) {
          setRelationship(data.relationshipStatus);
        }

        const reply = data.reply || "(No reply)";
        setMessages((m) => [...m, { from: "ellie", text: reply, ts: Date.now() }]);
        
        if (data.language && data.language !== chosenLang) {
          setChosenLang(data.language);
        }
        if (data.voiceMode) {
          setVoiceMode(data.voiceMode);
        }
      } catch (e) {
        setTyping(false);
        show("Error: " + errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [loading, chosenLang, show]
  );


  const confirmLanguage = useCallback(async () => {
    try {
      const data = await apiPost<SetLanguageResponse>("/api/set-language", {
        language: chosenLang,
      });
      if (data.ok) {
        setLangReady(true);
        show(`Language set: ${data.label || chosenLang}`);
      }
    } catch (e) {
      show("Error: " + errorMessage(e));
    }
  }, [chosenLang, show]);

  const resetConversation = useCallback(async () => {
    if (!confirm("Reset conversation? (Facts remain)")) return;
    try {
      await apiPost("/api/reset", { userId: USER_ID });
      setMessages([]);
      show("Conversation reset (facts remain)");
    } catch (e) {
      show("Error: " + errorMessage(e));
    }
  }, [show]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (!blob.size) {
          show("No audio recorded");
          return;
        }
        setLoading(true);
        setTyping(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "rec.webm");
          form.append("userId", USER_ID);
          form.append("language", chosenLang);

          const resp = await apiPostForm<VoiceResponse>("/api/voice-chat", form);
          
          // Add 1 second artificial delay to make responses feel more natural
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          setTyping(false);

          const userText = resp.text || "";
          const reply = resp.reply || "(No reply)";

          if (userText) {
            setMessages((m) => [
              ...m,
              { from: "you", text: userText, ts: Date.now() },
              { from: "ellie", text: reply, ts: Date.now() },
            ]);
          }

          if (resp.language && resp.language !== chosenLang) {
            setChosenLang(resp.language);
          }
          if (resp.voiceMode) {
            setVoiceMode(resp.voiceMode);
          }

          if (resp.audioMp3Base64) {
            const b64 = resp.audioMp3Base64;
            const byteStr = atob(b64);
            const buf = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i);
            const blob2 = new Blob([buf], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob2);
            const audio = new Audio(url);
            audio.play().catch((e) => console.error("Audio play error:", e));
          }
        } catch (e) {
          setTyping(false);
          show("Error: " + errorMessage(e));
        } finally {
          setLoading(false);
        }
      };
      mr.start();
      setRecording(true);
    } catch (e) {
      show("Mic error: " + errorMessage(e));
    }
  }, [chosenLang, show]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const loadVoicePresets = useCallback(async () => {
    if (loadingPresets.current || presets.length > 0) return;
    loadingPresets.current = true;
    try {
      const data = await apiPost<PresetsResponse>("/api/presets/list", {});
      if (data.presets) setPresets(data.presets);
      const curr = await apiPost<CurrentPresetResponse>("/api/presets/current", {});
      if (curr.preset) setCurrentPreset(curr.preset);
    } catch (e) {
      console.error("Load presets error:", e);
    } finally {
      loadingPresets.current = false;
    }
  }, [presets.length]);

  const applyPreset = useCallback(
    async (key: string) => {
      try {
        const data = await apiPost<ApplyPresetResponse>("/api/presets/apply", { preset: key });
        if (data.ok) {
          setCurrentPreset(key);
          show(`Voice preset: ${key}`);
        }
      } catch (e) {
        show("Error: " + errorMessage(e));
      }
    },
    [show]
  );

  useEffect(() => {
    if (settingsOpen) loadVoicePresets();
  }, [settingsOpen, loadVoicePresets]);

  if (!langReady) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden text-white">
        <AuroraBG />
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="mb-4 text-center text-xl font-semibold">Select Language</h2>
          <select
            value={chosenLang}
            onChange={(e) => setChosenLang(e.target.value as LangCode)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:ring-2 focus:ring-[#A78BFA]/40 transition"
          >
            {LANGS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={confirmLanguage}
            className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#A78BFA] to-[#5EEAD4] px-4 py-2.5 font-semibold text-black shadow-xl transition hover:shadow-2xl"
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden text-white">
      <AuroraBG />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* NEW: Relationship Header */}
        {relationship && (
          <div className="border-b border-white/10 bg-gradient-to-r from-black/20 to-black/30 backdrop-blur-md">
            <div className="mx-auto max-w-4xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    {STAGE_STYLES[relationship.stage as keyof typeof STAGE_STYLES]?.emoji || "💬"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">
                      {relationship.stage}
                    </div>
                    <div className="text-xs text-white/60">
                      {MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS] || relationship.mood}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowRelDetails(!showRelDetails)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10 transition"
                >
                  {showRelDetails ? "Hide" : "Show"} Details
                </button>
              </div>

              {showRelDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 grid grid-cols-3 gap-3 text-xs"
                >
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-white/60">Level</div>
                    <div className="text-lg font-bold">{relationship.level}/100</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-white/60">Streak</div>
                    <div className="text-lg font-bold">{relationship.streak} days</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="text-white/60">Investment</div>
                    <div className="text-lg font-bold">
                      {((relationship.emotionalInvestment || 0) * 100).toFixed(0)}%
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="border-b border-white/10 backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border-2 border-[#A78BFA] bg-gradient-to-br from-[#A78BFA] via-[#5EEAD4] to-[#A78BFA] shadow-xl" />
              <div>
                <div className="font-semibold leading-tight">Ellie</div>
                <div className="text-xs text-white/60">
                  {voiceMode ? `Voice: ${voiceMode}` : "Online"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm transition hover:bg-white/10"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-4xl space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`animate-drop-in flex ${msg.from === "you" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-lg ${
                    msg.from === "you"
                      ? "bg-gradient-to-br from-[#A78BFA] to-[#8B5CF6] text-white"
                      : "border border-white/15 bg-white/5 backdrop-blur"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words text-sm">{msg.text}</div>
                  <div className="mt-1 text-right text-[10px] opacity-60">{fmtTime(msg.ts)}</div>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-1">
                    <div className="typing-dot bg-white" />
                    <div className="typing-dot bg-white" />
                    <div className="typing-dot bg-white" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-white/10 backdrop-blur-md">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading && input.trim()) {
                        handleSendText(input.trim());
                      }
                    }
                  }}
                  rows={1}
                  placeholder={inManualOverride ? "Ellie is typing..." : "Type a message..."}
                  disabled={loading || inManualOverride}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none backdrop-blur placeholder:text-white/40 focus:ring-2 focus:ring-[#A78BFA]/40 transition disabled:opacity-50"
                  style={{ minHeight: "48px", maxHeight: "120px" }}
                />
              </div>
              <button
                onClick={() => handleSendText(input.trim())}
                disabled={loading || !input.trim() || inManualOverride}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#A78BFA] to-[#5EEAD4] font-semibold text-black shadow-xl transition hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>

              {!recording ? (
                <button
                  onClick={startRecording}
                  disabled={loading}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10 disabled:opacity-50"
                >
                  🎤
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-red-500 bg-red-500/20 transition hover:bg-red-500/30"
                >
                  ⏹️
                </button>
              )}

              <Link
                href="/call"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/10 text-center text-xs"
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