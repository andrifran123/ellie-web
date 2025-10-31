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

// Extend Window interface for webkit support
interface ExtendedWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
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

  function pcm16ToAudioBuffer(pcm16: Int16Array, sampleRate: number): AudioBuffer {
    const ac = acRef.current!;
    const buffer = ac.createBuffer(1, pcm16.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channel[i] = pcm16[i] / 32768;
    }
    return buffer;
  }

  function abToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Audio cleanup
  const cleanupAudio = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    processorRef.current?.disconnect();
    micNodeRef.current?.disconnect();
    gainRef.current?.disconnect();
    analyserRef.current?.disconnect();
    routeKeepaliveRef.current?.stop();
    routeKeepaliveRef.current?.disconnect();
  }, []);

  const cleanupAll = useCallback(() => {
    cleanupAudio();
    try { wsRef.current?.close(); } catch {}
    if (wsPingRef.current) {
      clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }
  }, [cleanupAudio]);

  // Ensure audio context
  const ensureAudio = useCallback(async () => {
    if (acRef.current?.state === "running") return;

    const extWindow = window as ExtendedWindow;
    const AudioContextClass = window.AudioContext || extWindow.webkitAudioContext;
    const ac = acRef.current || new AudioContextClass();
    acRef.current = ac;

    if (ac.state === "suspended") await ac.resume();

    if (!speakGainRef.current) {
      const g = ac.createGain();
      g.gain.value = 1.0;
      g.connect(ac.destination);
      speakGainRef.current = g;
    }

    // iOS routing keepalive
    if (isIOS && !routeKeepaliveRef.current) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      g.gain.value = 0.0001;
      osc.connect(g).connect(ac.destination);
      osc.frequency.value = 20000;
      osc.start();
      routeKeepaliveRef.current = osc;
    }
  }, [isIOS]);

  // Schedule playback
  const schedulePlayback = useCallback((audioBuffer: AudioBuffer) => {
    if (!acRef.current || !speakGainRef.current) return;
    const ac = acRef.current;
    const source = ac.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(speakGainRef.current);

    const now = ac.currentTime;
    const startTime = Math.max(now + lookaheadPaddingSec, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    setSpeaking(true);
    source.onended = () => {
      if (ac.currentTime >= nextPlayTimeRef.current - 0.1) {
        setSpeaking(false);
      }
    };
  }, []);

  // Start metering
  const startMeter = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const measure = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setLevel(avg / 255);
      requestAnimationFrame(measure);
    };
    measure();
  }, []);

  // Stop pinger
  const stopPinger = useCallback(() => {
    if (wsPingRef.current) {
      clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }
  }, []);

  // Start call
  const startCall = useCallback(async () => {
    try {
      cleanupAll();
      setStatus("connecting");
      nextPlayTimeRef.current = 0;

      // Audio setup
      await ensureAudio();
      const ac = acRef.current!;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 24000 }
        }
      });
      micStreamRef.current = stream;

      const micNode = ac.createMediaStreamSource(stream);
      const gainNode = ac.createGain();
      gainNode.gain.value = gain;
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      
      micNode.connect(gainNode).connect(analyser);
      micNodeRef.current = micNode;
      gainRef.current = gainNode;
      analyserRef.current = analyser;

      const processor = ac.createScriptProcessor(4096, 1, 1);
      gainNode.connect(processor);
      processor.connect(ac.destination);
      processorRef.current = processor;

      startMeter();

      // WebSocket
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          setStatus("error");
          show("Connection timed out. Please try again.");
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        setStatus("connected");
        show("Call connected! Start speaking...");
        
        // Refresh relationship status on connection
        fetchRelationshipStatus();
        
        ws.send(JSON.stringify({ type: "session.start" }));

        const contextSampleRate = ac.sampleRate;
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputCh = e.inputBuffer.getChannelData(0);
          const mono24k = contextSampleRate !== 24000
              ? resampleTo24k(inputCh, contextSampleRate)
              : new Float32Array(inputCh);

          const pcm16 = floatTo16BitPCM(mono24k);
          const b64 = abToBase64(pcm16.buffer);
          ws.send(JSON.stringify({ type: "audio.append", audio: b64 }));
        };

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
          } else if (obj?.type === "relationship-update") {
            // Update relationship status from server
            setRelationship(obj.relationship);
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
        
        // Refresh relationship status after call
        fetchRelationshipStatus();
      };
    } catch {
      setStatus("error");
      show("Failed to start call");
    }
  }, [cleanupAll, cleanupAudio, ensureAudio, schedulePlayback, show, startMeter, gain, stopPinger, fetchRelationshipStatus]);

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
  const glowIntensity = speaking ? "0 0 80px rgba(168,85,247,0.8)" : "0 0 40px rgba(168,85,247,0.3)";
  const stageStyle = relationship ? STAGE_STYLES[relationship.stage] || STAGE_STYLES["Curious Stranger"] : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-gray-950 via-purple-950 to-pink-950">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
      </div>

      {/* Relationship Status Bar */}
      {relationship && (
        <div className="absolute top-0 left-0 right-0 p-4 z-20">
          <div className="max-w-md mx-auto">
            <motion.div 
              className={`bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 cursor-pointer`}
              onClick={() => setShowRelationshipDetails(!showRelationshipDetails)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{stageStyle?.emoji}</span>
                  <div>
                    <h3 className="text-sm font-medium text-white/90">{relationship.stage}</h3>
                    <p className="text-xs text-white/60">Level {relationship.level}/100</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Streak indicator */}
                  <div className="text-center">
                    <div className="text-lg">🔥</div>
                    <p className="text-xs text-white/60">{relationship.streak}</p>
                  </div>
                  {/* Mood indicator */}
                  <div className="text-center">
                    <p className="text-xs text-white/90">{MOOD_INDICATORS[relationship.mood]}</p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <motion.div 
                  className="h-full rounded-full"
                  style={{ 
                    background: `linear-gradient(to right, ${stageStyle?.color}, ${stageStyle?.color}dd)`,
                    width: `${relationship.level}%`
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${relationship.level}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
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
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-2 bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
            Ellie
          </h1>
          <p className="text-white/60 text-sm mb-12">
            {relationship 
              ? `${relationship.stage} • ${MOOD_INDICATORS[relationship.mood]}`
              : "Voice Chat"
            }
          </p>

          {/* Main circle button */}
          <div className="relative mb-12">
            <motion.div
              className="relative w-48 h-48 mx-auto"
              animate={{ scale: status === "connected" ? pulseScale : 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Glow effect */}
              <div
                className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-600 to-pink-600"
                style={{ boxShadow: glowIntensity }}
              />
              
              {/* Main button */}
              <button
                onClick={status === "ready" ? handleStartClick : hangUp}
                className="relative w-full h-full rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center hover:from-purple-500 hover:to-pink-500 transition-colors"
                disabled={status === "connecting"}
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
              </button>

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
            <p className="mt-6 text-white/80">
              {status === "ready" && "Tap to call"}
              {status === "connecting" && "Connecting..."}
              {status === "connected" && "Connected"}
              {status === "closed" && "Call ended"}
              {status === "error" && "Connection error"}
            </p>
          </div>

          {/* Controls */}
          {status === "connected" && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-colors ${
                  muted ? "bg-red-600 hover:bg-red-700" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {muted ? (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15L4.172 13.586A2 2 0 013 11.172V9a6 6 0 0110.82-3.584L19 10.595M12 18v3m0 0l-2-1m2 1l2-1m-2-7v.01" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
              
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <span className="text-white/60 text-sm">Volume</span>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.1"
                  value={gain}
                  onChange={(e) => setGain(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* iOS Bluetooth Guide Modal */}
      <AnimatePresence>
        {showBluetoothGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowBluetoothGuide(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-purple-900/90 to-pink-900/90 rounded-2xl p-6 max-w-md w-full border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4">Before we start...</h2>
              
              <div className="space-y-3 mb-6">
                <p className="text-white/80">For the best experience:</p>
                <ol className="space-y-2 text-white/70">
                  <li>1. Make sure you&apos;re using speakers or wired headphones</li>
                  <li>2. Bluetooth audio may have delays</li>
                  <li>3. Keep your phone close when speaking</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowBluetoothGuide(false)}
                  className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={proceedWithCall}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-white font-medium transition-colors"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
