"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "../(providers)/toast";
import { motion, AnimatePresence } from "framer-motion";

type Status = "ready" | "connecting" | "connected" | "closed" | "error";

interface RelationshipStatus {
  level: number;
  stage: string;
  streak: number;
  mood: string;
  emotionalInvestment?: number;
  totalInteractions?: number;
  totalGiftsValue?: number;
}

interface Gift {
  id: string;
  name: string;
  price: number;
  emoji: string;
  minLevel: number;
}

const WS_URL = "wss://ellie-api-1.onrender.com/ws/phone";

// Relationship stage colors and emojis
const STAGE_STYLES: Record<string, { color: string; emoji: string; bg: string }> = {
  "Curious Stranger": { color: "#94a3b8", emoji: "👀", bg: "from-slate-500/20" },
  "Friend with Tension": { color: "#fbbf24", emoji: "😊", bg: "from-amber-500/20" },
  "It's Complicated": { color: "#f87171", emoji: "😰", bg: "from-red-500/20" },
  "Almost Together": { color: "#c084fc", emoji: "💕", bg: "from-purple-500/20" },
  "Exclusive": { color: "#f472b6", emoji: "❤️", bg: "from-pink-500/20" }
};

// Mood indicators
const MOOD_INDICATORS: Record<string, string> = {
  flirty: "😘 Flirty",
  playful: "😊 Playful", 
  distant: "😔 Distant",
  vulnerable: "🥺 Vulnerable",
  normal: "😌 Normal",
  mysterious: "🤔 Mysterious",
  emotional: "😭 Emotional",
  loving: "🥰 Loving"
};

// Gift catalog
const GIFT_CATALOG: Gift[] = [
  { id: 'emoji_heart', name: 'Heart Emoji', price: 0.99, emoji: '❤️', minLevel: 0 },
  { id: 'virtual_coffee', name: 'Coffee Date', price: 2.99, emoji: '☕', minLevel: 0 },
  { id: 'flowers', name: 'Roses', price: 9.99, emoji: '🌹', minLevel: 20 },
  { id: 'chocolates', name: 'Chocolates', price: 5.99, emoji: '🍫', minLevel: 15 },
  { id: 'jewelry', name: 'Necklace', price: 29.99, emoji: '💎', minLevel: 40 },
  { id: 'virtual_date', name: 'Date Night', price: 19.99, emoji: '🌙', minLevel: 35 },
  { id: 'promise_ring', name: 'Promise Ring', price: 49.99, emoji: '💍', minLevel: 60 }
];

