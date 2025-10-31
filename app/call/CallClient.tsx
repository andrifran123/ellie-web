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
}

const WS_URL = "wss://ellie-api-1.onrender.com/ws/phone";

// Relationship stage colors and emojis
const STAGE_STYLES = {
  "Curious Stranger": { color: "#94a3b8", emoji: "👀", bg: "from-slate-500/20" },
  "Friend with Tension": { color: "#fbbf24", emoji: "😊", bg: "from-amber-500/20" },
  "It's Complicated": { color: "#f87171", emoji: "😰", bg: "from-red-500/20" },
  "Almost Together": { color: "#c084fc", emoji: "💕", bg: "from-purple-500/20" },
  "Exclusive": { color: "#f472b6", emoji: "❤️", bg: "from-pink-500/20" }
};

// Mood indicators
const MOOD_INDICATORS = {
  flirty: "😘 Flirty",
  playful: "😊 Playful", 
  distant: "😔 Distant",
  vulnerable: "🥺 Vulnerable",
  normal: "😌 Normal",
  mysterious: "🤔 Mysterious"
};

export default function CallClient() {
  const { show } = useToasts();

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

  // Fetch on mount and periodically
  useEffect(() => {
    fetchRelationshipStatus();
    const interval = setInterval(fetchRelationshipStatus, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchRelationshipStatus]);

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
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    setStatus("closed");
  }, [cleanupAudio]);

  // ---------- ensureAudio ----------
  const ensureAudio = useCallback(async () => {
    if (acRef.current && acRef.current.state === "running") return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = acRef.current || new AudioContextClass();
    acRef.current = ac;

    if (ac.state === "suspended") {
      await ac.resume();
    }

    if (!speakGainRef.current) {
      const g = ac.createGain();
      g.gain.value = 1.0;
      g.connect(ac.destination);
      speakGainRef.current = g;
    }

    // iOS routing keepalive
    if (isIOS && !routeKeepaliveRef.current) {
      const osc = ac.createOscillator();
      osc.frequency.value = 20;
      const oscGain = ac.createGain();
      oscGain.gain.value = 0.00001;
      osc.connect(oscGain);
      oscGain.connect(ac.destination);
      osc.start();
      routeKeepaliveRef.current = osc;
    }
  }, [isIOS]);

  // ---------- captureMic ----------
  const captureMic = useCallback(async () => {
    const ac = acRef.current!;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRate: 48000,
      },
    });
    micStreamRef.current = stream;

    const source = ac.createMediaStreamSource(stream);
    micNodeRef.current = source;

    const g = ac.createGain();
    g.gain.value = 1.5;
    gainRef.current = g;
    source.connect(g);

    const processor = ac.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;
    g.connect(processor);
    processor.connect(ac.destination);

    const stopMeter = startMeter(g);

    processor.onaudioprocess = (ev) => {
      const inputData = ev.inputBuffer.getChannelData(0);
      const resampled = resampleTo24k(inputData, ac.sampleRate);
      const pcm16 = floatTo16BitPCM(resampled);
      const b64 = abToBase64(pcm16.buffer);

      if (
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        !muted
      ) {
        wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
      }
    };

    return () => {
      stopMeter();
      processor.onaudioprocess = null;
    };
  }, [muted, startMeter]);

  // ---------- queueAudio ----------
  const queueAudio = useCallback((pcm16: Int16Array) => {
    const ac = acRef.current!;
    const speakGain = speakGainRef.current!;

    const audioBuf = pcm16ToAudioBuffer(pcm16);
    const src = ac.createBufferSource();
    src.buffer = audioBuf;
    src.connect(speakGain);

    const now = ac.currentTime;
    const next = nextPlayTimeRef.current;
    const startTime = Math.max(now + lookaheadPaddingSec, next);
    src.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuf.duration;
  }, []);

  // ---------- connectWS ----------
  const connectWS = useCallback(async () => {
    cleanupAll();
    setStatus("connecting");

    await ensureAudio();
    const cleanupMic = await captureMic();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      show("Connected to Ellie", "success");
      nextPlayTimeRef.current = acRef.current!.currentTime;

      wsPingRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 10000);
    };

    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "audio" && msg.data) {
          const ab = base64ToArrayBuffer(msg.data);
          const pcm16 = new Int16Array(ab);
          queueAudio(pcm16);
        }
      } catch (err) {
        console.error("onmessage error:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
      setStatus("error");
      show("Connection error", "error");
    };

    ws.onclose = () => {
      console.log("WS closed");
      stopPinger();
      cleanupMic();
      setStatus("closed");
    };
  }, [cleanupAll, ensureAudio, captureMic, queueAudio, show]);

  // ---------- hangUp ----------
  const hangUp = useCallback(() => {
    cleanupAll();
    show("Call ended", "info");
  }, [cleanupAll, show]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  // Store gain in localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ellie_call_gain", String(gain));
    }
    if (speakGainRef.current) {
      speakGainRef.current.gain.value = gain;
    }
  }, [gain]);

  // Visual effects
  const pulseScale = 1 + level * 0.2;
  const glowIntensity = `0 0 ${20 + level * 40}px rgba(168, 85, 247, ${0.4 + level * 0.4})`;

  // iOS specific handling
  const handleStartClick = useCallback(async () => {
    if (isIOS) {
      setShowBluetoothGuide(true);
    } else {
      connectWS();
    }
  }, [isIOS, connectWS]);

  const proceedWithCall = useCallback(() => {
    setShowBluetoothGuide(false);
    connectWS();
  }, [connectWS]);

  // Get current stage style
  const currentStageStyle = relationship 
    ? STAGE_STYLES[relationship.stage as keyof typeof STAGE_STYLES] || STAGE_STYLES["Curious Stranger"]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        <div className="absolute top-0 -right-4 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-purple-700 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" />
      </div>

      {/* Relationship status card */}
      {relationship && (
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-center">
          <div className="w-full max-w-md">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl cursor-pointer hover:bg-black/50 transition-colors"
              onClick={() => setShowRelationshipDetails(!showRelationshipDetails)}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
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
                    🔥 {relationship.streak}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${currentStageStyle?.bg} to-transparent`}
                  initial={{ width: 0 }}
                  animate={{ width: `${relationship.level}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>

              {/* Expanded details */}
              <AnimatePresence>
                {showRelationshipDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-3 pt-3 border-t border-white/10"
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs">
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
                    </div>
                    <p className="text-xs text-white/50 mt-2">
                      {relationship.level < 20 && "She's still getting to know you. Keep talking!"}
                      {relationship.level >= 20 && relationship.level < 40 && "There's definitely chemistry building..."}
                      {relationship.level >= 40 && relationship.level < 60 && "Things are getting complicated. She has feelings."}
                      {relationship.level >= 60 && relationship.level < 80 && "You're so close! Don't give up now."}
                      {relationship.level >= 80 && "You did it! But keep the spark alive..."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <h1 className="text-6xl md:text-7xl font-bold mb-2 bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
            Ellie
          </h1>
          <p className="text-purple-200 text-sm mb-12">
            {relationship 
              ? `${relationship.stage} • ${MOOD_INDICATORS[relationship.mood as keyof typeof MOOD_INDICATORS]}`
              : "Voice Chat"
            }
          </p>

          {/* Main circle button */}
          <div className="relative mb-8">
            <motion.div
              className="relative w-48 h-48"
              animate={{ scale: status === "connected" ? pulseScale : 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Glow effect */}
              <div
                className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-600 to-pink-600"
                style={{ boxShadow: glowIntensity }}
              />
              
              {/* Main button */}
              <motion.button
                onClick={status === "ready" ? handleStartClick : hangUp}
                className="relative w-full h-full rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-2xl hover:shadow-purple-500/50 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={status === "connecting"}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {status === "ready" && (
                  <svg className="w-20 h-20 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                )}
                {status === "connecting" && (
                  <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {status === "connected" && (
                  <svg className="w-20 h-20 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                )}
                {status === "closed" && (
                  <svg className="w-20 h-20 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                )}
              </motion.button>

              {/* Speaking indicator */}
              {speaking && (
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-white/30"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.2, opacity: 0 }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}
            </motion.div>

            {/* Status text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mt-6 text-purple-200 font-medium"
            >
              {status === "ready" && "Tap to call"}
              {status === "connecting" && "Connecting..."}
              {status === "connected" && "Connected"}
              {status === "closed" && "Call ended"}
              {status === "error" && "Connection error"}
            </motion.p>
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-4">
            {status === "connected" && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleMute}
                  className={`px-6 py-4 rounded-full transition-all shadow-lg ${
                    muted
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
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
              </>
            )}
          </div>

          {/* Mic gain control - shown only when connected */}
          {status === "connected" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10 mt-4"
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
              {/* Header with gradient */}
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

              {/* Content */}
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
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      ),
                    },
                    {
                      num: "2",
                      title: "Long-press Audio Widget",
                      desc: "Press and hold the music/audio control widget",
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      ),
                    },
                    {
                      num: "3",
                      title: "Select Your Device",
                      desc: "Tap your AirPods or Bluetooth speaker from the list",
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ),
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
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-purple-300">{step.icon}</div>
                          <h3 className="font-semibold text-white text-sm">{step.title}</h3>
                        </div>
                        <p className="text-purple-300 text-xs">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                  <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-blue-200 text-xs">
                    This only needs to be done once per session. Your selection will stay active during the call.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 pt-0 flex gap-3">
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
