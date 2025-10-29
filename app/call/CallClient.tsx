"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "../(providers)/toast";
import { motion, AnimatePresence } from "framer-motion";

type Status = "ready" | "connecting" | "connected" | "closed" | "error";

const WS_URL = "wss://ellie-api-1.onrender.com/ws/phone";

export default function CallClient() {
  const { show } = useToasts();

  const [status, setStatus] = useState<Status>("ready");
  const [muted, setMuted] = useState(false);
  const [showBluetoothGuide, setShowBluetoothGuide] = useState(false);
  const [gain, setGain] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("ellie_call_gain") : null;
    return v ? Math.max(0.2, Math.min(3, Number(v))) : 1.0;
  });

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
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
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

  // ---------- Audio setup ----------
  const ensureAudio = useCallback(async () => {
    if (!acRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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

  // ---------- Call logic ----------
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

        try {
          await ensureAudio();
        } catch {
          // Silent failure
        }

        let realUserId = "default-user";
        try {
          const meRes = await fetch("/api/auth/me", { credentials: "include" });
          if (meRes.ok) {
            const me = await meRes.json();
            realUserId = me.userId || "default-user";
          }
        } catch {}

        const storedLang = (typeof window !== "undefined" && localStorage.getItem("ellie_language")) || "en";
        ws.send(JSON.stringify({ type: "hello", userId: realUserId, language: storedLang, sampleRate: 24000 }));

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
        {/* Status text */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-purple-200 via-pink-200 to-blue-200 bg-clip-text text-transparent">
            {status === "ready" && "Ready to Connect"}
            {status === "connecting" && "Establishing Connection..."}
            {status === "connected" && "Connected"}
            {status === "closed" && "Call Ended"}
            {status === "error" && "Connection Error"}
          </h1>
          <p className="text-purple-300 text-lg">
            {status === "ready" && "Start a conversation whenever you're ready"}
            {status === "connecting" && "Just a moment..."}
            {status === "connected" && "Your conversation is live"}
            {status === "closed" && "Thanks for talking"}
            {status === "error" && "Something went wrong"}
          </p>
        </motion.div>

        {/* Central orb visualization */}
        <div className="relative flex items-center justify-center mb-16">
          {/* Outer rings */}
          {Array.from({ length: ringCount }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border-2 border-purple-400/30"
              style={{
                width: 200 + i * 80,
                height: 200 + i * 80,
              }}
              animate={{
                scale: speaking ? [1, 1.1, 1] : 1,
                opacity: speaking ? [0.3, 0.6, 0.3] : 0.2,
              }}
              transition={{
                duration: 2 + i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2,
              }}
            />
          ))}

          {/* Main orb */}
          <motion.div
            animate={{
              scale: pulseScale,
              boxShadow: `0 0 ${glowIntensity}px rgba(167, 139, 250, 0.8), 0 0 ${glowIntensity * 1.5}px rgba(236, 72, 153, 0.4)`,
            }}
            transition={{
              type: "spring",
              stiffness: 150,
              damping: 15,
            }}
            className="relative w-48 h-48 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-purple-600 flex items-center justify-center shadow-2xl"
          >
            {/* Inner glow */}
            <motion.div
              animate={{
                opacity: speaking ? [0.4, 0.8, 0.4] : 0.3,
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-4 rounded-full bg-white/20 blur-xl"
            />

            {/* Status icon */}
            <div className="relative z-10 text-white">
              {status === "ready" && (
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              {status === "connecting" && (
                <motion.svg
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-20 h-20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </motion.svg>
              )}
              {status === "connected" && (
                <motion.svg
                  animate={speaking ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                  className="w-20 h-20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </motion.svg>
              )}
              {(status === "closed" || status === "error") && (
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          </motion.div>

          {/* Audio level indicator bars */}
          {status === "connected" && (
            <div className="absolute -bottom-16 flex gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-2 bg-gradient-to-t from-purple-400 to-pink-400 rounded-full"
                  animate={{
                    height: speaking ? [8, 32, 8] : 8,
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="flex gap-4">
            {(status === "ready" || status === "closed" || status === "error") && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartClick}
                className="px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg shadow-lg hover:shadow-purple-500/50 transition-shadow flex items-center gap-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Call
              </motion.button>
            )}

            {(status === "connected" || status === "connecting") && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleMute}
                  disabled={status !== "connected"}
                  className={`px-6 py-4 rounded-full font-semibold shadow-lg transition-all ${
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
