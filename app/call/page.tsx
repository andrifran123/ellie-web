"use client";

// Prevent static generation / prerender for this page
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";
export const runtime = "nodejs"; // avoids Edge for WebRTC/WS-heavy pages

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToasts } from "../(providers)/toast";
import { httpToWs, joinUrl } from "@/lib/url";

/**
 * Premium Call UI:
 * - Center “core” circle with Pepsi-style blue waves
 * - Waves react to mic level (AnalyserNode RMS)
 * - Minimal bottom controls (Mute, Hang up)
 * - Gain on long-press or open mini-panel (kept simple here)
 */

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Status = "connecting" | "connected" | "closed" | "error";

export default function CallPage() {
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

  // UI — full-screen premium canvas
  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      {/* Subtle blue/purple gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 800px at 50% 20%, #101322 0%, #0a0c12 60%, #07080d 100%)",
        }}
      />

      {/* Back nav */}
      <div className="absolute top-6 left-6 text-sm text-white/80">
        <Link href="/" className="hover:text-white/100">← Home</Link>
        <span className="mx-2 text-white/40">/</span>
        <Link href="/chat" className="hover:text-white/100">Chat</Link>
      </div>

      {/* Center stage: core + waves */}
      <div className="relative grid place-items-center min-h-screen">
        <WaveCore level={level} speaking={speaking} />

        {/* Status badge */}
        <div className="absolute top-8 right-8 text-xs rounded-full px-3 py-1 glass border border-white/10">
          {status === "connecting" && "Connecting…"}
          {status === "connected" && "Connected"}
          {status === "closed" && "Call ended"}
          {status === "error" && "Connection error"}
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`h-12 px-5 rounded-full font-medium backdrop-blur-md border ${
              muted
                ? "bg-amber-500 text-black border-amber-400"
                : "bg-white/8 text-white border-white/15 hover:bg-white/12"
            }`}
            title={muted ? "Unmute mic" : "Mute mic"}
          >
            {muted ? "🔇 Unmute" : "🎙️ Mute"}
          </button>

          <div className="hidden sm:flex items-center gap-3 bg-white/6 border border-white/10 rounded-full px-4 py-2">
            <span className="text-xs text-white/70">Mic gain</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={gain}
              onChange={(e) => setGain(Number(e.target.value))}
              className="w-40 accent-white"
            />
            <span className="text-xs text-white/70">{gain.toFixed(2)}×</span>
          </div>

          <button
            onClick={hangUp}
            className="h-12 px-5 rounded-full font-semibold bg-rose-600 hover:bg-rose-500"
            title="Hang up"
          >
            🔴 Hang up
          </button>
        </div>
      </div>

      {/* toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass rounded-lg px-3 py-2 text-sm shadow-lg border border-white/15"
          >
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

/** Center visualizer */
function WaveCore({ level, speaking }: { level: number; speaking: boolean }) {
  // Map RMS to nicer visual scales
  const scale = 1 + Math.min(0.28, level * 0.6);
  const glow = Math.min(1, 0.25 + level * 0.9);
  const ringOpacity = Math.min(0.7, 0.25 + level * 0.9);

  return (
    <div className="relative">
      {/* Base “Pepsi blue” waves */}
      <div
        className="relative size-[280px] sm:size-[340px] rounded-full"
        style={{
          transform: `scale(${scale})`,
          transition: "transform 90ms linear",
          background:
            "radial-gradient(closest-side, rgba(40,150,255,0.95) 0%, rgba(40,150,255,0.75) 40%, rgba(20,80,180,0.5) 60%, rgba(10,30,60,0.0) 72%)",
          boxShadow: `0 0 120px rgba(40,150,255,${glow})`,
        }}
      >
        {/* center disc */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-[120px] sm:size-[140px] rounded-full bg-white/90 shadow-2xl" />
        </div>

        {/* static soft rings */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border"
            style={{
              borderColor: `rgba(120,180,255,${ringOpacity / (i + 0.2)})`,
              transform: `scale(${1 + i * 0.2})`,
              filter: "blur(0.3px)",
            }}
          />
        ))}
      </div>

      {/* speaking ripples (animated) */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {speaking && (
          <>
            <Ripple delay="0s" />
            <Ripple delay="0.3s" />
            <Ripple delay="0.6s" />
          </>
        )}
      </div>
    </div>
  );
}

function Ripple({ delay }: { delay: string }) {
  return (
    <span
      aria-hidden
      className="absolute rounded-full border-2 border-blue-300/70 wave-pulse"
      style={{
        animationDelay: delay,
        width: 280,
        height: 280,
      }}
    />
  );
}
