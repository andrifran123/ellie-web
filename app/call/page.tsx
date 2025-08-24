"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function CallPage() {
  const router = useRouter();

  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "error">("connecting");
  const [muted, setMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Encode float32 -> PCM16
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

    // Type-safe fallback for webkitAudioContext without using `any`
    type WinWithWebkit = typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const w = window as WinWithWebkit;
    const AC: typeof AudioContext = (w.AudioContext || w.webkitAudioContext)!;

    const ac = new AC({ sampleRate: 16000 });
    acRef.current = ac;
    return ac;
  }, []);

  const connect = useCallback(async () => {
    if (!API) {
      setStatus("error");
      return;
    }
    try {
      const wsUrl = API.replace(/^http/, "ws") + "/ws/phone";
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        // Start mic stream
        const ac = await ensureAudioGraph();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        const src = ac.createMediaStreamSource(stream);
        micNodeRef.current = src;

        const proc = ac.createScriptProcessor(4096, 1, 1);
        processorRef.current = proc;

        src.connect(proc);
        proc.connect(ac.destination); // keep node alive (silent)

        proc.onaudioprocess = (ev) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const input = ev.inputBuffer.getChannelData(0);
          const pcm16 = floatTo16BitPCM(input);
          ws.send(pcm16.buffer);
        };
      };

      ws.onmessage = async (ev) => {
        // If server ever sends audio down (optional), play it
        if (ev.data instanceof ArrayBuffer) {
          const ac = await ensureAudioGraph();
          const buf = await ac.decodeAudioData(ev.data.slice(0));
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(ac.destination);
          src.start();
        }
      };

      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        // cleanup
        processorRef.current?.disconnect();
        micNodeRef.current?.disconnect();
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        wsRef.current = null;
      };
    } catch {
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureAudioGraph]); // `API` is a build-time constant; not a reactive dep

  useEffect(() => {
    void connect();
    return () => {
      try { wsRef.current?.close(); } catch {}
      processorRef.current?.disconnect();
      micNodeRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [connect]);

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

  return (
    <main className="min-h-screen px-4 py-10 text-white">
      <div className="max-w-xl mx-auto">
        {/* top bar */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-white/70 hover:text-white">← Home</Link>
          <Link href="/chat" className="text-white/70 hover:text-white">Chat</Link>
        </div>

        {/* call card */}
        <div className="glass rounded-2xl p-6 md:p-8">
          <h1 className="text-2xl font-semibold">Ellie — Call Mode</h1>
          <p className="text-white/70 mt-2">Always-on call. Toggle mute if needed.</p>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={toggleMute}
              className={`rounded-xl px-4 py-2 font-medium ${
                muted ? "bg-amber-500 text-black" : "bg-white/10 border border-white/10"
              }`}
            >
              {muted ? "🔇 Unmute mic" : "🎙️ Mute mic"}
            </button>

            <button
              onClick={hangUp}
              className="rounded-xl px-4 py-2 font-semibold bg-rose-600"
            >
              🔴 Hang up
            </button>
          </div>

          <div className="mt-4 text-white/70">
            {status === "connecting" && "Connecting…"}
            {status === "connected" && "Connected"}
            {status === "closed" && "Call ended"}
            {status === "error" && "Connection error. Check the API URL and WebSocket path."}
          </div>
        </div>
      </div>
    </main>
  );
}
