"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/** Base voices available on your backend’s TTS (OpenAI) */
const VOICES = ["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse"];

/** Small helper to turn unknown errors into readable strings */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/** Display helper */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
  const [apiBase, setApiBase] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("ellie_api_base") || "" : ""
  );
  const [userId, setUserId] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("ellie_user_id") || "default-user" : "default-user"
  );
  const [voice, setVoice] = useState<string>("sage");

  // FX settings (match backend endpoints)
  const [pitchSemi, setPitchSemi] = useState<number>(0);
  const [tempo, setTempo] = useState<number>(1.0);
  const [stability, setStability] = useState<number>(0.75);
  const [clarity, setClarity] = useState<number>(0.6);
  const [style, setStyle] = useState<number>(0.2);
  const [speakerBoost, setSpeakerBoost] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [testText, setTestText] = useState<string>("Hi, it’s Ellie. Let’s see how this voice sounds.");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const base = useMemo(() => {
    const b = (apiBase || "").trim();
    return b.endsWith("/") ? b.slice(0, -1) : b;
  }, [apiBase]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ellie_api_base", apiBase);
      localStorage.setItem("ellie_user_id", userId);
    }
  }, [apiBase, userId]);

  async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  }

  async function fetchArrayBuffer(url: string, init?: RequestInit): Promise<ArrayBuffer> {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(await res.text());
    return res.arrayBuffer();
  }

  async function loadFromServer(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Loading from server…");
      const data = await fetchJson<{ settings?: {
        pitchSemi?: number; tempo?: number; stability?: number; clarity?: number; style?: number; speakerBoost?: boolean;
      } }>(`${base}/api/get-voice-settings?userId=${encodeURIComponent(userId)}`);

      if (data?.settings) {
        const s = data.settings;
        setPitchSemi(Number(s.pitchSemi ?? 0));
        setTempo(Number(s.tempo ?? 1));
        setStability(Number(s.stability ?? 0.75));
        setClarity(Number(s.clarity ?? 0.6));
        setStyle(Number(s.style ?? 0.2));
        setSpeakerBoost(Boolean(s.speakerBoost));
      }
      setStatus("Loaded current user settings.");
    } catch (e: unknown) {
      setStatus(`Load failed: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveToServer(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Saving settings…");
      await fetchJson(`${base}/api/set-voice-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings: { pitchSemi, tempo, stability, clarity, style, speakerBoost }
        })
      });
      setStatus("Saved! These FX will apply to future replies.");
    } catch (e: unknown) {
      setStatus(`Save failed: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function preview(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Generating preview…");
      const ab = await fetchArrayBuffer(`${base}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText, voice, userId })
      });
      const blob = new Blob([ab], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play().catch(() => { /* user can click play */ });
      }
      setStatus("Preview ready.");
    } catch (e: unknown) {
      setStatus(`Preview failed: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !base;

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#eee", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Ellie – Voice Tuner</h1>
          <span style={{ fontSize: 12, color: "#aaa" }}>Simple FX editor & TTS preview</span>
        </header>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Field label="API Base" hint="Render URL (e.g. https://ellie-api-1.onrender.com)">
            <input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="https://..."
              style={{ width: "100%", padding: 8, borderRadius: 12 }}
            />
          </Field>
          <Field label="User ID" hint="Saved per user in Postgres">
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 12 }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 16, background: "#111", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Base Voice">
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 12 }}
              >
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Speaker Boost">
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={speakerBoost}
                  onChange={(e) => setSpeakerBoost(e.target.checked)}
                />
                <span>Enhance loudness</span>
              </label>
            </Field>
          </div>

          <Field label={`Pitch (semitones): ${pitchSemi}`} hint="-12 deeper, +12 brighter">
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={pitchSemi}
              onChange={(e) => setPitchSemi(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </Field>

          <Field label={`Tempo: ${tempo.toFixed(2)}`} hint="0.5–2.0 (pitch preserved)">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={tempo}
              onChange={(e) => setTempo(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </Field>

          <Field label={`Stability: ${stability.toFixed(2)}`} hint="More compression = steadier loudness">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={stability}
              onChange={(e) => setStability(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </Field>

          <Field label={`Clarity: ${clarity.toFixed(2)}`} hint="High-shelf / air">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={clarity}
              onChange={(e) => setClarity(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </Field>

          <Field label={`Style: ${style.toFixed(2)}`} hint="Room/echo vibe">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={style}
              onChange={(e) => setStyle(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </Field>

          <Field label="Preview Text">
            <textarea
              rows={3}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 12 }}
            />
          </Field>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={preview}
              disabled={disabled}
              style={{ padding: "8px 14px", borderRadius: 16, background: "#fff", color: "#000" }}
            >
              Preview
            </button>
            <button
              onClick={saveToServer}
              disabled={disabled}
              style={{ padding: "8px 14px", borderRadius: 16, border: "1px solid #444" }}
            >
              Save Settings
            </button>
            <button
              onClick={loadFromServer}
              disabled={disabled}
              style={{ padding: "8px 14px", borderRadius: 16, border: "1px solid #444" }}
            >
              Load Current
            </button>
            <div style={{ fontSize: 13, color: "#bbb" }}>
              <strong>Status:</strong> {loading ? "Working…" : status || "Idle"}
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
