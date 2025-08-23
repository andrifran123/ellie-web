"use client";

import React, { useEffect, useRef, useState } from "react";

type ChatMsg = { from: "you" | "ellie"; text: string };

type LangCode =
  | "en" | "is" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

type LangOption = { code: LangCode; name: string };

type GetLanguageResponse = { language?: LangCode | null };
type SetLanguageResponse = { ok?: boolean; language?: LangCode; label?: string };
type ChatResponse = { reply?: string; language?: LangCode; voiceMode?: string };
type VoiceResponse = {
  // text?: string;   // removed on purpose: we no longer show user's transcript from voice
  reply?: string;
  language?: LangCode;
  voiceMode?: string;
  audioMp3Base64?: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "";
const USER_ID = "default-user";

const LANGS: LangOption[] = [
  { code: "en", name: "English" },
  { code: "is", name: "Icelandic" },
  { code: "pt", name: "Portuguese" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export default function Page() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Voice recording (record/send)
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Language gate
  const [langReady, setLangReady] = useState(false);
  const [chosenLang, setChosenLang] = useState<LangCode>("en");

  // VoiceMode flag Ellie can set
  const [voiceMode, setVoiceMode] = useState<string | null>(null);

  // ───────────────────────────────────────────────
  // Language picker logic
  // ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!API) return;

      const stored = typeof window !== "undefined"
        ? (localStorage.getItem("ellie_language") as LangCode | null)
        : null;

      if (stored) {
        await fetch(`${API}/api/set-language`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: USER_ID, language: stored }),
        }).catch(() => {});
        setChosenLang(stored);
        setLangReady(true);
        return;
      }

      try {
        const r = await fetch(
          `${API}/api/get-language?userId=${encodeURIComponent(USER_ID)}`
        );
        const data = (await r.json()) as GetLanguageResponse;
        if (data?.language) {
          localStorage.setItem("ellie_language", data.language);
          setChosenLang(data.language);
          setLangReady(true);
          return;
        }
      } catch {
        /* fall through */
      }

      setLangReady(false);
    })();
  }, []);

  async function confirmLanguage(): Promise<void> {
    if (!API) return;
    try {
      const r = await fetch(`${API}/api/set-language`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, language: chosenLang }),
      });
      const data = (await r.json()) as SetLanguageResponse;
      const saved = data?.language ?? chosenLang;
      localStorage.setItem("ellie_language", saved);
      setLangReady(true);
    } catch {
      alert("Could not save language. Please try again.");
    }
  }

  // ───────────────────────────────────────────────
  // Chat helpers
  // ───────────────────────────────────────────────
  function append(from: "you" | "ellie", text: string): void {
    setMessages((prev) => [...prev, { from, text }]);
  }

  async function sendText(): Promise<void> {
    if (!API || !langReady) return;
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    append("you", msg);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, message: msg }),
      });
      const data = (await r.json()) as ChatResponse;
      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);
    } catch (e) {
      append("ellie", `Error: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function resetConversation(): Promise<void> {
    if (!API) return;
    setMessages([]);
    setVoiceMode(null);
    await fetch(`${API}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
    }).catch(() => {});
  }

  // ───────────────────────────────────────────────
  // Voice chat (record → send)
  // ───────────────────────────────────────────────

  // Helper to check support for MediaRecorder MIME types without using `any`
  const isTypeSupported = (mime: string): boolean => {
    return (
      typeof MediaRecorder !== "undefined" &&
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(mime)
    );
  };

  async function startRecording(): Promise<void> {
    if (!langReady) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferred = "audio/webm;codecs=opus";
      const fallback = "audio/webm";
      const picked = isTypeSupported(preferred)
        ? preferred
        : isTypeSupported(fallback)
        ? fallback
        : ""; // let browser decide as last resort

      const mr = new MediaRecorder(stream, picked ? { mimeType: picked } : undefined);
      chunksRef.current = [];

      mr.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const uploadType = picked || mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: uploadType });
        void sendVoiceBlob(blob, uploadType);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("Microphone permission required.");
    }
  }

  function stopRecording(): void {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  }

  async function sendVoiceBlob(blob: Blob, mimeType?: string): Promise<void> {
    if (!API || !langReady) return;
    setLoading(true);
    try {
      const mt = (mimeType || blob.type || "").toLowerCase();
      const ext = mt.includes("webm") ? "webm"
        : mt.includes("ogg") ? "ogg"
        : mt.includes("mpeg") ? "mp3"
        : mt.includes("mp4") ? "m4a"
        : mt.includes("wav") ? "wav"
        : "webm";

      const fd = new FormData();
      fd.append("audio", blob, `clip.${ext}`);
      fd.append("userId", USER_ID);
      fd.append(
        "language",
        (typeof window !== "undefined" && (localStorage.getItem("ellie_language") as LangCode | null)) ||
          chosenLang ||
          "en"
      );

      const r = await fetch(`${API}/api/voice-chat`, {
        method: "POST",
        body: fd,
      });
      const data = (await r.json()) as VoiceResponse;

      // IMPORTANT: do not append "you" transcript for voice
      // if (data?.text) append("you", data.text); // ← removed on purpose

      if (data?.reply) append("ellie", data.reply);
      if (data?.voiceMode) setVoiceMode(data.voiceMode);

      if (data?.audioMp3Base64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioMp3Base64}`);
        try {
          await audio.play();
        } catch {
          /* autoplay block */
        }
      }
    } catch (e) {
      append("ellie", `Voice error: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // ───────────────────────────────────────────────
  // PHONE CALL (Realtime WS to /ws/phone)
  // ───────────────────────────────────────────────

  const phoneWsRef = useRef<WebSocket | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const [onCall, setOnCall] = useState(false);
  const [talking, setTalking] = useState(false);

  function wsUrlFor(path: string) {
    if (!API) return "";
    return API.replace(/^http/, "ws") + path;
  }

  const encoderWorkletJs = `
class PCMEncoder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputRate = sampleRate;
    this.targetRate = 24000;
    this.ratio = this.inputRate / this.targetRate;
    this.chunkMs = 50;
    this.targetSamplesPerPacket = Math.floor(this.targetRate * this.chunkMs / 1000);
    this.acc = 0;
    this.resampled = [];
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const chCount = input.length;
    const ch0 = input[0];
    let mono = ch0;
    if (chCount > 1) {
      const L = ch0.length;
      mono = new Float32Array(L);
      for (let i=0;i<L;i++) {
        let s = 0;
        for (let c=0;c<chCount;c++) s += input[c][i];
        mono[i] = s / chCount;
      }
    }
    const step = this.ratio;
    for (let i = 0; i < mono.length; i++) {
      this.acc += 1;
      while (this.acc >= step) {
        const idx = (this.acc - step);
        const srcPos = i - (idx);
        const s0i = Math.max(0, Math.floor(srcPos));
        const s1i = Math.min(s0i + 1, mono.length - 1);
        const frac = srcPos - s0i;
        const s = mono[s0i] * (1 - frac) + mono[s1i] * frac;
        this.resampled.push(s);
        this.acc -= step;
      }
    }
    while (this.resampled.length >= this.targetSamplesPerPacket) {
      const pkt = this.resampled.splice(0, this.targetSamplesPerPacket);
      const i16 = new Int16Array(pkt.length);
      for (let i=0;i<pkt.length;i++) {
        let v = Math.max(-1, Math.min(1, pkt[i]));
        i16[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
      }
      const b = new Uint8Array(i16.buffer);
      let bin = "";
      for (let i=0;i<b.length;i++) bin += String.fromCharCode(b[i]);
      const base64 = btoa(bin);
      this.port.postMessage({ type: 'pcm16', b64: base64 });
    }
    return true;
  }
}
registerProcessor('pcm-encoder', PCMEncoder);
`;

  const playerWorkletJs = `
class PCMPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readIdx = 0;
    this.port.onmessage = (e) => {
      if (e.data?.type === 'push') {
        this.queue.push(e.data.f32);
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const L = out[0];
    const R = out[1] || L;
    L.fill(0); if (R) R.fill(0);
    if (this.queue.length === 0) return true;
    const buf = this.queue[0];
    const frames = Math.min(L.length, buf.length - this.readIdx);
    for (let i=0;i<frames;i++) {
      const s = buf[this.readIdx + i];
      L[i] = s;
      if (R) R[i] = s;
    }
    this.readIdx += frames;
    if (this.readIdx >= buf.length) {
      this.queue.shift();
      this.readIdx = 0;
    }
    return true;
  }
}
registerProcessor('pcm-player', PCMPlayer);
`;

  async function ensureAudioGraph(): Promise<void> {
    if (acRef.current) return;
    const ac = new AudioContext({ sampleRate: 48000 });
    acRef.current = ac;

    const encUrl = URL.createObjectURL(new Blob([encoderWorkletJs], { type: "application/javascript" }));
    await ac.audioWorklet.addModule(encUrl);

    const playUrl = URL.createObjectURL(new Blob([playerWorkletJs], { type: "application/javascript" }));
    await ac.audioWorklet.addModule(playUrl);

    const player = new AudioWorkletNode(ac, "pcm-player", { numberOfOutputs: 1, outputChannelCount: [2] });
    player.connect(ac.destination);
    playerNodeRef.current = player;
  }

  function b64pcm16ToF32(b64: string): Float32Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bytes.length;i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer);
    const out = new Float32Array(i16.length);
    for (let i=0;i<i16.length;i++) out[i] = Math.max(-1, Math.min(1, i16[i] / 0x8000));
    return out;
  }

  async function startPhoneCall(): Promise<void> {
    if (!API || onCall) return;
    await ensureAudioGraph();

    const ws = new WebSocket(wsUrlFor("/ws/phone"));
    phoneWsRef.current = ws;

    ws.onopen = () => {
      const lang =
        (typeof window !== "undefined" &&
          (localStorage.getItem("ellie_language") as LangCode | null)) ||
        "en";
      ws.send(JSON.stringify({ type: "hello", userId: USER_ID, language: lang, sampleRate: 24000 }));
      setOnCall(true);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "audio.delta" && msg.audio) {
        const f32 = b64pcm16ToF32(msg.audio);
        playerNodeRef.current?.port.postMessage({ type: "push", f32 });
      }
      // If you want captions, you can watch for msg.type === "text.delta"/"text.final"
    };

    ws.onclose = () => {
      setOnCall(false);
      setTalking(false);
      try { micSourceRef.current?.disconnect(); } catch {}
      try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    };

    // Prepare mic + encoder (connect on press-to-talk)
    micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    const encoder = new AudioWorkletNode(acRef.current!, "pcm-encoder", { numberOfInputs: 1, numberOfOutputs: 0 });
    encoder.port.onmessage = (e) => {
      if (e.data?.type === "pcm16" && phoneWsRef.current?.readyState === 1) {
        phoneWsRef.current.send(JSON.stringify({ type: "audio.append", audio: e.data.b64 }));
      }
    };
    micNodeRef.current = encoder;
  }

  function endPhoneCall(): void {
    try { phoneWsRef.current?.close(); } catch {}
    try { micSourceRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    setOnCall(false);
    setTalking(false);
  }

  function startTalking(): void {
    if (!onCall || !micNodeRef.current || !acRef.current || !micStreamRef.current) return;
    if (!micSourceRef.current) {
      micSourceRef.current = acRef.current.createMediaStreamSource(micStreamRef.current);
    }
    try {
      micSourceRef.current.connect(micNodeRef.current);
    } catch {}
    setTalking(true);
  }

  function stopTalking(): void {
    if (!onCall || !phoneWsRef.current) return;
    try { micSourceRef.current?.disconnect(); } catch {}
    setTalking(false);
    phoneWsRef.current.send(JSON.stringify({ type: "audio.commit" }));
  }

  // ───────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────
  if (!langReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b0f",
          color: "#fff",
        }}
      >
        <div
          style={{
            background: "#111",
            padding: 24,
            borderRadius: 12,
            width: 360,
            border: "1px solid #222",
          }}
        >
          <h2>Choose your language</h2>
          <select
            value={chosenLang}
            onChange={(e) => setChosenLang(e.target.value as LangCode)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #333",
              background: "#1a1a1f",
              color: "#fff",
            }}
          >
            {LANGS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
          <button
            onClick={confirmLanguage}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 8,
              background: "#fff",
              color: "#000",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "32px auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#fff",
        background: "#0b0b0f",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>Ellie</h1>
        <div style={{ textAlign: "right" }}>
          <div style={{ opacity: 0.7 }}>
            Lang: {typeof window !== "undefined" ? localStorage.getItem("ellie_language") : ""}
          </div>
          {voiceMode && <div style={{ opacity: 0.7 }}>Mode: {voiceMode}</div>}
          <button
            onClick={resetConversation}
            style={{
              marginTop: 4,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#16161c",
              color: "#fff",
            }}
          >
            Reset
          </button>
        </div>
      </header>

      <section
        style={{
          border: "1px solid #222",
          borderRadius: 12,
          padding: 12,
          minHeight: 260,
          marginBottom: 16,
          background: "#101015",
          overflowY: "auto",
        }}
      >
        {messages.length === 0 && <div style={{ opacity: 0.6 }}>Say hi to Ellie…</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "8px 0" }}>
            <b>{m.from === "you" ? "You" : "Ellie"}</b>: {m.text}
          </div>
        ))}
      </section>

      {/* Text input */}
      <section style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #333",
            background: "#101015",
            color: "#fff",
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void sendText();
          }}
        />
        <button
          onClick={() => void sendText()}
          disabled={loading || !input.trim()}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "#fff",
            color: "#000",
          }}
        >
          Send
        </button>
      </section>

      {/* Record → send voice */}
      <section style={{ display: "flex", gap: 8 }}>
        {!recording ? (
          <button
            onClick={() => void startRecording()}
            disabled={loading}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #0a7",
              background: "#0a7",
              color: "#fff",
            }}
          >
            🎤 Start voice
          </button>
        ) : (
          <button
            onClick={() => stopRecording()}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #a00",
              background: "#a00",
              color: "#fff",
            }}
          >
            ⏹ Stop & send
          </button>
        )}
        {loading && <span style={{ alignSelf: "center", opacity: 0.8 }}>Processing…</span>}
      </section>

      {/* Phone call realtime */}
      <section style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {!onCall ? (
         <button
  onClick={() => window.open("/call", "_blank", "noopener,noreferrer")}
  style={{ padding: "12px 16px", borderRadius: 8, background: "#0a7", color: "#fff" }}
>
  📞 Start call
</button>
        ) : (
          <>
            <button
              onMouseDown={startTalking}
              onMouseUp={stopTalking}
              onTouchStart={startTalking}
              onTouchEnd={stopTalking}
              disabled={!onCall}
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                background: talking ? "#e67e22" : "#f39c12",
                color: "#000",
              }}
            >
              {talking ? "🗣️ Release to send" : "🎙️ Hold to talk"}
            </button>
            <button
              onClick={endPhoneCall}
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                background: "#a00",
                color: "#fff",
              }}
            >
              ⛔ Hang up
            </button>
          </>
        )}
      </section>
    </div>
  );
}
