"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToasts } from "../(providers)/toast";
import { httpToWs } from "@/lib/url";
import { toApiUrl } from "@/lib/api";
import { motion } from "framer-motion";

type Status = "connecting" | "connected" | "closed" | "error";

// ✅ Build-time env with a safe fallback
const API =
  const API = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function CallClient() {
  const router = useRouter();
  const { toasts, show } = useToasts();

  const [status, setStatus] = useState<Status>("connecting");
  const [muted, setMuted] = useState(false);
  const [gain, setGain] = useState<number>(() => {
    const v =
      typeof window !== "undefined"
        ? localStorage.getItem("ellie_call_gain")
        : null;
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
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  function floatTo16BitPCM(float32: Float32Array) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ensureAudio = useCallback(async () => {
    if (!acRef.current) {
      const AnyWin = window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      };
      const AC = window.AudioContext || AnyWin.webkitAudioContext;
      acRef.current = new AC({ sampleRate: 16000 });
    }
    if (!micStreamRef.current) {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    }
    return acRef.current!;
  }, []);

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

  // ✅ Always target your API origin for WS (so cookies/session are valid there)
 /**
 * WebSocket must hit the Render origin directly.
 * HTTP stays same-origin via /api rewrite, but Vercel won’t proxy WS upgrades to external domains.
 */
const buildWsUrl = useCallback(() => {
  const wsPath = "/api/ws/phone"; // <- make sure your server listens here (under /api)
  if (API) {
    // Direct to Render host for WS
    return httpToWs(`${API}${wsPath}`);
  }
  // Local dev / same-origin fallback
  return httpToWs(`${window.location.origin}${wsPath}`);
}, []);

  const cleanupAudio = useCallback(() => {
    try {
      processorRef.current?.disconnect();
    } catch {}
    try {
      gainRef.current?.disconnect();
    } catch {}
    try {
      micNodeRef.current?.disconnect();
    } catch {}
    try {
      workletRef.current?.disconnect();
    } catch {}
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
  }, []);

  const cleanupAll = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {}
    cleanupAudio();
  }, [cleanupAudio]);

  const connect = useCallback(async () => {
    try {
      const ac = await ensureAudio();
      const stream = micStreamRef.current!;
      const src = ac.createMediaStreamSource(stream);
      micNodeRef.current = src;

      const gn = ac.createGain();
      gn.gain.value = gain;
      gainRef.current = gn;

      src.connect(gn);
      const stopMeter = startMeter(gn);

      const ws = new WebSocket(buildWsUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        show("Call connected");

        let usingWorklet = false;
        try {
          if (ac.audioWorklet) {
            await ac.audioWorklet.addModule("/worklets/mic-processor.js");
            const worklet = new AudioWorkletNode(ac, "mic-processor");
            workletRef.current = worklet;
            gn.connect(worklet);
            worklet.connect(ac.destination);
            worklet.port.onmessage = (ev) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(ev.data);
            };
            usingWorklet = true;
          }
        } catch {}

        if (!usingWorklet) {
          const proc = ac.createScriptProcessor(4096, 1, 1);
          processorRef.current = proc;
          gn.connect(proc);
          proc.connect(ac.destination);
          proc.onaudioprocess = (ev) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const input = ev.inputBuffer.getChannelData(0);
            const pcm16 = floatTo16BitPCM(input);
            ws.send(pcm16.buffer);
          };
        }

        ws.onclose = () => {
          setStatus("closed");
          show("Call ended");
          try {
            stopMeter();
          } catch {}
          cleanupAudio();
          wsRef.current = null;
        };
      };

      ws.onerror = () => {
        setStatus("error");
        show("Connection error");
      };
    } catch {
      setStatus("error");
      show("Mic permission or connection failed");
    }
  }, [ensureAudio, gain, show, startMeter, buildWsUrl, cleanupAudio]);

  useEffect(() => {
    void connect();
    return () => cleanupAll();
  }, [connect, cleanupAll]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = gain;
    if (typeof window !== "undefined")
      localStorage.setItem("ellie_call_gain", String(gain));
  }, [gain]);

  const toggleMute = useCallback(() => {
    const s = micStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const hangUp = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {}
    router.push("/chat");
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute]);

  /* ===================== UI ===================== */
  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <Starfield />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1600px circle at 70% 65%, #130b2d 0%, #0b0722 55%, #070616 85%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 pt-5">
        <div className="flex items-center gap-2">
          <div className="size-8 grid place-items-center rounded-lg bg-white/10">
            📞
          </div>
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
          Press <span className="px-1 rounded bg-white/10">M</span> to mute /
          unmute
        </div>
      </header>

      <main className="relative z-10 grid place-items-center px-6 pt-6">
        <div className="relative w-[min(78vw,560px)] aspect-square">
          {[0, 8, 16, 26].map((g, i) => (
            <div
              key={i}
              className="absolute -z-10 rounded-full ring-1 ring-white/6"
              style={{ inset: g }}
            />
          ))}
          <div
            className="absolute -inset-6 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, rgba(150,120,255,0.28), transparent 70%)",
            }}
          />
          <EnergyOrb level={level} speaking={speaking} />
        </div>
      </main>

      <footer className="relative z-10 px-6 pb-8 pt-6 grid place-items-center">
        <div className="w-full max-w-xl flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur shadow-[0_10px_50px_rgba(120,80,255,0.15)]">
          <button
            onClick={toggleMute}
            className={`h-11 px-4 rounded-xl font-medium transition ${
              muted ? "bg-rose-500 text-white" : "bg-white text-black"
            }`}
            title="Mute (M)"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            onClick={hangUp}
            className="h-11 px-4 rounded-xl font-semibold bg-rose-600 text-white hover:bg-rose-500 transition"
            title="Hang up"
          >
            Hang up
          </button>
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

      <div
        className="fixed top-4 right-4 z-50 space-y-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass rounded-lg px-3 py-2 text-sm shadow-lg border border-white/15"
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------- Visuals ------------- */

