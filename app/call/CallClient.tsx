"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToasts } from "../(providers)/toast";
import { httpToWs, joinUrl } from "@/lib/url";
import { motion } from "framer-motion";

/**
 * Premium Call UI:
 * - Futuristic/Cozy: nebula background, glass grid, glowing “energy orb”
 * - Orb breathes to mic level (RMS)
 * - Minimal glass control bar (Mute / Hang up / Gain)
 */

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Status = "connecting" | "connected" | "closed" | "error";

export default function CallClient() {
  const router = useRouter();
  const { toasts, show } = useToasts();

  const [status, setStatus] = useState<Status>("connecting");
  const [muted, setMuted] = useState(false);
  const [gain, setGain] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("ellie_call_gain") : null;
    return v ? Math.max(0.2, Math.min(3, Number(v))) : 1.0;
  });

  // audio + socket refs
  const wsRef = useRef<WebSocket | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // visual meter state
  const [level, setLevel] = useState(0);        // 0..1 RMS
  const [speaking, setSpeaking] = useState(false);

  // PCM16 helper
  function floatTo16BitPCM(float32: Float32Array) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ensureAudioGraph = useCallback(async () => {
    if (acRef.current) return acRef.current;
    type WinWithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WinWithWebkit;
    const AC: typeof AudioContext = (w.AudioContext || w.webkitAudioContext)!;
    const ac = new AC({ sampleRate: 16000 });
    acRef.current = ac;
    return ac;
  }, []);

  // visual RMS meter loop
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
      // RMS
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const smooth = Math.min(1, Math.max(0, rms * 3.2)); // scale for nicer UI
      setLevel((prev) => prev * 0.7 + smooth * 0.3);

      const speakingNow = smooth > 0.06; // threshold
      if (speakingNow) {
        setSpeaking(true);
        if (calmTimer) window.clearTimeout(calmTimer);
        calmTimer = window.setTimeout(() => setSpeaking(false), 180);
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

  const connect = useCallback(async () => {
    if (!API) {
      setStatus("error");
      show("Missing NEXT_PUBLIC_API_URL");
      return;
    }
    try {
      const wsUrl = httpToWs(joinUrl(API, "/ws/phone"));
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        show("Call connected");

        const ac = await ensureAudioGraph();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        const src = ac.createMediaStreamSource(stream);
        micNodeRef.current = src;

        const gn = ac.createGain();
        gn.gain.value = gain;
        gainRef.current = gn;

        src.connect(gn);

        // Start the meter branch BEFORE processor/worklet (no audible output)
        const stopMeter = startMeter(gn);

        // Preferred: AudioWorklet (low-latency)
        let usingWorklet = false;
        try {
          if (ac.audioWorklet) {
            await ac.audioWorklet.addModule("/worklets/mic-processor.js");
            const worklet = new AudioWorkletNode(ac, "mic-processor");
            workletRef.current = worklet;
            gn.connect(worklet);
            worklet.connect(ac.destination); // silent; keeps node alive
            worklet.port.onmessage = (ev) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(ev.data);
            };
            usingWorklet = true;
          }
        } catch { /* fallback below */ }

        if (!usingWorklet) {
          const proc = ac.createScriptProcessor(4096, 1, 1);
          processorRef.current = proc;
          gn.connect(proc);
          proc.connect(ac.destination);
          proc.onaudioprocess = (ev) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            const input = ev.inputBuffer.getChannelData(0);
            const pcm16 = floatTo16BitPCM(input);
            ws.send(pcm16.buffer);
          };
        }

        // cleanup for this branch
        ws.onclose = () => {
          setStatus("closed");
          show("Call ended");
          try { stopMeter(); } catch {}
          processorRef.current?.disconnect();
          gainRef.current?.disconnect();
          micNodeRef.current?.disconnect();
          workletRef.current?.disconnect();
          micStreamRef.current?.getTracks().forEach((t) => t.stop());
          wsRef.current = null;
        };
      };

      ws.onmessage = async () => {
        // (Optional) if server streams audio back, you can play it here
      };
      ws.onerror = () => {
        setStatus("error");
        show("WebSocket error");
      };
    } catch {
      setStatus("error");
      show("Failed to connect call");
    }
  }, [ensureAudioGraph, show, gain, startMeter]);

  useEffect(() => {
    void connect();
    return () => {
      try { wsRef.current?.close(); } catch {}
      processorRef.current?.disconnect();
      gainRef.current?.disconnect();
      micNodeRef.current?.disconnect();
      workletRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [connect]);

  // update gain live
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = gain;
    if (typeof window !== "undefined") {
      localStorage.setItem("ellie_call_gain", String(gain));
    }
  }, [gain]);

  const toggleMute = () => {
    const s = micStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const hangUp = () => {
    try { wsRef.current?.close(); } catch {}
    router.push("/chat");
  };

  // Keyboard: M to toggle mute
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  /* ===================== UI ===================== */
  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      {/* Ambient nebula */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1600px circle at 70% 65%, #150a2d 0%, #0a0620 58%, #060316 85%)",
        }}
      />
      {/* Glass grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-5">
        <div className="flex items-center gap-2">
          <div className="size-8 grid place-items-center rounded-lg bg-white/10">📞</div>
          <div className="text-sm">
            <div className="font-semibold">Call</div>
            <div
              className={`text-xs ${
                status === "connected" ? "text-emerald-400" : "text-white/60"
              }`}
            >
              {status === "connecting" && "Connecting…"}
              {status === "connected" && "Connected"}
              {status === "closed" && "Ended"}
              {status === "error" && "Error"}
            </div>
          </div>
        </div>

        <div className="text-xs text-white/60">
          Press <span className="px-1 rounded bg-white/10">M</span> to mute / unmute
        </div>
      </header>

      {/* Center Orb */}
      <main className="relative z-10 grid place-items-center px-6 pt-6">
        <div className="relative w-[min(78vw,540px)] aspect-square">
          {/* Concentric rings */}
          <div className="absolute inset-0 -z-10 rounded-full ring-1 ring-white/5" />
          <div className="absolute inset-6 -z-10 rounded-full ring-1 ring-white/5" />
          <div className="absolute inset-12 -z-10 rounded-full ring-1 ring-white/5" />
          <div className="absolute inset-20 -z-10 rounded-full ring-1 ring-white/5" />

          {/* Soft glow */}
          <div
            className="absolute -inset-6 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, rgba(140,110,255,0.28), transparent 70%)",
            }}
          />

          {/* Energy orb that breathes with mic level */}
          <Orb level={Math.max(0, Math.min(1, level ?? 0))} speaking={!!speaking} />
        </div>
      </main>

      {/* Controls */}
      <footer className="relative z-10 px-6 pb-8 pt-6 grid place-items-center">
        <div className="w-full max-w-xl flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur shadow-[0_10px_50px_rgba(120,80,255,0.15)]">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`h-11 px-4 rounded-xl font-medium transition ${
              muted ? "bg-rose-500 text-white" : "bg-white text-black"
            }`}
            title="Mute (M)"
          >
            {muted ? "Unmute" : "Mute"}
          </button>

          {/* Hang up */}
          <button
            onClick={hangUp}
            className="h-11 px-4 rounded-xl font-semibold bg-rose-600 text-white hover:bg-rose-500 transition"
            title="Hang up"
          >
            Hang up
          </button>

          {/* Gain */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-white/70 w-12">Gain</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={gain}
              onChange={(e) => setGain(Number(e.target.value))}
              className="w-40 accent-white"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Orb — futuristic, cozy “energy” sphere that scales to mic level
   ───────────────────────────────────────────────────────────── */
function Orb({ level, speaking }: { level: number; speaking: boolean }) {
  // scale between 1.0 and ~1.18 based on level
  const scale = 1 + Math.min(0.18, level * 0.25);

  return (
    <motion.div
      className="absolute inset-0 rounded-full grid place-items-center"
      animate={{ scale }}
      transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.6 }}
    >
      {/* inner core */}
      <div
        className="relative size-full rounded-full"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0.9), rgba(255,255,255,0.65) 35%, rgba(180,160,255,0.25) 70%, rgba(80,50,150,0.15) 100%)",
        }}
      >
        {/* flowing sheen */}
        <div
          className="absolute inset-0 rounded-full mix-blend-screen opacity-70"
          style={{
            background:
              "conic-gradient(from 210deg at 50% 50%, rgba(160,120,255,0.35), rgba(40,20,120,0.0) 35%, rgba(160,120,255,0.35))",
            maskImage:
              "radial-gradient(55% 55% at 50% 50%, black 60%, transparent 72%)",
          }}
        />

        {/* speaking sparkle */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{ opacity: speaking ? [0.25, 0.6, 0.25] : 0.15 }}
          transition={{
            duration: 1.5,
            repeat: speaking ? Infinity : 0,
            ease: "easeInOut",
          }}
          style={{
            background:
              "radial-gradient(30% 30% at 55% 35%, rgba(255,255,255,0.7), rgba(255,255,255,0) 60%)",
          }}
        />
      </div>
    </motion.div>
  );
}
