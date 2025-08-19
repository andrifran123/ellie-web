// app/voice-tuner/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const VOICES = ["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse"];

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  const { label, hint, children } = props;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <label style={{ fontWeight: 600, fontSize: 14 }}>{label}</label>
        {hint && <span style={{ fontSize: 12, color: "#666" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function VoiceTuner() {
  // Persisted inputs
  const [apiBase, setApiBase] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("ellie_api_base") || "" : ""
  );
  const [userId, setUserId] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("ellie_user_id") || "default-user" : "default-user"
  );

  // FX/voice controls (values saved to server if you hit Save)
  const [voice, setVoice] = useState<string>("sage");
  const [pitchSemi, setPitchSemi] = useState<number>(0);
  const [tempo, setTempo] = useState<number>(1.0);
  const [stability, setStability] = useState<number>(0.75);
  const [clarity, setClarity] = useState<number>(0.6);
  const [style, setStyle] = useState<number>(0.2);
  const [speakerBoost, setSpeakerBoost] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Idle");
  const [testText, setTestText] = useState<string>("Hi, it’s Ellie. Let’s see how this voice sounds.");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const base = useMemo(() => {
    const s = (apiBase || "").trim();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  }, [apiBase]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ellie_api_base", apiBase);
      localStorage.setItem("ellie_user_id", userId);
    }
  }, [apiBase, userId]);

  async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return (await r.json()) as T;
  }

  async function fetchArrayBuffer(url: string, init?: RequestInit): Promise<ArrayBuffer> {
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.arrayBuffer();
  }

  async function ping(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Pinging health…");
      if (!base) throw new Error("Enter API Base first (e.g. https://ellie-api-1.onrender.com)");
      console.log("[tuner] GET", `${base}/api/healthz`);
      const r = await fetch(`${base}/api/healthz`);
      const t = await r.text();
      setStatus(`Health: ${r.status} ${t}`);
    } catch (e) {
      console.error(e);
      setStatus(`Ping failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrent(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Loading current settings…");
      if (!base) throw new Error("Enter API Base first (e.g. https://ellie-api-1.onrender.com)");
      const url = `${base}/api/get-voice-settings?userId=${encodeURIComponent(userId)}`;
      console.log("[tuner] GET", url);
      const data = await fetchJson<{ settings?: {
        pitchSemi?: number; tempo?: number; stability?: number; clarity?: number; style?: number; speakerBoost?: boolean;
      } }>(url);
      const s = data?.settings || {};
      if (typeof s.pitchSemi === "number") setPitchSemi(s.pitchSemi);
      if (typeof s.tempo === "number") setTempo(s.tempo);
      if (typeof s.stability === "number") setStability(s.stability);
      if (typeof s.clarity === "number") setClarity(s.clarity);
      if (typeof s.style === "number") setStyle(s.style);
      if (typeof s.speakerBoost === "boolean") setSpeakerBoost(s.speakerBoost);
      setStatus("Loaded settings.");
    } catch (e) {
      console.error(e);
      setStatus(`Load failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Saving settings…");
      if (!base) throw new Error("Enter API Base first (e.g. https://ellie-api-1.onrender.com)");
      const url = `${base}/api/set-voice-settings`;
      console.log("[tuner] POST", url);
      await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings: { pitchSemi, tempo, stability, clarity, style, speakerBoost }
        })
      });
      setStatus("Saved! Future replies will use your FX server-side.");
    } catch (e) {
      console.error(e);
      setStatus(`Save failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function preview(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Generating preview…");
      if (!base) throw new Error("Enter API Base first (e.g. https://ellie-api-1.onrender.com)");
      const url = `${base}/api/tts`;
      console.log("[tuner] POST", url);
      const ab = await fetchArrayBuffer(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText, voice, userId })
      });

      const blob = new Blob([ab], { type: "audio/mpeg" });
      const objUrl = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = objUrl;
        audioRef.current.load();                 // ensures duration updates
        try { await audioRef.current.play(); } catch { /* user can click ▶ */ }
      }

      setStatus("Preview ready.");
    } catch (e) {
      console.error(e);
      setStatus(`Preview failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // Buttons only disabled while loading (so clicks ALWAYS fire)
  const btnDisabled = loading;

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#eee", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Ellie – Voice Tuner</h1>
          <small style={{ color: "#aaa" }}>Simple FX editor & TTS preview</small>
        </header>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Field label="API Base" hint="Render URL (e.g. https://ellie-api-1.onrender.com)">
            <input
              value={apiBase}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiBase(e.target.value)}
              placeholder="https://..."
              style={{ width: "100%", padding: 10, borderRadius: 12 }}
            />
          </Field>
          <Field label="User ID" hint="Saved per user in Postgres">
            <input
              value={userId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 12 }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 16, background: "#111", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Base Voice">
              <select
                value={voice}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setVoice(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 12 }}
              >
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Speaker Boost">
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={speakerBoost}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeakerBoost(e.target.checked)}
                />
                <span>Enhance loudness</span>
              </label>
            </Field>
          </div>

          <Field label={`Pitch (semitones): ${pitchSemi}`} hint="-12 deeper, +12 brighter">
            <input type="range" min={-12} max={12} step={1} value={pitchSemi}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPitchSemi(parseFloat(e.target.value))}
              style={{ width: "100%" }} />
          </Field>

          <Field label={`Tempo: ${tempo.toFixed(2)}`} hint="0.5–2.0 (pitch preserved)">
            <input type="range" min={0.5} max={2} step={0.01} value={tempo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempo(parseFloat(e.target.value))}
              style={{ width: "100%" }} />
          </Field>

          <Field label={`Stability: ${stability.toFixed(2)}`} hint="More compression = steadier loudness">
            <input type="range" min={0} max={1} step={0.01} value={stability}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStability(parseFloat(e.target.value))}
              style={{ width: "100%" }} />
          </Field>

          <Field label={`Clarity: ${clarity.toFixed(2)}`} hint="High-shelf / air">
            <input type="range" min={0} max={1} step={0.01} value={clarity}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClarity(parseFloat(e.target.value))}
              style={{ width: "100%" }} />
          </Field>

          <Field label={`Style: ${style.toFixed(2)}`} hint="Room/echo vibe">
            <input type="range" min={0} max={1} step={0.01} value={style}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStyle(parseFloat(e.target.value))}
              style={{ width: "100%" }} />
          </Field>

          <Field label="Preview Text">
            <textarea
              rows={3}
              value={testText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTestText(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 12 }}
            />
          </Field>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { void preview(); }} disabled={btnDisabled}
              style={{ padding: "8px 14px", borderRadius: 16, background: "#fff", color: "#000" }}>
              Preview
            </button>
            <button type="button" onClick={() => { void saveSettings(); }} disabled={btnDisabled}
              style={{ padding: "8px 14px", borderRadius: 16, border: "1px solid #444" }}>
              Save Settings
            </button>
            <button type="button" onClick={() => { void loadCurrent(); }} disabled={btnDisabled}
              style={{ padding: "8px 14px", borderRadius: 16, border: "1px solid #444" }}>
              Load Current
            </button>
            <button type="button" onClick={() => { void ping(); }} disabled={btnDisabled}
              style={{ padding: "8px 14px", borderRadius: 16, border: "1px solid #444" }}>
              Ping API
            </button>
            <div style={{ fontSize: 13, color: "#bbb" }}>
              <strong>Status:</strong> {loading ? "Working…" : status}
            </div>
          </div>

          <audio ref={audioRef} controls style={{ width: "100%", marginTop: 8 }} />
        </div>

        <footer style={{ marginTop: 12, fontSize: 12, color: "#777" }}>
          Tip: set <code>ELLIE_VOICE=sage</code> in your backend env to keep Sage by default.
        </footer>
      </div>
    </div>
  );
}
