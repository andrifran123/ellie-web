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
  const [logs, setLogs] = useState<string[]>([]);
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

  // 🎵 HTMLAudioElement for iOS Bluetooth routing
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const playingRef = useRef(false);
  const drainingRef = useRef(false);

  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  // 📱 Logging with on-screen display
  const log = useCallback((msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev.slice(-25), `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }, []);

  // ===== Audio Conversion Helpers =====
  
  function resampleTo24k(inputBuffer: Float32Array, inputRate: number): Float32Array<ArrayBuffer> {
    if (inputRate === 24000) {
      const output = new Float32Array(inputBuffer.length);
      output.set(inputBuffer);
      return output;
    }
    
    const ratio = 24000 / inputRate;
    const outputLength = Math.floor(inputBuffer.length * ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
      const t = srcIndex - srcIndexFloor;
      output[i] = inputBuffer[srcIndexFloor] * (1 - t) + inputBuffer[srcIndexCeil] * t;
    }
    
    return output;
  }

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

  function pcm16ToWavBlob(pcm16: Int16Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm16.length * 2;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    for (let i = 0; i < pcm16.length; i++) {
      view.setInt16(44 + i * 2, pcm16[i], true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ===== Audio Playback Queue (Sequential for iOS) =====
  
  const drainPlayback = useCallback(async () => {
    if (drainingRef.current) {
      log("[Playback] Already draining, skip");
      return;
    }
    
    if (audioQueueRef.current.length === 0) {
      log("[Playback] Queue empty, nothing to play");
      return;
    }
    
    const audio = audioElementRef.current;
    if (!audio) {
      log("[Playback] ❌ No audio element!");
      return;
    }
    
    drainingRef.current = true;
    log(`[Playback] 🔊 Starting drain, queue: ${audioQueueRef.current.length}`);
    
    try {
      while (audioQueueRef.current.length > 0) {
        const blob = audioQueueRef.current.shift()!;
        const url = URL.createObjectURL(blob);
        
        log(`[Playback] ▶️ Playing chunk (${audioQueueRef.current.length} remaining)`);
        
        audio.src = url;
        
        // Wait for this chunk to finish
        await new Promise<void>((resolve, reject) => {
          const onEnded = () => {
            log("[Playback] ✅ Chunk ended");
            URL.revokeObjectURL(url);
            cleanup();
            resolve();
          };
          
          const onError = (e: Event) => {
            const target = e.target as HTMLAudioElement;
            log(`[Playback] ❌ Error: ${target.error?.code} ${target.error?.message}`);
            URL.revokeObjectURL(url);
            cleanup();
            reject(e);
          };
          
          const cleanup = () => {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
          };
          
          audio.addEventListener('ended', onEnded, { once: true });
          audio.addEventListener('error', onError, { once: true });
          
          audio.play()
            .then(() => log("[Playback] ✅ Play() started"))
            .catch(err => {
              log(`[Playback] ❌ Play failed: ${err.name}`);
              reject(err);
            });
        });
      }
      
      log("[Playback] ✅ Queue drained completely");
    } catch (err: any) {
      log(`[Playback] ❌ Drain error: ${err.message || err}`);
    } finally {
      drainingRef.current = false;
    }
  }, [log]);

  // ===== Audio Setup with iOS-specific handling =====
  
  const ensureAudio = useCallback(async () => {
    log("[Audio] 🎤 Setting up audio system...");
    
    // Create AudioContext
    if (!acRef.current) {
      const AnyWin = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext || AnyWin.webkitAudioContext;
      
      acRef.current = new AC({ 
        latencyHint: 'interactive'
      });
      
      log(`[Audio] AudioContext created: state=${acRef.current.state}, sampleRate=${acRef.current.sampleRate}Hz`);
      
      // iOS requires explicit resume after user gesture
      if (acRef.current.state === 'suspended') {
        log("[Audio] 🔓 Resuming suspended AudioContext...");
        await acRef.current.resume();
        log(`[Audio] ✅ Resumed: state=${acRef.current.state}`);
      }
    }
    
    // Create HTMLAudioElement for iOS Bluetooth routing
    if (!audioElementRef.current) {
      log("[Audio] 🔊 Creating HTMLAudioElement for iOS Bluetooth...");
      const audio = new Audio();
      audio.autoplay = false;
      
      // Important: Set iOS-specific attributes
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      
      audioElementRef.current = audio;
      
      // Prime the audio element with a tiny silent audio file
      // This helps iOS route audio to Bluetooth on first interaction
      const silenceBlob = pcm16ToWavBlob(new Int16Array(1000), 24000); // 42ms of silence
      const silenceUrl = URL.createObjectURL(silenceBlob);
      audio.src = silenceUrl;
      
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        URL.revokeObjectURL(silenceUrl);
        log("[Audio] ✅ Audio element primed for iOS");
      } catch (e: any) {
        log(`[Audio] ⚠️ Could not prime audio: ${e.name}`);
      }
      
      log("[Audio] ✅ HTMLAudioElement ready");
    }
    
    // Request microphone
    if (!micStreamRef.current) {
      log("[Audio] 🎙️ Requesting microphone...");
      
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        } as MediaTrackConstraints
      };
      
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
        
        const audioTrack = micStreamRef.current.getAudioTracks()[0];
        const settings = audioTrack.getSettings();
        log(`[Audio] ✅ Microphone granted: sampleRate=${settings.sampleRate}Hz`);
        
      } catch (err: any) {
        log(`[Audio] ❌ Microphone denied: ${err.message}`);
        throw err;
      }
    }
    
    log("[Audio] ✅ Audio setup complete");
    return acRef.current!;
  }, [log]);

  // ===== Visual Meter =====
  
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

  // ===== Cleanup =====
  
  const stopPinger = () => {
    if (wsPingRef.current) {
      window.clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }
  };

  const cleanupAudio = useCallback(() => {
    log("[Audio] 🧹 Cleaning up...");
    try { processorRef.current?.disconnect(); } catch {}
    try { gainRef.current?.disconnect(); } catch {}
    try { micNodeRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
    }
    
    audioQueueRef.current.forEach(blob => URL.revokeObjectURL(URL.createObjectURL(blob)));
    audioQueueRef.current = [];
    playingRef.current = false;
    drainingRef.current = false;
    
    log("[Audio] ✅ Cleanup complete");
  }, [log]);

  const cleanupAll = useCallback(() => {
    stopPinger();
    try { wsRef.current?.close(); } catch {}
    cleanupAudio();
  }, [cleanupAudio]);

  // ===== WebSocket Connection =====
  
  const startCall = useCallback(async () => {
    try {
      setStatus("connecting");
      log("[Call] 📞 Starting call...");
      log(`[Call] Device: ${navigator.userAgent.slice(0, 100)}`);
      
      // Setup audio FIRST (ensures user interaction primes everything)
      const ac = await ensureAudio();
      
      // Now establish WebSocket
      log(`[WS] Connecting to ${WS_URL}...`);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          log("[WS] ⏱️ Connection timeout");
          ws.close();
          setStatus("error");
          show("Connection timeout");
        }
      }, 15000);

      ws.onopen = async () => {
        clearTimeout(connectionTimeout);
        setStatus("connected");
        show("Connected!");
        log("[WS] ✅ Connected");

        // Get user ID
        let realUserId = "default-user";
        try {
          const meRes = await fetch("/api/auth/me", { credentials: "include" });
          if (meRes.ok) {
            const meData = await meRes.json();
            realUserId = meData.userId || "default-user";
            log(`[Auth] User: ${realUserId}`);
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
        
        log("[WS] Sent hello message");

        // Setup microphone capture pipeline
        const stream = micStreamRef.current!;
        const src = ac.createMediaStreamSource(stream);
        micNodeRef.current = src;

        const gn = ac.createGain();
        gn.gain.value = gain;
        gainRef.current = gn;
        src.connect(gn);
        startMeter(gn);

        // Audio processor for sending
        const contextSampleRate = ac.sampleRate;
        log(`[Audio] Processing at ${contextSampleRate}Hz → 24000Hz`);
        
        const proc = ac.createScriptProcessor(4096, 1, 1);
        processorRef.current = proc;
        gn.connect(proc);
        
        // ⚠️ DO NOT connect to destination to avoid echo
        // proc.connect(ac.destination); // REMOVED for no echo
        
        proc.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          
          let input = ev.inputBuffer.getChannelData(0);
          
          // Resample if needed
          if (contextSampleRate !== 24000) {
            input = resampleTo24k(input, contextSampleRate);
          }
          
          const pcm16 = floatTo16BitPCM(input);
          const b64 = abToBase64(pcm16.buffer);
          ws.send(JSON.stringify({ type: "audio.append", audio: b64 }));
        };
        
        log("[Audio] ✅ Microphone pipeline ready");

        // Start ping
        wsPingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const obj = JSON.parse(String(ev.data));
          
          if (obj?.type === "audio.delta" && obj.audio) {
            log("[WS] 🔊 Audio chunk received");
            const ab = base64ToArrayBuffer(obj.audio);
            const pcm16 = new Int16Array(ab);
            const wavBlob = pcm16ToWavBlob(pcm16, 24000);
            
            audioQueueRef.current.push(wavBlob);
            log(`[Queue] Added (total: ${audioQueueRef.current.length})`);
            
            void drainPlayback();
          }
          
          if (obj?.type === "error") {
            log(`[Server] ❌ Error: ${obj.message}`);
            show(`Error: ${obj.message || "Unknown error"}`);
          }
        } catch (e) {
          log(`[Parse] ❌ Error: ${e}`);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(connectionTimeout);
        log(`[WS] ❌ Error: ${err}`);
        setStatus("error");
        show("Connection error");
      };

      ws.onclose = (ev) => {
        clearTimeout(connectionTimeout);
        stopPinger();
        log(`[WS] ❌ Closed: ${ev.code}`);
        setStatus("closed");
        show("Call ended");
        cleanupAudio();
        wsRef.current = null;
      };
    } catch (e: any) {
      log(`[Start] ❌ Failed: ${e.message || e}`);
      setStatus("error");
      show("Failed to start call");
    }
  }, [ensureAudio, gain, show, startMeter, drainPlayback, cleanupAudio, log]);

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
    log(`[Mic] ${next ? '🔇 Muted' : '🎤 Unmuted'}`);
  }, [muted, log]);

  const hangUp = useCallback(() => {
    log("[Call] 📴 Hanging up...");
    try { wsRef.current?.close(); } catch {}
    setStatus("ready");
  }, [log]);

  // ===== Render =====
  
  const vibes = Math.min(100, level * 100);
  const outerScale = 1 + vibes * 0.006;
  const glow = speaking ? 30 + vibes * 0.4 : 15;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-pink-800 to-rose-900 text-white px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none" />

      {/* Debug Logs */}
      {logs.length > 0 && (
        <div className="absolute top-20 left-4 right-4 bg-black/90 text-green-400 p-2 rounded text-xs font-mono max-h-48 overflow-y-auto z-50 border border-green-600/30">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}

      {/* Status Indicator */}
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
            <p className="text-pink-200 mb-2 text-center max-w-sm">
              iOS Bluetooth + Resampling + Debug
            </p>
            <p className="text-pink-300 mb-8 text-center max-w-sm text-sm">
              Fixed for iPhone with Bluetooth headsets
            </p>
            
            <button
              onClick={startCall}
              className="px-8 py-4 rounded-full bg-green-500 hover:bg-green-600 text-white font-bold text-lg shadow-lg transition-all transform hover:scale-105"
            >
              Start Call
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
