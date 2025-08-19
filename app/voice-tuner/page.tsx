// app/voice-tuner/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const VOICES = ["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse"];

type ServerSettings = {
  pitchSemi?: number;
  tempo?: number;
  stability?: number;
  clarity?: number;
  style?: number;
  speakerBoost?: boolean;
};

type PresetItem = {
  key: string;
  label: string;
  settings: Required<ServerSettings>;
};

type PresetListResponse = { presets: PresetItem[] };
type GetSettingsResponse = { settings?: ServerSettings; preset?: string | null };

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

/** Abort after ms so UI never spins forever */
function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  const merged: RequestInit = { ...init, signal: ac.signal };
  return fetch(url, merged).finally(() => clearTimeout(id));
}

export default function VoiceTuner() {
  // Persisted inputs
  const [apiBase, setApiBase] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("ellie_api_base") || "" : ""
  );
  const [userId, setUserId] = useState<string>(
    typeof window !== "undefined" ? localStorage.getItem("ellie_user_id") || "default-user" : "default-user"
  );

  // Voice (OpenAI base voice)
  const [voice, setVoice] = useState<string>("sage");

  // FX sliders (server-side)
  const [pitchSemi, setPitchSemi] = useState<number>(0);
  const [tempo, setTempo] = useState<number>(1.0);
  const [stability, setStability] = useState<number>(0.75);
  const [clarity, setClarity] = useState<number>(0.6);
  const [style, setStyle] = useState<number>(0.2);
  const [speakerBoost, setSpeakerBoost] = useState<boolean>(false);

  // Presets
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>("natural"); // key

  // UI
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Idle");
  const [testText, setTestText] = useState<string>("Hi, it’s Ellie. Trying a new vibe.");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // normalized base
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

  // Load presets list & current settings on first run when base is filled
  useEffect(() => {
    (async () => {
      if (!base) return;
      try {
        setStatus("Loading presets & settings…");
        const [pres, cur] = await Promise.all([
          fetchWithTimeout(`${base}/api/get-voice-presets`).then(r => r.json() as Promise<PresetListResponse>),
          fetchWithTimeout(`${base}/api/get-voice-settings?userId=${encodeURIComponent(userId)}`).then(r => r.json() as Promise<GetSettingsResponse>),
        ]);

        // presets
        setPresets(pres.presets || []);
        if (cur?.preset) setSelectedPreset(cur.preset);

        // current settings → sliders
        const s = cur?.settings || {};
        if (typeof s.pitchSemi === "number") setPitchSemi(s.pitchSemi);
        if (typeof s.tempo === "number") setTempo(s.tempo);
        if (typeof s.stability === "number") setStability(s.stability);
        if (typeof s.clarity === "number") setClarity(s.clarity);
        if (typeof s.style === "number") setStyle(s.style);
        if (typeof s.speakerBoost === "boolean") setSpeakerBoost(s.speakerBoost);

        setStatus("Ready.");
      } catch (e) {
        setStatus(`Init failed: ${errMsg(e)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, userId]);

  async function ping(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Pinging health…");
      if (!base) throw new Error("Enter API Base (e.g. https://ellie-api-1.onrender.com)");
      const r = await fetchWithTimeout(`${base}/api/healthz`);
      setStatus(`Health: ${r.status} ${await r.text()}`);
    } catch (e) {
      setStatus(`Ping failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrent(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Loading current settings…");
      if (!base) throw new Error("Enter API Base first");
      const cur = await fetchWithTimeout(`${base}/api/get-voice-settings?userId=${encodeURIComponent(userId)}`).then(
        r => r.json() as Promise<GetSettingsResponse>
      );
      const s = cur?.settings || {};
      if (typeof s.pitchSemi === "number") setPitchSemi(s.pitchSemi);
      if (typeof s.tempo === "number") setTempo(s.tempo);
      if (typeof s.stability === "number") setStability(s.stability);
      if (typeof s.clarity === "number") setClarity(s.clarity);
      if (typeof s.style === "number") setStyle(s.style);
      if (typeof s.speakerBoost === "boolean") setSpeakerBoost(s.speakerBoost);
      if (cur?.preset) setSelectedPreset(cur.preset);
      setStatus("Loaded settings.");
    } catch (e) {
      setStatus(`Load failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Saving settings…");
      if (!base) throw new Error("Enter API Base first");
      await fetchWithTimeout(`${base}/api/set-voice-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings: { pitchSemi, tempo, stability, clarity, style, speakerBoost }
        })
      }).then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      });
      setStatus("Saved! (These will apply to replies/preview.)");
    } catch (e) {
      setStatus(`Save failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function applyPresetAndPreview(): Promise<void> {
    try {
      setLoading(true);
      setStatus(`Applying preset "${selectedPreset}"…`);
      if (!base) throw new Error("Enter API Base first");

      // 1) Apply preset server-side (this updates saved settings AND marks the preset)
      await fetchWithTimeout(`${base}/api/apply-voice-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, preset: selectedPreset })
      }).then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      });

      // 2) Pull settings we just applied → sync sliders
      const cur = await fetchWithTimeout(`${base}/api/get-voice-settings?userId=${encodeURIComponent(userId)}`).then(
        r => r.json() as Promise<GetSettingsResponse>
      );
      const s = cur?.settings || {};
      if (typeof s.pitchSemi === "number") setPitchSemi(s.pitchSemi);
      if (typeof s.tempo === "number") setTempo(s.tempo);
      if (typeof s.stability === "number") setStability(s.stability);
      if (typeof s.clarity === "number") setClarity(s.clarity);
      if (typeof s.style === "number") setStyle(s.style);
      if (typeof s.speakerBoost === "boolean") setSpeakerBoost(s.speakerBoost);

      // 3) Generate TTS preview with the preset settings
      setStatus(`Generating preview for "${selectedPreset}"…`);
      const res = await fetchWithTimeout(`${base}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText, voice, userId })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const ab = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([ab], { type: "audio/mpeg" }));
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = url;
        audioRef.current.load();
        try { await audioRef.current.play(); } catch {}
      }
      setStatus(`Preview ready for "${selectedPreset}".`);
    } catch (e) {
      setStatus(`Preset failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function preview(): Promise<void> {
    try {
      setLoading(true);
      setStatus("Applying current sliders + preview…");
      if (!base) throw new Error("Enter API Base first");

      // push sliders first so preview matches UI
      await fetchWithTimeout(`${base}/api/set-voice-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, settings: { pitchSemi, tempo, stability, clarity, style, speakerBoost } })
      }).then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      });

      const res = await fetchWithTimeout(`${base}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText, voice, userId })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const ab = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([ab], { type: "audio/mpeg" }));
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = url;
        audioRef.current.load();
        try { await audioRef.current.play(); } catch {}
      }
      setStatus("Preview ready with current sliders.");
    } catch (e) {
      setStatus(`Preview failed: ${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const btnDisabled = loading;

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#eee", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Ellie – Voice Tuner</h1>
          <small style={{ color: "#aaa" }}>Presets (warm/bright/soft) + custom FX</small>
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
            <Field label="Base Voice (OpenAI)">
              <select
                value={voice}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setVoice(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 12 }}
              >
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>

            <Field label="Preset (server)">
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={selectedPreset}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPreset(e.target.value)}
                  style={{ flex: 1, padding: 10, borderRadius: 12 }}
                >
                  {presets.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { void applyPresetAndPreview(); }}
                  disabled={btnDisabled}
                  style={{ padding: "8px 14px", borderRadius: 12, background: "#fff", color: "#000", whiteSpace: "nowrap" }}
                >
                  Apply & Preview
                </button>
              </div>
            </Field>
          </div>

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
              Preview (Use sliders)
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
          Presets are applied on the server for this <code>userId</code>. Ellie’s base voice (e.g. <code>sage</code>) stays the same; presets change FX (pitch/EQ/dynamics/echo).
        </footer>
      </div>
    </div>
  );
}
