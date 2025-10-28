"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "../(providers)/toast";
import { motion } from "framer-motion";

type Status = "ready" | "connecting" | "connected" | "closed" | "error";

const WS_URL = "wss://ellie-api-1.onrender.com/ws/phone";

export default function CallClient() {
  const { toasts, show } = useToasts();

  const [status, setStatus] = useState<Status>("ready");
  const [muted, setMuted] = useState(false);
  const [logs, setLogs] = useState<string[]>([]); // 📱 Store logs to show on screen
  const [gain, setGain] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("ellie_call_gain") : null;
    return v ? Math.max(0.2, Math.min(3, Number(v))) : 1.0;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<number | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // ✅ NEW: Web Audio API playback nodes instead of HTMLAudioElement
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  // 📱 Custom log function that displays on screen
  const log = useCallback((msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev.slice(-20), `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }, []);

  function floatTo16BitPCM(float32: Float32Array) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function abToBase64(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
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

  // ✅ NEW: Convert PCM16 to AudioBuffer (Web Audio API format)
  function pcm16ToAudioBuffer(pcm16: Int16Array, sampleRate: number): AudioBuffer {
    const ac = acRef.current!;
    const audioBuffer = ac.createBuffer(1, pcm16.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Convert Int16 to Float32 (-1.0 to 1.0)
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    
    return audioBuffer;
  }

  // ✅ NEW: Web Audio API playback using AudioBufferSourceNode
  const playNextBuffer = useCallback(() => {
    log(`[playNext] playing:${isPlayingRef.current} queue:${playbackQueueRef.current.length}`);
    
    if (isPlayingRef.current || playbackQueueRef.current.length === 0) {
      return;
    }
    
    const ac = acRef.current;
    if (!ac) {
      log("[playNext] ❌ No audio context!");
      return;
    }
    
    isPlayingRef.current = true;
    const audioBuffer = playbackQueueRef.current.shift()!;
    
    log(`[playNext] ▶️ Playing (${playbackQueueRef.current.length} left in queue)`);
    
    try {
      // Create a new source node for this buffer
      const source = ac.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect directly to destination (speakers/Bluetooth)
      source.connect(ac.destination);
      
      // Handle playback end
      source.onended = () => {
        log("[Audio] Ended");
        isPlayingRef.current = false;
        playbackSourceRef.current = null;
        playNextBuffer(); // Play next in queue
      };
      
      playbackSourceRef.current = source;
      source.start(0);
      log("[play] ✅ Started");
      
    } catch (err) {
      const error = err as Error;
      log(`[play] ❌ Error: ${error.name} - ${error.message}`);
      isPlayingRef.current = false;
      playNextBuffer();
    }
  }, [log]);

  const ensureAudio = useCallback(async () => {
    if (!acRef.current) {
      const AnyWin = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext || AnyWin.webkitAudioContext;
      
      acRef.current = new AC({ 
        sampleRate: 24000, 
        latencyHint: 'interactive'
      });
      
      if (acRef.current.state === 'suspended') {
        await acRef.current.resume();
      }
      
      log(`[Audio] Context created, state: ${acRef.current.state}`);
    }
    
    if (!micStreamRef.current) {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 24000 },
        } as MediaTrackConstraints
      };
      
      micStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      log("[Audio] Microphone stream acquired");
    }
    
    return acRef.current!;
  }, [log]);

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
      try { nodeAfterGain.disconnect(analyser); } catch {}
      try { analyser.disconnect(); } catch {}
      analyserRef.current = null;
    };
  }, []);

  const stopPinger = () => {
    if (wsPingRef.current) {
      window.clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }
  };

  const cleanupAudio = useCallback(() => {
    try { processorRef.current?.disconnect(); } catch {}
    try { gainRef.current?.disconnect(); } catch {}
    try { micNodeRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    
    // ✅ NEW: Stop any playing audio buffer
    try { 
      if (playbackSourceRef.current) {
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
        playbackSourceRef.current = null;
      }
    } catch {}
    
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    
    log("[Audio] Cleanup complete");
  }, [log]);

  const cleanupAll = useCallback(() => {
    stopPinger();
    try { wsRef.current?.close(); } catch {}
    cleanupAudio();
  }, [cleanupAudio]);

  const startCall = useCallback(async () => {
    try {
      setStatus("connecting");
      log("[Call] Starting...");
      
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          setStatus("error");
          show("Connection timeout");
        }
      }, 15000);

      ws.onopen = async () => {
        clearTimeout(connectionTimeout);
        setStatus("connected");
        show("Connected!");
        log("[WS] Connected");

        let realUserId = "default-user";
        try {
          const meRes = await fetch("/api/auth/me", { credentials: "include" });
          if (meRes.ok) {
            const meData = await meRes.json();
            realUserId = meData.userId || "default-user";
          }
        } catch (e) {
          log(`[Auth] Error: ${e}`);
        }

        const storedLang = localStorage.getItem("ellie_language") || "en";

        ws.send(JSON.stringify({ 
          type: "hello", 
          userId: realUserId,
          language: storedLang,
          sampleRate: 24000 
        }));

        const ac = await ensureAudio();
        const stream = micStreamRef.current!;
        const src = ac.createMediaStreamSource(stream);
        micNodeRef.current = src;

        const gn = ac.createGain();
        gn.gain.value = gain;
        gainRef.current = gn;
        src.connect(gn);
        startMeter(gn);

        const proc = ac.createScriptProcessor(4096, 1, 1);
        processorRef.current = proc;
        gn.connect(proc);
        proc.connect(ac.destination);
        proc.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = ev.inputBuffer.getChannelData(0);
          const pcm16 = floatTo16BitPCM(input);
          const b64 = abToBase64(pcm16.buffer);
          ws.send(JSON.stringify({ type: "audio.append", audio: b64 }));
        };

        wsPingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const obj = JSON.parse(String(ev.data));
          
          // ✅ NEW: Convert received audio to AudioBuffer and queue it
          if (obj?.type === "audio.delta" && obj.audio) {
            log("[WS] Audio delta received");
            const ab = base64ToArrayBuffer(obj.audio);
            const pcm16 = new Int16Array(ab);
            
            // Convert to AudioBuffer instead of Blob
            const audioBuffer = pcm16ToAudioBuffer(pcm16, 24000);
            
            playbackQueueRef.current.push(audioBuffer);
            log(`[Queue] Added (total: ${playbackQueueRef.current.length})`);
            playNextBuffer();
          }
          
          if (obj?.type === "error") {
            log(`[Server] Error: ${obj.message}`);
            show(`Error: ${obj.message || "Unknown error"}`);
          }
        } catch (e) {
          log(`[Parse] Error: ${e}`);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(connectionTimeout);
        log(`[WS] Error: ${err}`);
        setStatus("error");
        show("Connection error");
      };

      ws.onclose = (ev) => {
        clearTimeout(connectionTimeout);
        stopPinger();
        log(`[WS] Closed: ${ev.code}`);
        setStatus("closed");
        show("Call ended");
        cleanupAudio();
        wsRef.current = null;
      };
    } catch (e) {
      log(`[Start] Failed: ${e}`);
      setStatus("error");
      show("Failed to start call");
    }
  }, [ensureAudio, gain, show, startMeter, playNextBuffer, cleanupAudio, log]);

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

  const vibes = Math.min(100, level * 100);
  const outerScale = 1 + vibes * 0.006;
  const glow = speaking ? 30 + vibes * 0.4 : 15;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-pink-800 to-rose-900 text-white px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none" />

      {/* 📱 ON-SCREEN DEBUG LOGS */}
      {logs.length > 0 && (
        <div className="absolute top-20 left-4 right-4 bg-black/90 text-green-400 p-2 rounded text-xs font-mono max-h-48 overflow-y-auto z-50">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}

      <div className="absolute top-6 right-6 flex items-center gap-2 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full">
        <div className={`w-2 h-2 rounded-full ${
          status === "connected" ? "bg-green-400 animate-pulse" :
          status === "connecting" ? "bg-yellow-400 animate-pulse" :
          status === "ready" ? "bg-blue-400" :
          status === "error" ? "bg-red-400" : "bg-gray-400"
        }`} />
        <span className="text-sm capitalize">{status}</span>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {status === "ready" ? (
          <>
            <div className="w-48 h-48 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-8">
              <span className="text-6xl">💜</span>
            </div>
            
            <h1 className="text-3xl font-bold mb-2">Ready to Call Ellie</h1>
            <p className="text-pink-200 mb-8 text-center max-w-sm">
              Using Web Audio API for iOS Safari Bluetooth fix
            </p>
            
            <button
              onClick={startCall}
              className="px-8 py-4 rounded-full bg-green-500 hover:bg-green-600 text-white font-bold text-lg shadow-lg transition-all transform hover:scale-105"
            >
              Start Call (Web Audio)
            </button>
          </>
        ) : (
          <>
            <motion.div
              className="relative mb-8"
              animate={{ scale: outerScale }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div 
                className="w-48 h-48 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center relative"
                style={{
                  boxShadow: `0 0 ${glow}px rgba(236, 72, 153, 0.8), 0 0 ${glow * 1.5}px rgba(168, 85, 247, 0.5)`
                }}
              >
                <span className="text-6xl">💜</span>
                {speaking && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-4 border-pink-300"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
            </motion.div>

            <h1 className="text-3xl font-bold mb-2">Ellie</h1>
            <p className="text-pink-200 mb-8">Voice Call Active</p>

            <div className="flex items-center gap-4">
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full ${
                  muted ? "bg-red-500 hover:bg-red-600" : "bg-white/20 hover:bg-white/30"
                } backdrop-blur-sm transition-colors`}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              <button
                onClick={hangUp}
                className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                title="Hang up"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </button>
            </div>

            <div className="mt-8 w-64">
              <label className="block text-sm text-pink-200 mb-2">Microphone Gain</label>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
                className="w-full accent-pink-500"
              />
              <div className="text-xs text-pink-200 text-center mt-1">{gain.toFixed(1)}x</div>
            </div>
          </>
        )}
      </div>

      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg"
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