function EnergyOrb({ level, speaking }: { level: number; speaking: boolean }) {
  const scale = 1 + Math.min(0.35, level * 0.8);
  const glow = 0.25 + Math.min(0.75, level * 1.2);

  return (
    <motion.div
      className="absolute inset-0 rounded-full grid place-items-center"
      animate={{ scale }}
      transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.6 }}
    >
      <div
        className="relative size-full rounded-full"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0.95), rgba(240,230,255,0.75) 34%, rgba(170,150,255,0.32) 70%, rgba(90,60,170,0.20) 100%)",
          boxShadow: `0 0 140px rgba(130,110,255,${glow})`,
        }}
      >
        <div
          className="absolute inset-0 rounded-full mix-blend-screen opacity-70"
          style={{
            background:
              "conic-gradient(from 210deg at 50% 50%, rgba(180,140,255,0.35), rgba(40,20,120,0.0) 35%, rgba(160,120,255,0.35))",
            maskImage:
              "radial-gradient(55% 55% at 50% 50%, black 60%, transparent 75%)",
          }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-white/10"
          animate={{ rotate: 360 }}
          transition={{ ease: "linear", duration: 14, repeat: Infinity }}
          style={{ boxShadow: "0 0 18px rgba(180,150,255,0.12) inset" }}
        />
        {speaking && (
          <>
            <PulseRing delay={0} />
            <PulseRing delay={0.35} />
            <PulseRing delay={0.7} />
          </>
        )}
      </div>
    </motion.div>
  );
}

function PulseRing({ delay }: { delay: number }) {
  return (
    <motion.span
      className="absolute inset-0 rounded-full border-2 border-indigo-300/60"
      initial={{ opacity: 0.0, scale: 1.0 }}
      animate={{ opacity: [0.35, 0.0], scale: [1.05, 1.45] }}
      transition={{ duration: 1.4, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

function Starfield() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let w =
      (c.width =
        window.innerWidth * Math.min(2, window.devicePixelRatio || 1));
    let h =
      (c.height =
        window.innerHeight * Math.min(2, window.devicePixelRatio || 1));
    const stars = Array.from({ length: Math.floor((w * h) / 25000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: 0.2 + Math.random() * 0.8,
      s: 0.6 + Math.random() * 1.2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.x += 0.02 * st.z;
        if (st.x > w) st.x = 0;
        ctx.globalAlpha = 0.15 * st.z;
        ctx.fillStyle = "#c9b6ff";
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
      requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      w =
        (c.width =
          window.innerWidth * Math.min(2, window.devicePixelRatio || 1));
      h =
        (c.height =
          window.innerHeight * Math.min(2, window.devicePixelRatio || 1));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return <canvas ref={ref} className="absolute inset-0 z-0 opacity-[0.35]" />;
}
