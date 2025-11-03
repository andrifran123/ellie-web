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

// REMOVED: const USER_ID = "default-user";
// We'll fetch the real user ID from /api/auth/me instead!

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

  // NEW: Real user ID state
  const [userId, setUserId] = useState<string | null>(null);
  const [userIdLoading, setUserIdLoading] = useState(true);

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

  // NEW: Fetch authenticated user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.userId) {
            setUserId(data.userId);
            console.log("✅ Authenticated user ID:", data.userId);
          } else {
            console.error("❌ No userId in auth response");
            show("Could not get user ID");
          }
        } else {
          console.error("❌ Auth check failed");
          show("Authentication failed");
        }
      } catch (err) {
        console.error("❌ Failed to fetch user ID:", err);
        show("Could not authenticate");
      } finally {
        setUserIdLoading(false);
      }
    };

    fetchUserId();
  }, [show]);

  // NEW: Continuous polling for new messages (catches manual override messages)
  // UPDATED: Now uses the real userId instead of hardcoded "default-user"
  const checkForNewMessages = useCallback(async () => {
    if (!userId) return; // Don't poll if we don't have a user ID yet
    
    try {
      const res = await fetch(
        `/api/manual-override/pending-response/${userId}?since=${encodeURIComponent(lastFetchTimestampRef.current)}`,
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
  }, [userId]); // Added userId to dependencies

  // Start continuous polling when userId is available
  useEffect(() => {
    if (!userId) return; // Wait for userId to be loaded
    
    // Initialize timestamp to now so we only get future messages
    lastFetchTimestampRef.current = new Date().toISOString();
    
    // Poll every 2 seconds for new messages
    generalPollIntervalRef.current = setInterval(checkForNewMessages, 2000);
    
    return () => {
      if (generalPollIntervalRef.current) {
        clearInterval(generalPollIntervalRef.current);
      }
    };
  }, [checkForNewMessages, userId]); // Added userId to dependencies

  // Fetch relationship status on mount
  useEffect(() => {
    const fetchRelationship = async () => {
      try {
        const res = await fetch("/api/relationship-status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setRelationship(data);
        }
      } catch (err) {
        console.error("Failed to fetch relationship:", err);
      }
    };

    fetchRelationship();
  }, []);

  /* Language check (we don't let the user chat until they pick) */
  useEffect(() => {
    refreshSession()
      .then(() => apiPost<GetLanguageResponse>("/api/language/get", {}))
      .then((r) => {
        if (r.language && r.language !== "null") {
          setChosenLang(r.language);
          setLangReady(true);
        }
      })
      .catch((e) => console.error("lang load error:", errorMessage(e)));
  }, []);

  /* Relationship status polling */
  useEffect(() => {
    if (!langReady) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/relationship-status", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setRelationship(data);
        }
      } catch {}
    }, 30000); // Poll every 30 seconds
    return () => clearInterval(poll);
  }, [langReady]);

  /* Auto-scroll logic */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing]);

  /* Set language */
  const confirmLanguage = () => {
    refreshSession()
      .then(() =>
        apiPost<SetLanguageResponse>("/api/language/set", {
          language: chosenLang,
        })
      )
      .then((r) => {
        if (r.ok && r.language) {
          show(
            `Language set to ${LANGS.find((x) => x.code === r.language)?.name || chosenLang
            }`
          );
          setLangReady(true);
        }
      })
      .catch((e) => show(errorMessage(e)));
  };

  /* Reset conversation */
  const resetConversation = () => {
    refreshSession()
      .then(() => apiPost("/api/reset", {}))
      .then(() => {
        setMessages([]);
        show("Conversation cleared (saved facts remain)");
      })
      .catch((e) => show("Reset error: " + errorMessage(e)));
  };

  /* Load presets on demand */
  const loadPresets = async () => {
    if (loadingPresets.current) return;
    loadingPresets.current = true;
    try {
      await refreshSession();
      const r = await apiPost<PresetsResponse>("/api/voice/presets", {});
      if (r.presets) setPresets(r.presets);
      const curr = await apiPost<CurrentPresetResponse>("/api/voice/current", {});
      if (curr.preset) setCurrentPreset(curr.preset);
    } catch (e) {
      show("Presets error: " + errorMessage(e));
    }
    loadingPresets.current = false;
  };

  const applyPreset = async (key: string) => {
    try {
      await refreshSession();
      const r = await apiPost<ApplyPresetResponse>("/api/voice/preset", {
        preset: key,
      });
      if (r.ok && r.preset) {
        setCurrentPreset(r.preset);
        show(`Voice preset: ${r.preset} (voice: ${r.voice})`);
      }
    } catch (e) {
      show("Preset apply error: " + errorMessage(e));
    }
  };

  /* Send text message */
  const handleSend = async () => {
    if (loading || !input.trim()) return;
    const msg = input.trim();
    setInput("");
    setLoading(true);

    // Add user message
    const userMsg: ChatMsg = { from: "you", text: msg, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);

    try {
      await refreshSession();
      setTyping(true);
      const r = await apiPost<ChatResponse>("/api/chat", {
        message: msg,
        language: chosenLang,
      });
      setTyping(false);
      
      // Update manual override state
      if (r.in_manual_override) {
        setInManualOverride(true);
      }
      
      // Update relationship if returned
      if (r.relationshipStatus) {
        setRelationship(r.relationshipStatus);
      }
      
      // If we got a reply (not in manual override or admin sent response)
      if (r.reply) {
        const ellieMsg: ChatMsg = { from: "ellie", text: r.reply, ts: Date.now() };
        setMessages((m) => [...m, ellieMsg]);
      }
      
      // Update voice mode hint if present
      if (r.voiceMode) setVoiceMode(r.voiceMode);
    } catch (e) {
      setTyping(false);
      show("Chat error: " + errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  /* Voice recording (UPDATED WITH RELATIONSHIP) */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      show("Microphone error: " + errorMessage(e));
    }
  };

  const stopRecording = async () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === "inactive") return;

    rec.stop();
    rec.onstop = async () => {
      setRecording(false);
      rec.stream.getTracks().forEach((t) => t.stop());
      if (chunksRef.current.length === 0) return;

      setLoading(true);
      setTyping(true);

      const blob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
      try {
        await refreshSession();

        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("language", chosenLang);

        const r = await apiPostForm<VoiceResponse>("/api/voice", fd);
        setTyping(false);

        // Update relationship if returned
        if (r.relationshipStatus) {
          setRelationship(r.relationshipStatus);
        }

        const userText = r.text || r.reply || "[Voice]";
        const userMsg: ChatMsg = { from: "you", text: userText, ts: Date.now() };
        setMessages((m) => [...m, userMsg]);

        if (r.reply) {
          const ellieMsg: ChatMsg = { from: "ellie", text: r.reply, ts: Date.now() };
          setMessages((m) => [...m, ellieMsg]);

          // Play TTS audio if present
          if (r.audioMp3Base64) {
            const audio = new Audio("data:audio/mp3;base64," + r.audioMp3Base64);
            audio.play().catch(console.error);
          }
        }

        if (r.voiceMode) setVoiceMode(r.voiceMode);
      } catch (e) {
        setTyping(false);
        show("Voice error: " + errorMessage(e));
      } finally {
        setLoading(false);
      }
    };
  };

  /* Language not set => show a friendly picker */
  if (!langReady) {
    return (
      <div className="relative h-screen w-full overflow-hidden text-white">
        <AuroraBG />
        <div className="relative z-10 flex h-full items-center justify-center p-4">
          <motion.div
            className="max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-[0_10px_80px_rgba(140,110,255,0.25)] backdrop-blur-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="mb-2 text-3xl font-bold">Choose your language</h1>
            <p className="mb-6 text-white/70">Ellie will remember this</p>
            <select
              value={chosenLang}
              onChange={(e) => setChosenLang(e.target.value as LangCode)}
              className="mb-4 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[#A78BFA]/40 transition"
            >
              {LANGS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
            <button
              onClick={confirmLanguage}
              className="w-full rounded-xl bg-gradient-to-r from-white to-white text-black font-bold py-3 hover:opacity-90 transition"
            >
              Continue
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Show loading if user ID is not yet loaded
  if (userIdLoading || !userId) {
    return (
      <div className="relative h-screen w-full overflow-hidden text-white">
        <AuroraBG />
        <div className="relative z-10 flex h-full items-center justify-center p-4">
          <motion.div
            className="max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-[0_10px_80px_rgba(140,110,255,0.25)] backdrop-blur-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="mb-2 text-3xl font-bold">Loading...</h1>
            <p className="mb-6 text-white/70">Authenticating your session</p>
          </motion.div>
        </div>
      </div>
    );
  }

  /* Main chat */
  const stageData = relationship
    ? STAGE_STYLES[relationship.stage as keyof typeof STAGE_STYLES] || STAGE_STYLES["Curious Stranger"]
    : STAGE_STYLES["Curious Stranger"];
  const moodLabel = relationship?.mood
    ? MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS] || "😌 Normal"
    : "😌 Normal";

  return (
    <div className="relative h-screen w-full overflow-hidden text-white">
      <AuroraBG />

      <main className="relative z-10 mx-auto flex h-full max-w-3xl flex-col">
        {/* Header with relationship info */}
        <header className="flex items-center justify-between border-b border-white/15 bg-black/20 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Ellie</h1>
            {relationship && (
              <div 
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition"
                onClick={() => setShowRelDetails(!showRelDetails)}
              >
                <div className="text-2xl">{stageData.emoji}</div>
                <div className="text-xs">
                  <div className="font-semibold">{relationship.stage}</div>
                  <div className="text-white/60">Lvl {relationship.level} • {moodLabel}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSettingsOpen(true);
                loadPresets();
              }}
              className="rounded-full border border-white/15 bg-white/5 p-2 hover:bg-white/10 transition"
              aria-label="Settings"
            >
              ⚙️
            </button>
            <button
              onClick={() => router.push("/logout")}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 transition"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Relationship Details Dropdown */}
        {showRelDetails && relationship && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/15 bg-gradient-to-br from-black/40 to-black/20 backdrop-blur-xl overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60">Progress to next stage</span>
                  <span className="font-semibold">{relationship.level}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full bg-gradient-to-r ${stageData.bg} to-white`}
                    initial={{ width: 0 }}
                    animate={{ width: `${relationship.level}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-white/60">Streak</div>
                  <div className="text-lg font-bold">{relationship.streak} days 🔥</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <div className="text-white/60">Total Chats</div>
                  <div className="text-lg font-bold">{relationship.totalInteractions || 0}</div>
                </div>
              </div>

              {/* Stage Hint */}
              <div className="text-xs text-white/70 italic bg-white/5 rounded-lg p-2">
                💡 {stageData.hint}
              </div>
            </div>
          </motion.div>
        )}

        {/* Voice Mode Hint */}
        {voiceMode && (
          <div className="border-b border-white/15 bg-white/5 px-4 py-2 text-center text-sm backdrop-blur-xl">
            🎙️ Voice mode: <span className="font-semibold">{voiceMode}</span>
          </div>
        )}

        {/* Manual Override Banner */}
        {inManualOverride && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b border-yellow-500/30 bg-yellow-900/20 px-4 py-2 text-center text-sm backdrop-blur-xl"
          >
            🎮 <span className="font-semibold">Admin is in the chat</span> - responses are coming from a real person
          </motion.div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
        >
          {messages.map((m, i) => (
            <motion.div
              key={i}
              className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  m.from === "you"
                    ? "border border-white/15 bg-white text-black"
                    : "border border-white/15 bg-white/10 backdrop-blur-md"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div
                  className={`mt-1 text-xs ${
                    m.from === "you" ? "text-black/60" : "text-white/50"
                  }`}
                >
                  {fmtTime(m.ts)}
                </div>
              </div>
            </motion.div>
          ))}

          {typing && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
                <span className="typing-dot">•</span>
                <span className="typing-dot">•</span>
                <span className="typing-dot">•</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/15 bg-black/20 p-4 backdrop-blur-md">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type a message..."
              disabled={loading}
              className="flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 outline-none placeholder:text-white/40 focus:ring-2 focus:ring-[#A78BFA]/40 disabled:opacity-50 transition"
            />

            {recording ? (
              <button
                onClick={stopRecording}
                disabled={loading}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/50 bg-red-500/20 text-2xl hover:bg-red-500/30 disabled:opacity-50 transition"
                aria-label="Stop recording"
              >
                ⏹️
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={loading}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl hover:bg-white/20 disabled:opacity-50 transition"
                aria-label="Record voice"
              >
                🎙️
              </button>
            )}

            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-white to-white text-2xl text-black hover:opacity-90 disabled:opacity-50 transition"
              aria-label="Send"
            >
              ▶️
            </button>
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

                {/* User ID Display (for debugging) */}
                <section>
                  <div className="text-sm font-medium mb-2">Debug Info</div>
                  <div className="text-xs text-white/50 bg-white/5 rounded-lg p-2 font-mono break-all">
                    User ID: {userId}
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