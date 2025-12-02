"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSession, apiPost, apiPostForm } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   Types & constants (UPDATED WITH RELATIONSHIP)
───────────────────────────────────────────────────────────── */
// 📸 Photo data structure (matches backend response)
interface PhotoData {
  url: string;
  id?: string;
  category?: string;
  mood?: string;
  setting?: string;
  isMilestone?: boolean;
}

type ChatMsg = { 
  from: "you" | "ellie"; 
  text: string; 
  ts: number; 
  seen?: boolean;
  photo?: PhotoData; // 📸 NEW: Photo attachment
};

// Database message format
interface DbMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  photo_url?: string;
  photo_id?: number;
  created_at: string;
}

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
  | "en" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

type LangOption = { code: LangCode; name: string };

type GetLanguageResponse = { language?: LangCode | null };
type SetLanguageResponse = { ok?: boolean; language?: LangCode; label?: string };
type GetNameResponse = { name?: string | null };
type SetNameResponse = { ok?: boolean; name?: string };

// UPDATED: Chat response now includes relationship status and manual override flag
type ChatResponse = { 
  reply?: string; 
  language?: LangCode; 
  voiceMode?: string;
  relationshipStatus?: RelationshipStatus;
  in_manual_override?: boolean; // NEW: Flag when admin is in control
  photo?: PhotoData; // 📸 NEW: Photo attachment
  photoRefused?: boolean; // 📸 NEW: Flag when user asked for photo and was refused
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

// User ID is fetched dynamically - see state below

const LANGS: LangOption[] = [
  { code: "en", name: "English" },
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
   Visual helpers - Cozy Romance Theme (no animations)
───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   Main component (WITH RELATIONSHIP PROGRESSION + MANUAL OVERRIDE POLLING)
───────────────────────────────────────────────────────────── */
export default function ChatPage() {
  const router = useRouter();
  const { toasts, show } = useToasts();

  // NEW: Real user ID fetched from /api/auth/me
  const [userId, setUserId] = useState<string | null>(null);

  // messages & composer
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 🚫 Voice recording removed

  // language gate
  const [langReady, setLangReady] = useState(false);
  const [chosenLang, setChosenLang] = useState<LangCode>("en");

  // name gate (after language)
  const [nameReady, setNameReady] = useState(false);
  const [nameChecked, setNameChecked] = useState(false); // Track if we've checked for existing name
  const [userName, setUserName] = useState("");

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
  const messageIdsRef = useRef<Set<string>>(new Set()); // Track message IDs to prevent duplicates
  const messageContentRef = useRef<Map<string, number>>(new Map()); // Track message content+timestamp

  // NEW: Abort controller for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Typing timeout ref for auto-clearing typing indicator
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 📞 Missed call state
  const [missedCallChecked, setMissedCallChecked] = useState(false);

  // Helper function to set typing with auto-clear timeout
  const setTypingWithTimeout = (isTyping: boolean) => {
    // Clear any existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    // Set typing state
    setTyping(isTyping);

    // If setting to true, auto-clear after 5 seconds
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(false);
        typingTimeoutRef.current = null;
      }, 5000); // Clear after 5 seconds of no updates
    }
  };

  // Helper to create unique message key and track it
  const trackMessage = (text: string, timestamp?: string | number) => {
    const content = text.substring(0, 100); // Use first 100 chars
    const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : (timestamp || Date.now());
    
    // Store content with its timestamp
    messageContentRef.current.set(content, ts);
    
    // Also track traditional key for backward compatibility
    const key = `${ts}-${text.substring(0, 50)}`;
    messageIdsRef.current.add(key);
    
    return key;
  };

  // Helper to check if message is duplicate (same content within 60 seconds)
  const isDuplicate = (text: string, timestamp: string | number): boolean => {
    const content = text.substring(0, 100);
    const newTs = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    
    // Check if we've seen this content recently
    const existingTs = messageContentRef.current.get(content);
    if (existingTs) {
      const timeDiff = Math.abs(newTs - existingTs);
      if (timeDiff < 60000) { // Within 60 seconds
        console.log("⚠️ Duplicate detected (same content within 60s):", content.substring(0, 30));
        return true;
      }
    }
    
    return false;
  };


  // 📞 Check for pending missed call
  const checkForMissedCall = useCallback(async () => {
    if (missedCallChecked) return;
    
    try {
      // Step 1: Check if there's a pending missed call
      const response = await fetch(`/api/missed-call/pending`, {
        credentials: "include"  // Use cookie-based auth
      });
      
      if (!response.ok) {
        console.error('Failed to check for missed call:', response.status);
        setMissedCallChecked(true);
        return;
      }
      
      const data = await response.json();
      
      if (data.hasMissedCall && data.missedCallId) {
        // Step 2: Create the message in the database
        const createResponse = await fetch(`/api/missed-call/create-message`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json'
          },
          credentials: "include",  // Use cookie-based auth
          body: JSON.stringify({ missedCallId: data.missedCallId })
        });
        
        if (createResponse.ok) {
          const createData = await createResponse.json();
          console.log('✅ Missed call message saved to database');
          
          // Step 3: Add to local state for immediate display
          const missedCallMessage: ChatMsg = {
            from: "ellie",
            text: createData.message,
            ts: new Date(createData.createdAt).getTime(),
            seen: false
          };
          
          setMessages(prev => {
            const alreadyExists = prev.some(msg => 
              msg.text.startsWith('📞 Missed call from Ellie')
            );
            if (alreadyExists) return prev;
            return [missedCallMessage, ...prev];
          });
        } else {
          console.error('Failed to create missed call message in database');
        }
      }
      
      setMissedCallChecked(true);
    } catch (error) {
      console.error('Failed to check for missed call:', error);
      setMissedCallChecked(true);
    }
  }, []);

  // Fetch authenticated user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.userId) {
            setUserId(data.userId);
            console.log("✅ User ID fetched:", data.userId);
          }
        }
      } catch (err) {
        console.error("❌ Failed to fetch user ID:", err);
      }
    };
    fetchUserId();
  }, []);

 // 💬 Load conversation history when userId is available
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!userId) return;
      
      try {
        console.log("📜 Loading chat history for user:", userId);
        
        const res = await fetch(`/api/chat-view/messages/${userId}?limit=50`, {
          credentials: "include"
        });
        
        if (res.ok) {
          const data = await res.json();
          
          if (data.success && data.messages && data.messages.length > 0) {
            console.log(`✅ Loaded ${data.messages.length} messages from history`);
            
            // Convert database messages to ChatMsg format
            const historicalMessages: ChatMsg[] = (data.messages as DbMessage[])
              .filter((msg: DbMessage) => msg.role !== 'system') // Filter out system notes
              .map((msg: DbMessage) => ({
                from: msg.role === 'user' ? 'you' : 'ellie',
                text: msg.content,
                ts: new Date(msg.created_at).getTime(),
                seen: true, // Mark all historical messages as seen
                // Include photo if present
                ...(msg.photo_url && {
                  photo: {
                    url: msg.photo_url,
                    id: msg.photo_id?.toString()
                  }
                })
              }));
            
            // Set the messages, replacing any existing ones
            setMessages(historicalMessages);
            
            // Track these messages to prevent duplicates from polling
            historicalMessages.forEach(msg => {
              trackMessage(msg.text, msg.ts);
            });
            
            console.log("📨 Chat history loaded successfully");
          } else {
            console.log("📭 No previous messages found");
          }
        } else {
          console.error("❌ Failed to load chat history:", res.status);
        }
      } catch (err) {
        console.error("❌ Error loading chat history:", err);
        // Don't fail the app if history loading fails
      }
    };
    
    loadChatHistory();
    checkForMissedCall();
  }, [userId, checkForMissedCall]); // Run when userId becomes available

  // NEW: Continuous polling for new messages (catches manual override messages)
  const checkForNewMessages = useCallback(async () => {
    if (!userId) return; // Wait for userId to be loaded
    
    try {
      const res = await fetch(
        `/api/manual-override/pending-response/${userId}?since=${encodeURIComponent(lastFetchTimestampRef.current)}`,
        { credentials: "include" }
      );
      
      if (res.ok) {
        const data = await res.json();
        
        console.log("📡 Polling response:", {
          in_override: data.in_override,
          has_response: data.has_response,
          is_admin_typing: data.is_admin_typing,
          message_count: data.messages?.length || 0
        });
        
        // Update manual override state
        if (data.in_override !== undefined) {
          const wasInOverride = inManualOverride;
          setInManualOverride(data.in_override);
          
          // If we just entered manual override, abort any in-flight requests
          if (data.in_override && !wasInOverride) {
            console.log("🛑 Entering manual override - aborting in-flight requests");
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
          }
        }
        
        // If there are new messages, add them to chat (with deduplication)
        if (data.has_response && data.messages && data.messages.length > 0) {
          console.log("📨 Messages from server:", data.messages.map((m: ManualMessage) => ({
            id: m.id,
            text: m.reply.substring(0, 20),
            timestamp: m.timestamp
          })));
          
          const newMessages = data.messages.filter((msg: ManualMessage) => {
            // Check if duplicate by content (handles normal chat vs polling mismatch)
            if (isDuplicate(msg.reply, msg.timestamp)) {
              return false;
            }
            
            // Also check by ID if available
            if (msg.id && messageIdsRef.current.has(msg.id)) {
              console.log("⚠️ Duplicate message blocked (by ID):", msg.id);
              return false;
            }
            
            // Track this message
            trackMessage(msg.reply, msg.timestamp);
            console.log("✅ New message added:", msg.reply.substring(0, 30));
            return true;
          });
          
          if (newMessages.length > 0) {
            console.log(`📨 Adding ${newMessages.length} new message(s) to chat`);
            setMessages((prev) => [
              ...prev,
              ...newMessages.map((msg: ManualMessage) => ({
                from: "ellie" as const,
                text: msg.reply,
                ts: new Date(msg.timestamp).getTime()
              }))
            ]);
            
            // Update timestamp to the latest message
            const latestTimestamp = newMessages[newMessages.length - 1].timestamp;
            lastFetchTimestampRef.current = latestTimestamp;
            
            // Hide typing now that message arrived
            setTyping(false);
          }
        }
        
        // Update typing indicator - ONLY show when admin is actually typing
        if (data.in_override) {
          // ONLY show typing dots when admin is actively typing
          if (data.is_admin_typing) {
            setTypingWithTimeout(true);
          } else {
            // Admin not typing - clear the indicator
            setTyping(false);
          }
        } else {
          // Override ended - clear typing
          setTyping(false);
        }
      }
    } catch (err) {
      console.error("Failed to check for new messages:", err);
    }
  }, [userId, inManualOverride]);

  // Start continuous polling when userId is available
  useEffect(() => {
    if (!userId) return; // Wait for userId
    
    // Initialize timestamp to now so we only get future messages
    lastFetchTimestampRef.current = new Date().toISOString();
    
    // Poll every 2 seconds for new messages
    generalPollIntervalRef.current = setInterval(checkForNewMessages, 2000);
    
    return () => {
      if (generalPollIntervalRef.current) {
        clearInterval(generalPollIntervalRef.current);
      }
    };
  }, [checkForNewMessages, userId]);

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

  // Auto-scroll to bottom when new messages arrive or on initial load
  useEffect(() => {
    // Small delay to ensure DOM has updated
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };

    // Use requestAnimationFrame for smoother scroll after DOM updates
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [messages, typing]);

  // Scroll to absolute bottom on initial load
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [langReady]);

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

  // Check if user already has a name set
  // IMPORTANT: Wait for userId to be available before checking name
  useEffect(() => {
    if (langReady && !nameChecked && userId) {
      setNameChecked(true); // Mark that we're checking
      fetch("/api/get-name", { credentials: "include" })
        .then((r) => r.json())
        .then((d: GetNameResponse) => {
          if (d?.name && d.name.trim()) {
            setUserName(d.name);
            setNameReady(true);
          }
          // If no name, nameReady stays false and we show the name input
        })
        .catch(() => {
          // On error, still show the name input
        });
    }
  }, [langReady, nameChecked, userId]);

  const handleSendText = useCallback(
    async (txt: string) => {
      if (!txt.trim() || loading) return;
      
      // Abort any previous in-flight request
      if (abortControllerRef.current) {
        console.log("🛑 Aborting previous request");
        abortControllerRef.current.abort();
      }
      
      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      const userMsg: ChatMsg = { from: "you", text: txt, ts: Date.now() };
      const userMsgTs = userMsg.ts;
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setLoading(true);
      
      // ⚡ INSTANT: Mark message as seen immediately
      setMessages((m) => 
        m.map((msg) => 
          msg.ts === userMsgTs && msg.from === "you"
            ? { ...msg, seen: true } 
            : msg
        )
      );
      
      // Show typing dots immediately (only in normal mode)
      if (!inManualOverride) {
        setTyping(true);
      }

      try {
        // Check manual override status before sending
        const overrideCheckRes = await fetch(`/api/manual-override/status/${userId}`, {
          credentials: "include",
          signal: abortController.signal
        });
        
        if (overrideCheckRes.ok) {
          const overrideData = await overrideCheckRes.json();
          if (overrideData.in_override) {
            console.log("🎮 Manual override active - storing message only");
            setInManualOverride(true);
            
            // Send the message to be stored
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ message: txt }),
              signal: abortController.signal
            });
            
            // Clear typing - will show when admin actually starts typing
            setTyping(false);
            setLoading(false);
            return;
          }
        }
        
        const data = await apiPost<ChatResponse>("/api/chat", { message: txt });
        
        // Double-check if manual override was activated during the request
        if (data.in_manual_override) {
          console.log("🎮 Manual override activated during request - ignoring API response");
          setInManualOverride(true);
          // Don't show typing - will show when admin actually starts typing
          setTyping(false);
          setLoading(false);
          return;
        }

        // If request was aborted, don't process response
        if (abortController.signal.aborted) {
          console.log("🛑 Request was aborted - skipping response");
          setTyping(false);
          setLoading(false);
          return;
        }

        // Update relationship if provided
        if (data.relationshipStatus) {
          setRelationship(data.relationshipStatus);
        }

        const reply = data.reply || "(No reply)";
        const ellieMsg: ChatMsg = { from: "ellie", text: reply, ts: Date.now(), photo: data.photo };

        // 📸 Debug photo data
        if (data.photo) {
          console.log("📸 Photo received:", JSON.stringify(data.photo));
        }

        // ✅ FIX: Add message first, THEN hide typing indicator
        setMessages((m) => [...m, ellieMsg]);

        // Track this message to prevent duplicate if polling fetches it later
        trackMessage(reply, ellieMsg.ts);
        console.log("✅ Normal chat message tracked:", reply.substring(0, 30));
        
        // ⚡ INSTANT: Hide typing immediately
        setTyping(false);
        
        if (data.language && data.language !== chosenLang) {
          setChosenLang(data.language);
        }
        if (data.voiceMode) {
          setVoiceMode(data.voiceMode);
        }
      } catch (e: unknown) {
        // Check if error is due to abort
        if (e instanceof Error && e.name === 'AbortError') {
          console.log("🛑 Request aborted");
          return;
        }
        setTyping(false);
        show("Error: " + errorMessage(e));
      } finally {
        setLoading(false);
        // Clear abort controller reference if it's still the current one
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [loading, chosenLang, show, userId, inManualOverride]
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

  const confirmName = useCallback(async () => {
    const trimmedName = userName.trim();
    if (!trimmedName) {
      show("Please enter your name");
      return;
    }
    try {
      const data = await apiPost<SetNameResponse>("/api/set-name", {
        name: trimmedName,
      });
      if (data.ok) {
        setNameReady(true);
        show(`Nice to meet you, ${data.name || trimmedName}!`);
      }
    } catch (e) {
      show("Error: " + errorMessage(e));
    }
  }, [userName, show]);

  const resetConversation = useCallback(async () => {
    if (!userId) return; // Wait for userId
    if (!confirm("Reset conversation? (Facts remain)")) return;
    try {
      await apiPost("/api/reset", { userId: userId });
      setMessages([]);
      show("Conversation reset (facts remain)");
    } catch (e) {
      show("Error: " + errorMessage(e));
    }
  }, [show, userId]);

  // 🚫 Voice recording function removed


  // 🚫 Voice recording removed

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
      <div className="chat-bg flex min-h-screen flex-col items-center justify-center text-white">
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-purple-500/20 bg-black/50 p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">💜</div>
            <h2 className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Welcome to Ellie</h2>
            <p className="text-sm text-white/50 mt-2">Choose your language to begin</p>
          </div>
          <select
            value={chosenLang}
            onChange={(e) => setChosenLang(e.target.value as LangCode)}
            className="w-full rounded-xl border border-purple-500/20 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition"
          >
            {LANGS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={confirmLanguage}
            className="send-btn mt-5 w-full px-4 py-3 font-semibold text-white shadow-xl transition hover:scale-[1.02]"
          >
            Start Chatting
          </button>
        </div>
      </div>
    );
  }

  // Show loading while waiting for userId after language is set
  if (langReady && !nameChecked) {
    return (
      <div className="chat-bg flex min-h-screen flex-col items-center justify-center text-white">
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-purple-500/20 bg-black/50 p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-pulse">💜</div>
            <p className="text-sm text-white/50">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show name prompt after language is set AND after we've checked if user has a name
  // Wait for nameChecked to be true before showing input (prevents flash)
  if (!nameReady && nameChecked) {
    return (
      <div className="chat-bg flex min-h-screen flex-col items-center justify-center text-white">
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-purple-500/20 bg-black/50 p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">💜</div>
            <h2 className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">What&apos;s your name?</h2>
            <p className="text-sm text-white/50 mt-2">I&apos;d love to know who I&apos;m talking to</p>
          </div>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmName()}
            placeholder="Enter your name..."
            className="w-full rounded-xl border border-purple-500/20 bg-white/5 px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition text-white placeholder-white/30"
            autoFocus
          />
          <button
            onClick={confirmName}
            disabled={!userName.trim()}
            className="send-btn mt-5 w-full px-4 py-3 font-semibold text-white shadow-xl transition hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-bg flex h-[100dvh] flex-col text-white overflow-hidden">

      <main className="relative z-10 flex flex-1 flex-col min-h-0">
        {/* Relationship Header - Starlight Theme */}
        {relationship && (
          <div className="rel-header">
            <div className="mx-auto max-w-4xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    {STAGE_STYLES[relationship.stage as keyof typeof STAGE_STYLES]?.emoji || "💬"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--accent-warm)]">
                      {relationship.stage}
                    </div>
                    <div className="text-xs text-white/50">
                      {MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS] || relationship.mood}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowRelDetails(!showRelDetails)}
                  className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/10 hover:border-[var(--accent-warm)]/30 transition"
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
                  <div className="rel-stat-card p-3">
                    <div className="text-white/50">Level</div>
                    <div className="text-lg font-bold text-[var(--accent-lavender)]">{relationship.level}/100</div>
                  </div>
                  <div className="rel-stat-card p-3">
                    <div className="text-white/50">Streak</div>
                    <div className="text-lg font-bold text-[var(--accent-warm)]">
                      <span className="streak-heart mr-1">❤️</span>{relationship.streak} days
                    </div>
                  </div>
                  <div className="rel-stat-card p-3">
                    <div className="text-white/50">Investment</div>
                    <div className="text-lg font-bold text-[var(--accent-rose)]">
                      {((relationship.emotionalInvestment || 0) * 100).toFixed(0)}%
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Top bar - Cozy header */}
        <div className="border-b border-purple-500/10 bg-black/30 backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="avatar-glow h-11 w-11 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-fuchsia-500">
                <div className="relative h-full w-full rounded-full overflow-hidden flex items-center justify-center text-lg">
                  💜
                </div>
              </div>
              <div>
                <div className="font-semibold leading-tight text-white">Ellie</div>
                <div className="flex items-center gap-1.5 text-xs text-white/50">
                  <span className="online-dot h-2 w-2 rounded-full bg-green-400" />
                  {voiceMode ? `Voice: ${voiceMode}` : "Online now"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-purple-500/20 bg-white/5 px-3 py-1.5 text-sm transition hover:bg-purple-500/10 hover:border-purple-500/40"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>

        {/* Chat area - scrollable messages only */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
          <div className="mx-auto max-w-4xl space-y-3">
            {messages.map((msg, i) => {
              // Find if this is the last user message
              const isLastUserMessage = msg.from === "you" &&
                messages.slice(i + 1).every(m => m.from !== "you");

              return (
                <div
                  key={i}
                  className={`msg-animate flex ${msg.from === "you" ? "justify-end" : "justify-start"}`}
                >
                  {msg.from === "you" ? (
                    <div className="flex flex-col items-end gap-1 max-w-[75%]">
                      <div className="msg-user w-full px-4 py-3">
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.text}</div>
                        <div className="mt-1.5 text-right text-[10px] opacity-50">{fmtTime(msg.ts)}</div>
                      </div>
                      {msg.seen && isLastUserMessage && (
                        <div className="text-[10px] text-[var(--accent-warm)]/60 px-1">✓ Seen</div>
                      )}
                    </div>
                  ) : (
                    <div className="max-w-[75%] flex flex-col gap-2">
                      <div className="msg-ellie px-4 py-3">
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">{msg.text}</div>
                        <div className="mt-1.5 text-right text-[10px] text-white/40">{fmtTime(msg.ts)}</div>
                      </div>
                      {/* 📸 Photo Display */}
                      {msg.photo && msg.photo.url && (
                        <div className="photo-frame relative msg-animate mt-2">
                          {/* Photo Image */}
                          <div className="relative w-full max-w-xs mx-auto">
                            <img
                              src={msg.photo.url}
                              alt="Ellie"
                              className="w-full h-auto object-cover rounded-lg"
                              loading="eager"
                              onError={(e) => {
                                console.error("Photo failed to load:", msg.photo?.url);
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                              onLoad={() => {
                                console.log("Photo loaded successfully:", msg.photo?.url);
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {typing && (
              <div className="flex justify-start msg-animate">
                <div className="msg-ellie px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Composer - Cozy Input */}
        <div className="border-t border-purple-500/10 bg-black/40 backdrop-blur-xl safe-bottom">
          <div className="mx-auto max-w-4xl px-4 py-4">
            <div className="flex items-end gap-3">
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
                  placeholder={inManualOverride ? "Ellie is typing..." : "Say something sweet..."}
                  disabled={loading}
                  className="input-cozy w-full resize-none px-5 py-3.5 text-sm outline-none disabled:opacity-50"
                  style={{ minHeight: "52px", maxHeight: "120px" }}
                />
              </div>
              <button
                onClick={() => handleSendText(input.trim())}
                disabled={loading || !input.trim()}
                className="send-btn flex h-12 w-12 shrink-0 items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed"
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

              <Link
                href="/call"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-pink-500/20 bg-white/5 transition hover:bg-pink-500/10 hover:border-pink-500/40 text-lg"
                title="Call Ellie"
              >
                📞
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Toasts - Cozy Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-cozy px-4 py-3 text-sm msg-animate"
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Settings Drawer - Starlight */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
            <motion.div
              className="settings-drawer absolute right-0 top-0 h-full w-[92%] max-w-sm p-5"
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--accent-warm)]">Settings</h3>
                <button
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 transition"
                  onClick={() => setSettingsOpen(false)}
                >
                  ✕ Close
                </button>
              </div>

              <div className="mt-5 space-y-6 overflow-y-auto max-h-[calc(100vh-100px)]">
                {/* Relationship Info */}
                {relationship && (
                  <section>
                    <div className="text-sm font-medium mb-2 text-[var(--accent-lavender)]">💕 Relationship Progress</div>
                    <div className="rel-stat-card p-4 space-y-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Stage:</span>
                        <span className="text-[var(--accent-warm)]">{relationship.stage}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Level:</span>
                        <span className="text-[var(--accent-lavender)]">{relationship.level}/100</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Current Streak:</span>
                        <span><span className="streak-heart mr-1">❤️</span>{relationship.streak} days</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/50">Longest Streak:</span>
                        <span>{relationship.longestStreak || 0} days</span>
                      </div>
                    </div>
                  </section>
                )}

                {/* Language */}
                <section>
                  <div className="text-sm font-medium mb-2 text-[var(--accent-lavender)]">🌍 Language</div>
                  <div className="flex gap-2">
                    <select
                      value={chosenLang}
                      onChange={(e) => setChosenLang(e.target.value as LangCode)}
                      className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 outline-none focus:ring-2 focus:ring-[var(--accent-warm)]/30 focus:border-[var(--accent-warm)]/30 transition"
                    >
                      {LANGS.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.name} ({o.code})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={confirmLanguage}
                      className="send-btn px-4 text-sm font-medium"
                    >
                      Save
                    </button>
                  </div>
                </section>

                {/* Voice preset */}
                <section>
                  <div className="text-sm font-medium mb-2 text-[var(--accent-lavender)]">🎙️ Voice preset</div>
                  <div className="space-y-2 max-h-48 overflow-auto pr-1">
                    {presets.length === 0 && (
                      <div className="text-white/50 text-sm">
                        {loadingPresets.current
                          ? "Loading presets…"
                          : "Open Settings again to load presets."}
                      </div>
                    )}
                    {presets.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => void applyPreset(p.key)}
                        className={`w-full text-left rounded-lg px-3 py-2.5 border transition ${
                          currentPreset === p.key
                            ? "bg-[var(--accent-soft-purple)] text-white border-[var(--accent-lavender)] shadow-lg"
                            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-[var(--accent-warm)]/30"
                        }`}
                      >
                        <div className="font-medium">{p.label}</div>
                        <div className="text-xs text-white/50">voice: {p.voice}</div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Memory */}
                <section>
                  <div className="text-sm font-medium mb-2 text-[var(--accent-lavender)]">🧠 Memory</div>
                  <button
                    onClick={resetConversation}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 hover:border-red-500/30 transition"
                  >
                    Clear conversation (keeps saved facts)
                  </button>
                  <div className="text-xs text-white/40 mt-2">
                    Saved facts/emotions remain in your DB; this only resets chat history.
                  </div>
                </section>

                {/* Call */}
                <section>
                  <div className="text-sm font-medium mb-2 text-[var(--accent-lavender)]">📞 Call Mode</div>
                  <Link
                    className="send-btn inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium"
                    href="/call"
                  >
                    <span>📞</span> Open Call
                  </Link>
                  <div className="text-xs text-white/40 mt-2">
                    Mic gain slider is available on the call screen.
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* All animations are now defined in globals.css under Starlight Lounge theme */