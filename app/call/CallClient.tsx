"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "../(providers)/toast";
import { motion } from "framer-motion";

type Status = "ready" | "connecting" | "connected" | "closed" | "error";

const WS_URL = "wss://ellie-api-1.onrender.com/ws/phone";

export default function CallClient() {
  const { show } = useToasts();

  const [status, setStatus] = useState<Status>("ready");
  const [muted, setMuted] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [gain, setGain] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("ellie_call_gain") : null;
    return v ? Math.max(0.2, Math.min(3, Number(v))) : 1.0;
  });

  // --- Core refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<number | null>(null);

  const acRef = useRef<AudioContext | null>(null);

  // mic capture
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // iOS BT output element (hidden) + destination stream
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const outDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Web Audio playback chain for Ellie’s voice
  const speakGainRef = useRef<GainNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const lookaheadPaddingSec = 0.02;

  // Optional keepalive osc (helps iOS keep route during long silences)
  const routeKeepaliveRef = useRef<OscillatorNode | null>(null);

  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  // ---------- logging ----------
  const log = useCallback((msg: string) => {
    console.log(msg);
    setLogs((prev) => [...prev.slice(-25), `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }, []);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
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

  // ---------- iOS Bluetooth priming beep ----------
  const playBluetoothBeepOnce = useCallback(async () => {
    if (!audioElementRef.current) {
      const audio = document.createElement("audio");
      audio.style.display = "none";
      audio.autoplay = false;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      document.body.appendChild(audio);
      audioElementRef.current = audio;
    }
    const audio = audioElementRef.current;

    // generate a short WAV beep
    const sampleRate = 24000;
    const duration = 0.3;
    const samples = Math.floor(sampleRate * duration);
    const beepData = new Int16Array(samples);
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      let env = 1;
      const fadeIn = samples * 0.2;
      const fadeOutStart = samples * 0.8;
      if (i < fadeIn) env = i / fadeIn;
      else if (i > fadeOutStart) env = (samples - i) / (samples - fadeOutStart);
      const amplitude = 0.5 * env;
      beepData[i] = Math.floor(amplitude * 32767 * Math.sin(2 * Math.PI * 440 * t));
    }
    // build wav
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = beepData.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const wstr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    wstr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    wstr(8, "WAVE");
    wstr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    wstr(36, "data");
    view.setUint32(40, dataSize, true);
    for (let i = 0; i < beepData.length; i++) {
      view.setInt16(44 + i * 2, beepData[i], true);
    }

    const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    audio.src = url;
    audio.volume = 0.7;
    try {
      if (acRef.current && acRef.current.state === "suspended") {
        await acRef.current.resume();
      }
      await audio.play();
      await new Promise<void>((resolve) => {
        const onEnd = () => {
          audio.removeEventListener("ended", onEnd);
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.addEventListener("ended", onEnd, { once: true });
      });
      log("[Audio] ✅ Beep played — Bluetooth route primed");
    } catch {
      URL.revokeObjectURL(url);
      log("[Audio] ⚠️ Beep failed (continuing)");
    }
  }, [log]);

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
    log("[Audio] 🧹 Cleaning up…");
    try { processorRef.current?.disconnect(); } catch {}
    try { gainRef.current?.disconnect(); } catch {}
    try { micNodeRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}

    try { routeKeepaliveRef.current?.stop(); } catch {}
    try { routeKeepaliveRef.current?.disconnect(); } catch {}
    routeKeepaliveRef.current = null;

    nextPlayTimeRef.current = 0;

    log("[Audio] ✅ Cleanup complete");
  }, [log]);

  const cleanupAll = useCallback(() => {
    stopPinger();
    try { wsRef.current?.close(); } catch {}
    cleanupAudio();
  }, [cleanupAudio]);

  // ---------- ensure audio & mic ----------
  const ensureAudio = useCallback(async () => {
    log("[Audio] 🎤 Initializing audio…");
    if (!acRef.current) {
      const AnyWin = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext || AnyWin.webkitAudioContext;
      acRef.current = new AC({ latencyHint: "interactive" });
      log(`[Audio] AudioContext: state=${acRef.current.state}, rate=${acRef.current.sampleRate}Hz`);
      if (acRef.current.state === "suspended") {
        await acRef.current.resume();
      }
    }

    // Create (or reuse) hidden <audio> element early
    if (!audioElementRef.current) {
      const audio = document.createElement("audio");
      audio.style.display = "none";
      audio.autoplay = false;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      document.body.appendChild(audio);
      audioElementRef.current = audio;
    }

    // Output chain: speakGain -> MediaStreamDestination -> <audio srcObject>
    if (!speakGainRef.current) {
      speakGainRef.current = acRef.current.createGain();
      speakGainRef.current.gain.value = 1.0;
    }
    if (!outDestRef.current) {
      outDestRef.current = acRef.current.createMediaStreamDestination();
      speakGainRef.current.connect(outDestRef.current);
      // Bind the audio element to our output stream
      if (audioElementRef.current!.srcObject !== outDestRef.current.stream) {
        audioElementRef.current!.srcObject = outDestRef.current.stream;
      }
    }

    // Keep iOS audio route alive during pauses (very low level)
    if (!routeKeepaliveRef.current) {
      const osc = acRef.current.createOscillator();
      const g = acRef.current.createGain();
      g.gain.value = 0.0001; // inaudible
      osc.frequency.value = 20;
      osc.connect(g).connect(speakGainRef.current); // keepalive goes through the same output chain
      osc.start();
      routeKeepaliveRef.current = osc;
    }

    // iOS BT priming beep (ensures route is available)
    await playBluetoothBeepOnce();

    // IMPORTANT: start the hidden audio element once; it will keep playing our stream
    try {
      await audioElementRef.current!.play();
      log("[Audio] ▶️ Output element playing (stream mode)");
    } catch (e) {
      log("[Audio] ⚠️ Could not start output element yet (needs user gesture)");
    }

    // Mic
    if (!micStreamRef.current) {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          // sampleRate: 16000, // uncomment if your server prefers HFP-friendly rate
        } as MediaTrackConstraints,
      };
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
        const track = micStreamRef.current.getAudioTracks()[0];
        const st = track.getSettings();
        log(`[Audio] ✅ Mic granted: ${st.sampleRate || "unknown"} Hz`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`[Audio] ❌ Mic error: ${message}`);
        throw err;
      }
    }

    log("[Audio] ✅ Audio ready");
    return acRef.current!;
  }, [log, playBluetoothBeepOnce]);

  // ---------- playback scheduling ----------
  const schedulePlayback = useCallback((buffer: AudioBuffer) => {
    const ac = acRef.current!;
    const speakGain = speakGainRef.current!;
    const startTime = Math.max(ac.currentTime + lookaheadPaddingSec, nextPlayTimeRef.current);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(speakGain);
    src.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
  }, []);

  // ---------- call start ----------
  const startCall = useCallback(async () => {
    try {
      setStatus("connecting");
      log("[Call] 📞 Starting call…");
      log(`[Call] Device: ${navigator.userAgent.slice(0, 120)}`);

      // wake lock (best effort)
      if ("wakeLock" in navigator) {
        try {
          const nav = navigator as { wakeLock?: { request: (type: string) => Promise<unknown> } };
          await nav.wakeLock?.request("screen");
          log("[iOS] 🔓 Wake lock");
        } catch {
          log("[iOS] ⚠️ Wake lock not available");
        }
      }

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && acRef.current?.state === "suspended") {
          acRef.current.resume();
        }
      });

      const ac = await ensureAudio();

      // WebSocket
      log(`[WS] Connecting to ${WS_URL}…`);
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

        // identify user
        let realUserId = "default-user";
        try {
          const meRes = await fetch("/api/auth/me", { credentials: "include" });
          if (meRes.ok) {
            const me = await meRes.json();
            realUserId = me.userId || "default-user";
          }
        } catch {}

        const storedLang = localStorage.getItem("ellie_language") || "en";
        ws.send(
          JSON.stringify({
            type: "hello",
            userId: realUserId,
            language: storedLang,
            sampleRate: 24000,
          })
        );
        log("[WS] ➡️ Sent hello");

        // mic capture -> encode -> ws
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

        // connect to destination (muted) so onaudioprocess fires on iOS
        const muted = ac.createGain();
        muted.gain.value = 0;
        proc.connect(muted);
        muted.connect(ac.destination);

        let audioChunksSent = 0;
        let lastLogTime = performance.now();

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
          audioChunksSent++;

          const now = performance.now();
          if (now - lastLogTime > 2000) {
            log(`[Audio] 📤 Sent ${audioChunksSent} chunks`);
            lastLogTime = now;
            audioChunksSent = 0;
          }
        };

        // keepalive pings
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
          } else if (obj?.type === "pong") {
            // noop
          } else if (obj?.type === "error") {
            show(`Error: ${obj.message || "Unknown error"}`);
            log(`[Server] ❌ ${obj.message}`);
          }
        } catch (err) {
          log(`[WS] Parse error: ${err}`);
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
        setStatus("closed");
        cleanupAudio();
        wsRef.current = null;
        log(`[WS] 🔚 Closed: ${ev.code}`);
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`[Start] ❌ Failed: ${message}`);
      setStatus("error");
      show("Failed to start call");
    }
  }, [cleanupAudio, ensureAudio, log, schedulePlayback, show, startMeter, gain]);

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
    log(`[Mic] ${next ? "🔇 Muted" : "🎤 Unmuted"}`);
  }, [muted, log]);

  const hangUp = useCallback(() => {
    log("[Call] 📴 Hanging up…");
    try {
      wsRef.current?.close();
    } catch {}
    setStatus("ready");
  }, [log]);

  // ---------- render ----------
  const vibes = Math.min(100, level * 100);
  const outerScale = 1 + vibes * 0.006;
  const glow = speaking ? 30 + vibes * 0.4 : 15;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <motion.div
        animate={{ scale: outerScale, boxShadow: `0 0 ${glow}px rgba(255, 99, 132, 0.5)` }}
        transition={{ type: "spring", stiffness: 120, damping: 12 }}
        className="w-28 h-28 rounded-full bg-pink-500/80"
      />
      <div className="text-sm text-gray-600">
        {status === "ready" && "Ready"}
        {status === "connecting" && "Connecting…"}
        {status === "connected" && "Connected"}
        {status === "closed" && "Call ended"}
        {status === "error" && "Error"}
      </div>

      <div className="flex gap-2">
        <button
          className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
          onClick={startCall}
          disabled={status === "connecting" || status === "connected"}
        >
          Start
        </button>
        <button
          className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-50"
          onClick={hangUp}
          disabled={status !== "connected" && status !== "connecting"}
        >
          Hang up
        </button>
        <button
          className="px-3 py-2 rounded bg-gray-800 text-white disabled:opacity-50"
          onClick={toggleMute}
          disabled={status !== "connected"}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm">Mic gain</label>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={gain}
          onChange={(e) => setGain(Number(e.target.value))}
        />
        <span className="text-sm tabular-nums">{gain.toFixed(2)}×</span>
      </div>

      <details className="w-full max-w-xl">
        <summary className="cursor-pointer text-sm text-gray-700">Logs</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded border p-2 text-xs font-mono bg-white">
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </details>
    </div>
  );
}