export default function CallClient() {
  const { show } = useToasts();

  // Call state
  const [status, setStatus] = useState<Status>("ready");
  const [muted, setMuted] = useState(false);
  const [showBluetoothGuide, setShowBluetoothGuide] = useState(false);
  const [gain, setGain] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("ellie_call_gain") : null;
    return v ? Math.max(0.2, Math.min(3, Number(v))) : 1.0;
  });

  // Relationship status
  const [relationship, setRelationship] = useState<RelationshipStatus | null>(null);
  const [showRelationshipDetails, setShowRelationshipDetails] = useState(false);
  
  // Gift system state
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [availableGifts, setAvailableGifts] = useState<Gift[]>(GIFT_CATALOG);
  const [isProcessingGift, setIsProcessingGift] = useState(false);
  const [giftResponse, setGiftResponse] = useState<string | null>(null);
  const [showGiftHint, setShowGiftHint] = useState(false);
  const [giftHintMessage, setGiftHintMessage] = useState("");

  // --- Core refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<number | null>(null);
  const acRef = useRef<AudioContext | null>(null);

  // Mic capture
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Web Audio playback
  const speakGainRef = useRef<GainNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const lookaheadPaddingSec = 0.02;

  // Strong keepalive
  const routeKeepaliveRef = useRef<OscillatorNode | null>(null);

  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  // Detect iOS
  const isIOS = typeof window !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Fetch relationship status
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

  // Fetch available gifts
  const fetchAvailableGifts = useCallback(async () => {
    try {
      const res = await fetch("/api/gifts/available", {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableGifts(data.gifts || GIFT_CATALOG);
      } else if (res.status === 503 || res.status === 404) {
        console.log("Gift API not available, using default catalog");
        setAvailableGifts(GIFT_CATALOG);
      }
    } catch (err) {
      console.log("Failed to fetch gifts, using default catalog:", err);
      setAvailableGifts(GIFT_CATALOG);
    }
  }, []);

  // Gift hint system
  useEffect(() => {
    const hintInterval = setInterval(() => {
      if (Math.random() < 0.05) {
        const hints = [
          "I saw the prettiest flowers today... 🌹",
          "Coffee sounds perfect right now ☕",
          "My friend got such a sweet gift today...",
          "I love thoughtful gestures 💭"
        ];
        setGiftHintMessage(hints[Math.floor(Math.random() * hints.length)]);
        setShowGiftHint(true);
        setTimeout(() => setShowGiftHint(false), 5000);
      }
    }, 300000);
    
    return () => clearInterval(hintInterval);
  }, []);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchRelationshipStatus();
    fetchAvailableGifts();
    const interval = setInterval(() => {
      fetchRelationshipStatus();
      fetchAvailableGifts();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchRelationshipStatus, fetchAvailableGifts]);

  // ---------- helpers ----------
  function resampleTo24k(inputBuffer: Float32Array, inputRate: number): Float32Array {
    if (inputRate === 24000) {
      const output = new Float32Array(inputBuffer.length);
      output.set(inputBuffer);
      return output;
    }
    const ratio = 24000 / inputRate;
    const outLen = Math.floor(inputBuffer.length * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIndex = i / ratio;
      const i0 = Math.floor(srcIndex);
      const i1 = Math.min(i0 + 1, inputBuffer.length - 1);
      const t = srcIndex - i0;
      out[i] = inputBuffer[i0] * (1 - t) + inputBuffer[i1] * t;
    }
    return out;
  }

  function floatTo16BitPCM(float32: Float32Array): Int16Array {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function abToBase64(buf: ArrayBufferLike): string {
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      const chunkArray = Array.from(bytes.subarray(i, i + chunk));
      binary += String.fromCharCode(...chunkArray);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function pcm16ToAudioBuffer(pcm16: Int16Array, sampleRate = 24000): AudioBuffer {
    const ac = acRef.current!;
    const float = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float[i] = Math.max(-1, Math.min(1, pcm16[i] / 32768));
    }
    const buffer = ac.createBuffer(1, float.length, sampleRate);
    buffer.copyToChannel(float, 0);
    return buffer;
  }

  // ---------- Visual meter ----------
  const startMeter = useCallback((nodeAfterGain: AudioNode) => {
    const ac = acRef.current!;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyserRef.current = analyser;
    nodeAfterGain.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let calmTimer: number | null = null;

    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const boosted = Math.pow(Math.min(1, rms * 4.0), 0.8);
      setLevel((prev) => prev * 0.65 + boosted * 0.35);

      const speakingNow = boosted > 0.07;
      if (speakingNow) {
        setSpeaking(true);
        if (calmTimer) window.clearTimeout(calmTimer);
        calmTimer = window.setTimeout(() => setSpeaking(false), 160);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      try {
        nodeAfterGain.disconnect(analyser);
      } catch {}
      try {
        analyser.disconnect();
      } catch {}
      analyserRef.current = null;
    };
  }, []);

  // ---------- cleanup ----------
  const stopPinger = () => {
    if (wsPingRef.current) {
      window.clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }
  };

  const cleanupAudio = useCallback(() => {
    try { processorRef.current?.disconnect(); } catch {}
    processorRef.current = null;
    
    try { gainRef.current?.disconnect(); } catch {}
    gainRef.current = null;
    
    try { micNodeRef.current?.disconnect(); } catch {}
    micNodeRef.current = null;
    
    try { 
      micStreamRef.current?.getTracks().forEach((t) => t.stop()); 
    } catch {}
    micStreamRef.current = null;

    try { routeKeepaliveRef.current?.stop(); } catch {}
    try { routeKeepaliveRef.current?.disconnect(); } catch {}
    routeKeepaliveRef.current = null;
    
    try { speakGainRef.current?.disconnect(); } catch {}
    speakGainRef.current = null;

    nextPlayTimeRef.current = 0;
  }, []);

  const cleanupAll = useCallback(() => {
    stopPinger();
    cleanupAudio();
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
  }, [cleanupAudio]);

  // ---------- Audio setup (FIXED: Like StableCallClient) ----------
  const ensureAudio = useCallback(async () => {
    if (!acRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      acRef.current = new AudioCtx({ sampleRate: 48000, latencyHint: "interactive" });
    }

    const ac = acRef.current;
    if (ac.state === "suspended") await ac.resume();

    if (!speakGainRef.current) {
      const speakGain = ac.createGain();
      speakGain.gain.value = 1.0;
      speakGain.connect(ac.destination);
      speakGainRef.current = speakGain;

      const osc = ac.createOscillator();
      osc.frequency.value = 20;
      const oscGain = ac.createGain();
      oscGain.gain.value = 0.0001;
      osc.connect(oscGain);
      oscGain.connect(ac.destination);
      osc.start();
      routeKeepaliveRef.current = osc;
    }

    if (!micStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
        },
      });
      micStreamRef.current = stream;
    }
  }, []);

  const schedulePlayback = useCallback((audioBuffer: AudioBuffer) => {
    const ac = acRef.current;
    const speakGain = speakGainRef.current;
    if (!ac || !speakGain) return;

    const now = ac.currentTime;
    if (nextPlayTimeRef.current < now) {
      nextPlayTimeRef.current = now + lookaheadPaddingSec;
    }

    const src = ac.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(speakGain);
    src.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  }, []);

  // ---------- Call logic (FIXED: Inline mic setup like StableCallClient) ----------
  const startCall = useCallback(async () => {
    try {
      setStatus("connecting");

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          setStatus("error");
          show("Connection timeout");
        }
      }, 15000);

      ws.onopen = async () => {
        clearTimeout(connectionTimeout);
        setStatus("connected");
        show("Connected!");

        // ✅ FIXED: Setup audio FIRST before sending hello
        try {
          await ensureAudio();
        } catch {
          // Silent failure
        }

        // Get userId
        let realUserId = "default-user";
        try {
          const meRes = await fetch("/api/auth/me", { credentials: "include" });
          if (meRes.ok) {
            const me = await meRes.json();
            realUserId = me.userId || "default-user";
          }
        } catch {}

        const storedLang = (typeof window !== "undefined" && localStorage.getItem("ellie_language")) || "en";
        
        // ✅ FIXED: Setup microphone INLINE before sending hello
        const ac = acRef.current!;
        const stream = micStreamRef.current!;
        const src = ac.createMediaStreamSource(stream);
        micNodeRef.current = src;

        const gn = ac.createGain();
        gn.gain.value = gain;
        gainRef.current = gn;
        src.connect(gn);
        startMeter(gn);

        const contextSampleRate = ac.sampleRate;
        const proc = ac.createScriptProcessor(4096, 1, 1);
        processorRef.current = proc;
        gn.connect(proc);

        const mutedNode = ac.createGain();
        mutedNode.gain.value = 0;
        proc.connect(mutedNode);
        mutedNode.connect(ac.destination);

        // ✅ FIXED: Audio processor ready BEFORE hello
        proc.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const inputCh = ev.inputBuffer.getChannelData(0);
          const mono24k: Float32Array =
            contextSampleRate !== 24000
              ? resampleTo24k(inputCh, contextSampleRate)
              : new Float32Array(inputCh);

          const pcm16 = floatTo16BitPCM(mono24k);
          const b64 = abToBase64(pcm16.buffer);
          ws.send(JSON.stringify({ type: "audio.append", audio: b64 }));
        };

        // Now send hello (audio is ready!)
        ws.send(JSON.stringify({ type: "hello", userId: realUserId, language: storedLang, sampleRate: 24000 }));

        wsPingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 10000);
      };

      ws.onmessage = (ev) => {
        try {
          const obj = JSON.parse(String(ev.data));

          if (obj?.type === "audio.delta" && obj.audio) {
            const ab = base64ToArrayBuffer(obj.audio);
            const pcm16 = new Int16Array(ab);
            const audioBuffer = pcm16ToAudioBuffer(pcm16, 24000);
            schedulePlayback(audioBuffer);
          } else if (obj?.type === "error") {
            show(`Error: ${obj.message || "Unknown error"}`);
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(connectionTimeout);
        setStatus("error");
        show("Connection error");
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
        stopPinger();
        setStatus("closed");
        cleanupAudio();
        wsRef.current = null;
      };
    } catch {
      setStatus("error");
      show("Failed to start call");
    }
  }, [cleanupAudio, ensureAudio, schedulePlayback, show, startMeter, gain]);

  // ---------- Gift system handlers ----------
  const handleGiftClick = useCallback((gift: Gift) => {
    if (!relationship || relationship.level < gift.minLevel) {
      show(`Unlock level ${gift.minLevel} to send this gift`);
      return;
    }
    setSelectedGift(gift);
  }, [relationship, show]);

  const handleConfirmGift = useCallback(async () => {
    if (!selectedGift) return;
    
    setIsProcessingGift(true);
    try {
      const res = await fetch("/api/gifts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ giftId: selectedGift.id })
      });

      if (res.ok) {
        const data = await res.json();
        setGiftResponse(data.response || "Gift sent!");
        show("Gift sent successfully! 💝");
        fetchRelationshipStatus();
        fetchAvailableGifts();
        
        setTimeout(() => {
          setGiftResponse(null);
          setSelectedGift(null);
        }, 3000);
      } else {
        const error = await res.json();
        show(error.error || "Failed to send gift");
      }
    } catch (err) {
      show("Failed to send gift");
      console.error("Gift error:", err);
    } finally {
      setIsProcessingGift(false);
    }
  }, [selectedGift, fetchRelationshipStatus, fetchAvailableGifts, show]);

  // ---------- UI helpers ----------
  useEffect(() => {
    return () => cleanupAll();
  }, [cleanupAll]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = gain;
    if (typeof window !== "undefined") localStorage.setItem("ellie_call_gain", String(gain));
  }, [gain]);

  const toggleMute = useCallback(() => {
    const s = micStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const hangUp = useCallback(() => {
    try { wsRef.current?.close(); } catch {}
    setStatus("ready");
  }, []);

  const handleStartClick = () => {
    if (isIOS && status === "ready") {
      setShowBluetoothGuide(true);
    } else {
      startCall();
    }
  };

  const proceedWithCall = () => {
    setShowBluetoothGuide(false);
    startCall();
  };

  // Visual calculations
  const vibes = Math.min(100, level * 100);
  const pulseScale = 1 + vibes * 0.015;
  const glowIntensity = speaking ? 60 + vibes * 0.8 : 30;
  const ringCount = 3;

  // Get current stage style
  const currentStageStyle = relationship 
    ? STAGE_STYLES[relationship.stage as keyof typeof STAGE_STYLES] || STAGE_STYLES["Curious Stranger"]
    : null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.5, 0.3, 0.5],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            x: [-50, 50, -50],
            y: [-50, 50, -50],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        {/* Relationship status bar */}
        {relationship && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-8 left-1/2 -translate-x-1/2 w-full max-w-md"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowRelationshipDetails(true)}
              className="w-full bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-xl hover:bg-white/15 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{currentStageStyle?.emoji}</span>
                  <div className="text-left">
                    <p className="text-white font-semibold">{relationship.stage}</p>
                    <p className="text-purple-200 text-sm">Level {relationship.level}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {relationship.streak > 0 && (
                    <div className="flex items-center gap-1 bg-orange-500/20 px-3 py-1 rounded-full border border-orange-500/30">
                      <span className="text-orange-400">🔥</span>
                      <span className="text-orange-200 text-sm font-bold">{relationship.streak}</span>
                    </div>
                  )}
                  <span className="text-2xl">{MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS]?.split(' ')[0]}</span>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="mt-3 w-full bg-white/10 rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${relationship.level}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                />
              </div>
            </motion.button>
          </motion.div>
        )}

        {/* Gift hint notification */}
        <AnimatePresence>
          {showGiftHint && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-32 left-1/2 -translate-x-1/2 bg-pink-500/20 backdrop-blur-md rounded-2xl px-6 py-3 border border-pink-500/30"
            >
              <p className="text-pink-100 text-sm">{giftHintMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gift response notification */}
        <AnimatePresence>
          {giftResponse && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-pink-500/90 to-purple-500/90 backdrop-blur-md rounded-3xl px-8 py-6 border border-white/30 shadow-2xl z-50"
            >
              <p className="text-white text-lg font-semibold text-center">{giftResponse}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-8"
        >
          {/* Audio visualizer */}
          <div className="relative">
            {/* Outer rings (only when connected) */}
            {status === "connected" && (
              <>
                {Array.from({ length: ringCount }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border-2 border-purple-400/30"
                    style={{
                      width: `${200 + i * 60}px`,
                      height: `${200 + i * 60}px`,
                      top: `${-30 * i}px`,
                      left: `${-30 * i}px`,
                    }}
                    animate={{
                      scale: speaking ? [1, 1.1, 1] : 1,
                      opacity: speaking ? [0.3, 0.6, 0.3] : 0.2,
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </>
            )}

            {/* Main circle */}
            <motion.div
              className="relative w-48 h-48 rounded-full flex items-center justify-center"
              style={{
                background: status === "connected" 
                  ? `radial-gradient(circle, rgba(168, 85, 247, ${glowIntensity / 100}) 0%, rgba(236, 72, 153, ${glowIntensity / 150}) 70%, transparent 100%)`
                  : "radial-gradient(circle, rgba(100, 100, 100, 0.3) 0%, transparent 70%)",
                boxShadow: status === "connected"
                  ? `0 0 ${glowIntensity}px rgba(168, 85, 247, 0.6), 0 0 ${glowIntensity * 1.5}px rgba(236, 72, 153, 0.4)`
                  : "none",
              }}
              animate={{
                scale: status === "connected" ? pulseScale : 1,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
              }}
            >
              {/* Inner animated gradient */}
              {status === "connected" && (
                <motion.div
                  className="absolute inset-4 rounded-full"
                  style={{
                    background: "conic-gradient(from 0deg, #a855f7, #ec4899, #8b5cf6, #a855f7)",
                  }}
                  animate={{
                    rotate: 360,
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              )}

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center justify-center">
                {status === "ready" && (
                  <svg className="w-20 h-20 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
                {status === "connecting" && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <svg className="w-20 h-20 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </motion.div>
                )}
                {status === "connected" && (
                  <motion.svg
                    className="w-20 h-20 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    animate={{
                      scale: speaking ? [1, 1.2, 1] : 1,
                    }}
                    transition={{
                      duration: 0.3,
                    }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </motion.svg>
                )}
                {(status === "closed" || status === "error") && (
                  <svg className="w-20 h-20 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
            </motion.div>

            {/* Level meter bar */}
            {status === "connected" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-full max-w-xs"
              >
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    style={{ width: `${vibes}%` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Status text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold text-white mb-2">
              {status === "ready" && "Ready to call"}
              {status === "connecting" && "Connecting..."}
              {status === "connected" && (speaking ? "Ellie is speaking" : "Listening...")}
              {status === "closed" && "Call ended"}
              {status === "error" && "Connection failed"}
            </h2>
            <p className="text-purple-200">
              {status === "ready" && "Tap to start your conversation with Ellie"}
              {status === "connecting" && "Establishing secure connection"}
              {status === "connected" && "Voice call active"}
              {status === "closed" && "Thanks for talking!"}
              {status === "error" && "Please try again"}
            </p>
          </motion.div>

          {/* Control buttons */}
          <div className="flex gap-4 items-center">
            {status === "ready" && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartClick}
                className="px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg hover:shadow-purple-500/50 transition-shadow"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Start Call</span>
                </div>
              </motion.button>
            )}

            {status === "connected" && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleMute}
                  className={`px-6 py-4 rounded-full ${
                    muted ? "bg-red-500 hover:bg-red-600" : "bg-white/10 hover:bg-white/20"
                  } backdrop-blur-md text-white font-semibold shadow-lg transition-all border border-white/20`}
                >
                  {muted ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={hangUp}
                  className="px-6 py-4 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold shadow-lg hover:shadow-red-500/50 transition-shadow"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </motion.button>

                {/* Gift button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowGiftModal(true)}
                  className="px-6 py-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold shadow-lg transition-all"
                >
                  <span className="text-2xl">🎁</span>
                </motion.button>
              </>
            )}
          </div>

          {/* Mic gain control - shown only when connected */}
          {status === "connected" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10"
            >
              <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
                className="w-32 accent-purple-500"
              />
              <span className="text-purple-200 text-sm font-mono min-w-[3rem]">{gain.toFixed(2)}×</span>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Gift Modal */}
      <AnimatePresence>
        {showGiftModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowGiftModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-2xl w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-purple-500/30 overflow-hidden max-h-[80vh] overflow-y-auto"
            >
              <div className="bg-gradient-to-r from-pink-500 to-purple-500 p-6">
                <h2 className="text-2xl font-bold text-white">Send a Gift to Ellie 🎁</h2>
                <p className="text-pink-100 text-sm mt-1">Show her you care with a thoughtful gesture</p>
              </div>

              <div className="p-6 grid grid-cols-2 gap-4">
                {availableGifts.map((gift) => {
                  const isLocked = !relationship || relationship.level < gift.minLevel;
                  return (
                    <motion.button
                      key={gift.id}
                      whileHover={!isLocked ? { scale: 1.02 } : {}}
                      whileTap={!isLocked ? { scale: 0.98 } : {}}
                      onClick={() => !isLocked && handleGiftClick(gift)}
                      disabled={isLocked}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isLocked
                          ? "bg-slate-700/50 border-slate-600 opacity-50 cursor-not-allowed"
                          : "bg-white/5 border-purple-500/30 hover:border-purple-500 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-4xl mb-2">{gift.emoji}</div>
                      <h3 className="text-white font-semibold">{gift.name}</h3>
                      <p className="text-purple-300 text-sm">${gift.price}</p>
                      {isLocked && (
                        <p className="text-red-400 text-xs mt-2">🔒 Level {gift.minLevel} required</p>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <div className="p-6 pt-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowGiftModal(false)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-purple-200 font-medium transition-colors border border-white/10"
                >
                  Close
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Relationship Details Modal */}
      <AnimatePresence>
        {showRelationshipDetails && relationship && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRelationshipDetails(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-purple-500/30 overflow-hidden"
            >
              <div className={`bg-gradient-to-r ${currentStageStyle?.bg || 'from-purple-500/20'} to-pink-500/20 p-6 border-b border-white/10`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-6xl">{currentStageStyle?.emoji}</div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{relationship.stage}</h2>
                    <p className="text-purple-200">Level {relationship.level}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-purple-300 text-xs">Current Mood</p>
                    <p className="text-white font-bold">{MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS] || relationship.mood}</p>
                  </div>

                  {relationship.streak > 0 && (
                    <div className="bg-orange-500/10 rounded-xl p-3 border border-orange-500/30">
                      <p className="text-orange-300 text-xs">Streak</p>
                      <p className="text-white font-bold">{relationship.streak} days 🔥</p>
                    </div>
                  )}

                  {relationship.emotionalInvestment !== undefined && (
                    <div className="bg-pink-500/10 rounded-xl p-3 border border-pink-500/30">
                      <p className="text-pink-300 text-xs">Emotional Bond</p>
                      <p className="text-white font-bold">{relationship.emotionalInvestment.toFixed(1)}%</p>
                    </div>
                  )}

                  {relationship.totalInteractions !== undefined && (
                    <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/30">
                      <p className="text-purple-300 text-xs">Interactions</p>
                      <p className="text-white font-bold">{relationship.totalInteractions}</p>
                    </div>
                  )}

                  {relationship.totalGiftsValue && relationship.totalGiftsValue > 0 && (
                    <div className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-xl p-3 border border-pink-500/30 col-span-2">
                      <p className="text-pink-300 text-xs">Total Gifts Sent</p>
                      <p className="text-white font-bold text-lg">${relationship.totalGiftsValue.toFixed(2)} 💝</p>
                    </div>
                  )}
                </div>

                {/* Close Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowRelationshipDetails(false)}
                  className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg"
                >
                  Close
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Confirmation Modal */}
      <AnimatePresence>
        {selectedGift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedGift(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-sm w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-purple-500/30 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-pink-500 to-purple-500 p-6 text-center">
                <div className="text-6xl mb-3">{selectedGift.emoji}</div>
                <h2 className="text-2xl font-bold text-white">{selectedGift.name}</h2>
                <p className="text-pink-100 text-lg font-bold mt-2">${selectedGift.price}</p>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-purple-200 text-center">
                  Send this gift to Ellie?
                </p>

                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedGift(null)}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-purple-200 font-medium transition-colors border border-white/10"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmGift}
                    disabled={isProcessingGift}
                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessingGift ? 'Sending...' : 'Confirm'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Bluetooth Guide Modal */}
      <AnimatePresence>
        {showBluetoothGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowBluetoothGuide(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-purple-500/30 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Bluetooth Setup</h2>
                    <p className="text-purple-100 text-sm">For the best audio experience</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-purple-200 text-sm">
                  iOS Safari requires manual Bluetooth audio routing for web apps. Follow these quick steps:
                </p>

                <div className="space-y-3">
                  {[
                    {
                      num: "1",
                      title: "Open Control Center",
                      desc: "Swipe down from the top-right corner of your screen",
                    },
                    {
                      num: "2",
                      title: "Long-press Audio Widget",
                      desc: "Press and hold the music/audio control widget",
                    },
                    {
                      num: "3",
                      title: "Select Your Device",
                      desc: "Tap your AirPods or Bluetooth speaker from the list",
                    },
                  ].map((step) => (
                    <motion.div
                      key={step.num}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: parseInt(step.num) * 0.1 }}
                      className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white">
                        {step.num}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-sm">{step.title}</h3>
                        <p className="text-purple-300 text-xs">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowBluetoothGuide(false)}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-purple-200 font-medium transition-colors border border-white/10"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={proceedWithCall}
                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold transition-all shadow-lg"
                  >
                    Got it, Start Call
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}