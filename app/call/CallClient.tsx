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
  cooldownHours?: number;
}

const WS_URL = "wss://ellie-api-1.onrender.com/ws/phone";
const DEFAULT_VOICE = "alloy";

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
  { id: 'flowers', name: 'Roses', price: 9.99, emoji: '🌹', minLevel: 20, cooldownHours: 72 },
  { id: 'chocolates', name: 'Chocolates', price: 5.99, emoji: '🍫', minLevel: 15, cooldownHours: 48 },
  { id: 'jewelry', name: 'Necklace', price: 29.99, emoji: '💎', minLevel: 40, cooldownHours: 168 },
  { id: 'virtual_date', name: 'Date Night', price: 19.99, emoji: '🌙', minLevel: 35, cooldownHours: 96 },
  { id: 'promise_ring', name: 'Promise Ring', price: 49.99, emoji: '💍', minLevel: 60, cooldownHours: 720 }
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

  // Audio refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<number | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakGainRef = useRef<GainNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const lookaheadPaddingSec = 0.02;
  const routeKeepaliveRef = useRef<OscillatorNode | null>(null);

  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

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
        // API not implemented yet, use default catalog
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
      if (Math.random() < 0.05) { // 5% chance every interval
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
    }, 300000); // Every 5 minutes
    
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

  // Audio processing helpers
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

  const startMeter = useCallback((nodeAfterGain: AudioNode) => {
    if (!acRef.current) {
      console.error("AudioContext is null in startMeter");
      return () => {}; // Return empty cleanup function
    }
    
    const ac = acRef.current;
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
      setLevel(boosted);
      if (boosted > 0.05) {
        setSpeaking(true);
        if (calmTimer) {
          clearTimeout(calmTimer);
          calmTimer = null;
        }
      } else if (!calmTimer) {
        calmTimer = window.setTimeout(() => {
          setSpeaking(false);
          calmTimer = null;
        }, 300);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      if (calmTimer) clearTimeout(calmTimer);
    };
  }, []);

  const stopMeter = useCallback(() => {
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
  }, []);

  const setupMicrophone = useCallback(async () => {
    console.log("setupMicrophone called, checking AudioContext...");
    if (!acRef.current) {
      console.error("AudioContext is null in setupMicrophone");
      throw new Error("AudioContext not initialized");
    }
    
    console.log("AudioContext exists, state:", acRef.current.state);
    const ac = acRef.current;
    
    console.log("Requesting microphone access...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Microphone access granted");
    micStreamRef.current = stream;

    const source = ac.createMediaStreamSource(stream);
    micNodeRef.current = source;

    const gainNode = ac.createGain();
    gainNode.gain.value = gain;
    gainRef.current = gainNode;
    source.connect(gainNode);

    const processor = ac.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        const resampled = resampleTo24k(inputData, ac.sampleRate);
        const pcm16 = floatTo16BitPCM(resampled);
        const base64 = abToBase64(pcm16.buffer);
        wsRef.current.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64,
        }));
      }
    };

    gainNode.connect(processor);
    processor.connect(ac.destination);

    console.log("Starting audio level meter...");
    const cleanup = startMeter(gainNode);
    console.log("Microphone setup complete");
    return () => {
      cleanup();
      processor.disconnect();
      gainNode.disconnect();
      source.disconnect();
    };
  }, [gain, startMeter]);

  const startCall = useCallback(() => {
    if (isIOS) {
      setShowBluetoothGuide(true);
    } else {
      // Call will be handled by proceedWithCall button
      setShowBluetoothGuide(false);
      proceedWithCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIOS]);

  const proceedWithCall = useCallback(async () => {
    setShowBluetoothGuide(false);
    setStatus("connecting");

    try {
      console.log("Creating AudioContext...");
      const AudioContextClass = (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ac = new AudioContextClass({ sampleRate: 24000 });
      console.log("AudioContext created, state:", ac.state);
      acRef.current = ac;

      if (ac.state === "suspended") {
        console.log("Resuming AudioContext...");
        await ac.resume();
        console.log("AudioContext state after resume:", ac.state);
      }

      const osc = ac.createOscillator();
      osc.frequency.value = 0;
      const silentGain = ac.createGain();
      silentGain.gain.value = 0;
      osc.connect(silentGain);
      silentGain.connect(ac.destination);
      osc.start();
      routeKeepaliveRef.current = osc;

      const speakGain = ac.createGain();
      speakGain.gain.value = 1;
      speakGain.connect(ac.destination);
      speakGainRef.current = speakGain;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      
      console.log("WebSocket created, URL:", WS_URL);
      console.log("WebSocket readyState:", ws.readyState, "(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)");

      ws.onopen = () => {
        setStatus("connected");
        show("Connected to Ellie");
        console.log("WebSocket opened, sending session configuration...");

        const sessionUpdate = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            voice: DEFAULT_VOICE,
            instructions: `You are Ellie. ${Date.now()}`,
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: { model: "whisper-1" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.7,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        };
        
        console.log("Sending session.update:", JSON.stringify(sessionUpdate, null, 2));
        ws.send(JSON.stringify(sessionUpdate));

        console.log("Sending response.create...");
        ws.send(JSON.stringify({
          type: "response.create",
          response: { modalities: ["text", "audio"] },
        }));

        wsPingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 10000);

        // Wait a bit for the WebSocket to be fully ready
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log("Setting up microphone, AudioContext state:", acRef.current?.state);
            setupMicrophone().catch((err) => {
              console.error("Mic setup failed:", err);
              console.error("AudioContext at failure:", acRef.current?.state);
              show("Microphone access failed");
              hangUp();
            });
          } else {
            console.error("WebSocket closed before microphone setup, state:", ws.readyState);
            show("Connection lost before audio setup");
          }
        }, 100);
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        console.log("Received WebSocket message:", msg.type, msg);

        switch (msg.type) {
          case "response.audio.delta":
            if (msg.delta) {
              const pcm16 = new Int16Array(base64ToArrayBuffer(msg.delta));
              const audioBuffer = pcm16ToAudioBuffer(pcm16);
              
              const source = ac.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(speakGainRef.current!);

              const startTime = Math.max(ac.currentTime, nextPlayTimeRef.current);
              source.start(startTime);
              nextPlayTimeRef.current = startTime + audioBuffer.duration - lookaheadPaddingSec;
            }
            break;

          case "error":
            console.error("WS error:", msg.error);
            show(`Error: ${msg.error?.message || "Unknown"}`);
            break;
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error event:", err);
        console.error("WebSocket readyState:", ws.readyState);
        console.error("WebSocket URL:", ws.url);
        setStatus("error");
        show("Connection error - check console");
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed. Code:", event.code, "Reason:", event.reason || "No reason provided", "Clean:", event.wasClean);
        
        // Common close codes
        const closeReasons: Record<number, string> = {
          1000: "Normal closure",
          1001: "Going away",
          1002: "Protocol error",
          1003: "Unsupported data",
          1005: "No status code (abnormal closure)",
          1006: "Abnormal closure (no close frame)",
          1007: "Invalid frame payload",
          1008: "Policy violation",
          1009: "Message too big",
          1010: "Missing extension",
          1011: "Internal server error",
          1015: "TLS handshake failure"
        };
        
        const reason = closeReasons[event.code] || "Unknown reason";
        console.log("Close reason:", reason);
        
        if (event.code !== 1000) {
          show(`Call ended: ${reason}`);
        }
        
        setStatus("closed");
        if (wsPingRef.current) {
          clearInterval(wsPingRef.current);
          wsPingRef.current = null;
        }
        
        // Don't auto hangUp here to avoid race condition
        // User will need to manually hang up or restart
      };
    } catch (error) {
      console.error("Failed to start call:", error);
      setStatus("error");
      show("Failed to start call");
    }
  // hangUp is intentionally excluded to avoid circular dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, setupMicrophone]);

  const hangUp = useCallback(() => {
    stopMeter();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (wsPingRef.current) {
      clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }

    if (micNodeRef.current) {
      micNodeRef.current.disconnect();
      micNodeRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (speakGainRef.current) {
      speakGainRef.current.disconnect();
      speakGainRef.current = null;
    }

    if (routeKeepaliveRef.current) {
      routeKeepaliveRef.current.stop();
      routeKeepaliveRef.current = null;
    }

    if (acRef.current) {
      acRef.current.close();
      acRef.current = null;
    }

    setStatus("ready");
    setSpeaking(false);
    setLevel(0);
    nextPlayTimeRef.current = 0;
  }, [stopMeter]);

  const toggleMute = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (gainRef.current) {
      gainRef.current.gain.value = newMuted ? 0 : gain;
    }
  }, [muted, gain]);

  useEffect(() => {
    if (gainRef.current && !muted) {
      gainRef.current.gain.value = gain;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("ellie_call_gain", String(gain));
    }
  }, [gain, muted]);

  useEffect(() => {
    return () => {
      if (status === "connected" || status === "connecting") {
        hangUp();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Gift purchase handler
  const handleGiftPurchase = async (gift: Gift) => {
    if (!relationship || relationship.level < gift.minLevel) {
      setGiftResponse(`Need level ${gift.minLevel} to send this gift`);
      return;
    }

    setIsProcessingGift(true);
    try {
      const res = await fetch('/api/purchase-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ giftId: gift.id })
      });

      if (res.status === 503 || res.status === 404) {
        // API not implemented yet - show demo response
        console.log("Gift API not available, showing demo response");
        setGiftResponse(`Demo: You sent ${gift.name}! 💕 (Payment integration coming soon)`);
        setTimeout(() => {
          fetchRelationshipStatus();
        }, 1000);
        return;
      }

      const data = await res.json();
      
      if (data.error) {
        setGiftResponse(data.error);
      } else {
        // Here you would integrate Stripe payment
        // For now, simulate response
        setTimeout(async () => {
          const responseRes = await fetch(`/api/gift-response/${gift.id}`, {
            credentials: 'include'
          });
          
          if (responseRes.ok) {
            const responseData = await responseRes.json();
            setGiftResponse(responseData.response || "Thank you so much! 💕");
          } else {
            setGiftResponse("Thank you so much! 💕");
          }
          
          fetchRelationshipStatus();
          fetchAvailableGifts();
        }, 2000);
      }
    } catch (error) {
      console.error('Gift purchase failed:', error);
      setGiftResponse('Gift system temporarily unavailable');
    } finally {
      setIsProcessingGift(false);
      setSelectedGift(null);
    }
  };

  // Handle gift confirmation
  const handleConfirmGift = () => {
    if (selectedGift) {
      handleGiftPurchase(selectedGift);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-purple-500/10"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000),
            }}
            animate={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000),
            }}
            transition={{
              duration: Math.random() * 20 + 10,
              repeat: Infinity,
              repeatType: "reverse",
            }}
            style={{
              width: Math.random() * 300 + 50,
              height: Math.random() * 300 + 50,
              filter: "blur(40px)",
            }}
          />
        ))}
      </div>

      {/* Gift Hint Notification */}
      <AnimatePresence>
        {showGiftHint && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-4 z-50"
          >
            <p className="text-purple-600 flex items-center gap-2">
              <span className="text-2xl">💭</span>
              <span className="italic">{giftHintMessage}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main call interface container */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        {/* Relationship status bar */}
        {relationship && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-4 right-4 max-w-md mx-auto"
          >
            <button 
              onClick={() => setShowRelationshipDetails(true)}
              className={`w-full bg-gradient-to-r ${STAGE_STYLES[relationship.stage]?.bg || 'from-purple-500/20'} to-transparent backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all cursor-pointer`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{STAGE_STYLES[relationship.stage]?.emoji || '💕'}</span>
                  <div>
                    <p className="text-white font-semibold">{relationship.stage}</p>
                    <p className="text-purple-200 text-xs">Level {relationship.level}/100</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-purple-200 text-xs">Mood: {MOOD_INDICATORS[relationship.mood] || relationship.mood}</p>
                  <p className="text-purple-300 text-xs">{relationship.streak} day streak 🔥</p>
                  {relationship.totalGiftsValue && relationship.totalGiftsValue > 0 && (
                    <p className="text-pink-300 text-xs">Gifts: ${relationship.totalGiftsValue.toFixed(2)} 💝</p>
                  )}
                </div>
              </div>
              
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-400 to-pink-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${relationship.level}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
              
              <p className="text-purple-300/70 text-xs text-center flex items-center justify-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Tap for details
              </p>
            </button>
          </motion.div>
        )}

        {/* Gift Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowGiftModal(true)}
          className="absolute bottom-32 right-6 p-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
          {relationship && relationship.level >= 20 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
          )}
        </motion.button>

        {/* Call interface */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/5 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-white/10 max-w-md w-full"
        >
          {/* Ellie avatar with pulse animation */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <motion.div
                animate={speaking ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.5, repeat: speaking ? Infinity : 0 }}
                className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center shadow-xl"
              >
                <span className="text-white text-5xl font-bold">E</span>
              </motion.div>
              
              {/* Voice level indicator */}
              {status === "connected" && (
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-purple-400"
                  animate={{ scale: 1 + level * 0.3, opacity: 0.3 + level * 0.7 }}
                  transition={{ duration: 0.1 }}
                />
              )}
              
              {/* Status indicator */}
              <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-2 border-slate-800 ${
                status === "connected" ? "bg-green-500" :
                status === "connecting" ? "bg-yellow-500 animate-pulse" :
                "bg-gray-500"
              }`} />
            </div>
            
            <h2 className="text-white text-2xl font-semibold mt-4">Ellie</h2>
            <p className="text-purple-300 text-sm">
              {status === "ready" ? "Ready to call" :
               status === "connecting" ? "Connecting..." :
               status === "connected" ? (speaking ? "Speaking..." : "Listening...") :
               status === "error" ? "Connection failed" :
               "Call ended"}
            </p>
          </div>

          {/* Call controls */}
          <div className="flex justify-center gap-4">
            {status === "ready" ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startCall}
                className="px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg hover:shadow-purple-500/50 transition-all flex items-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Start Call
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleMute}
                  className={`p-4 rounded-full ${muted ? "bg-red-500 hover:bg-red-600" : "bg-gray-600 hover:bg-gray-700"} text-white shadow-lg transition-all`}
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

          {/* Mic gain control */}
          {status === "connected" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10 mt-6"
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-2xl w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-purple-500/30 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6">
                <h2 className="text-2xl font-bold text-white">Send Ellie a Gift</h2>
                <p className="text-purple-100 mt-1">Show her how you feel</p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {availableGifts.map((gift) => {
                    const isLocked = !relationship || relationship.level < gift.minLevel;
                    
                    return (
                      <motion.button
                        key={gift.id}
                        whileHover={!isLocked ? { scale: 1.05 } : {}}
                        whileTap={!isLocked ? { scale: 0.95 } : {}}
                        onClick={() => !isLocked && setSelectedGift(gift)}
                        disabled={isLocked || isProcessingGift}
                        className={`p-4 rounded-xl transition-all ${
                          isLocked
                            ? 'bg-gray-800/50 cursor-not-allowed opacity-50'
                            : 'bg-gradient-to-br from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 cursor-pointer'
                        } border border-purple-500/30`}
                      >
                        <div className="text-3xl mb-2">{gift.emoji}</div>
                        <h3 className="text-white font-semibold text-sm">{gift.name}</h3>
                        <p className="text-purple-300 font-bold">${gift.price}</p>
                        {isLocked && (
                          <p className="text-gray-500 text-xs mt-1">Level {gift.minLevel}</p>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {giftResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-xl border border-pink-500/30"
                  >
                    <p className="text-white flex items-start gap-2">
                      <span className="text-xl">💕</span>
                      <span>{giftResponse}</span>
                    </p>
                  </motion.div>
                )}
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-purple-500/30 overflow-hidden"
            >
              <div className={`bg-gradient-to-r ${STAGE_STYLES[relationship.stage]?.bg || 'from-purple-500'} to-pink-500 p-6`}>
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{STAGE_STYLES[relationship.stage]?.emoji || '💕'}</span>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{relationship.stage}</h2>
                    <p className="text-purple-100">Your relationship with Ellie</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Level Progress */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-purple-200 text-sm font-semibold">Level {relationship.level}/100</span>
                    <span className="text-purple-300 text-sm">{100 - relationship.level} to next stage</span>
                  </div>
                  <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-purple-400 to-pink-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${relationship.level}%` }}
                      transition={{ duration: 1 }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-purple-300 text-xs">Current Mood</p>
                    <p className="text-white font-semibold">{MOOD_INDICATORS[relationship.mood] || relationship.mood}</p>
                  </div>
                  
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-purple-300 text-xs">Streak</p>
                    <p className="text-white font-semibold">{relationship.streak} days 🔥</p>
                  </div>

                  {relationship.totalInteractions && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-purple-300 text-xs">Total Chats</p>
                      <p className="text-white font-semibold">{relationship.totalInteractions}</p>
                    </div>
                  )}

                  {relationship.emotionalInvestment && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                      <p className="text-purple-300 text-xs">Connection</p>
                      <p className="text-white font-semibold">{Math.round(relationship.emotionalInvestment)}%</p>
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

                {selectedGift.cooldownHours && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                    <p className="text-purple-300 text-xs text-center">
                      ⏰ {selectedGift.cooldownHours}h cooldown after sending
                    </p>
                  </div>
                )}

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