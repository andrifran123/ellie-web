"use client";

export default function Page() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Voice Tuner test</h1>
      <p>If you can see this, the /voice-tuner route is working ✅</p>
    </main>
  );
}


import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ Single-file React component for tuning Ellie's voice FX and previewing results.
// - Works against your existing Ellie API (Render)
// - Adjust pitch, tempo, clarity, stability, style, speaker boost
// - Choose TTS base voice (alloy, sage, etc.)
// - Preview speech and Save settings per userId
// - Apply named presets (natural, warm, bright, soft)
//
// How to use:
// 1) If you’re in a Next.js app, paste this file into /app/voice-tuner/page.tsx (or /pages/voice-tuner.tsx)
//    and export default the component below. If CRA/Vite, render <VoiceTuner /> anywhere.
// 2) Make sure your CORS_ORIGIN includes your Vercel domain on the Render backend.
// 3) Set API_BASE to your Render URL (e.g., https://ellie-api-1.onrender.com). You can also leave blank
//    to call same-origin if you’re hosting the tuner on the same domain as the API.

const VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"
];

const PRESETS = [
  { key: "natural", label: "Natural" },
  { key: "warm", label: "Warm" },
  { key: "bright", label: "Bright" },
  { key: "soft", label: "Soft" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <label className="font-medium text-sm">{label}</label>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Slider({ min, max, step, value, onChange }: { min: number; max: number; step: number; value: number; onChange: (v:number)=>void }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e)=>onChange(parseFloat(e.target.value))}
      className="w-full accent-black"
    />
  );
}

export default function VoiceTuner() {
  const [apiBase, setApiBase] = useState<string>(typeof window !== 'undefined' ? (localStorage.getItem('ellie_api_base') || '') : '');
  const [userId, setUserId] = useState<string>(typeof window !== 'undefined' ? (localStorage.getItem('ellie_user_id') || 'default-user') : 'default-user');
  const [voice, setVoice] = useState<string>('sage');

  // FX settings
  const [pitchSemi, setPitchSemi] = useState<number>(0); // -12..+12
  const [tempo, setTempo] = useState<number>(1.0);       // 0.5..2.0
  const [stability, setStability] = useState<number>(0.75); // 0..1
  const [clarity, setClarity] = useState<number>(0.6);      // 0..1 (air / treble)
  const [style, setStyle] = useState<number>(0.2);          // 0..1 (room/echo)
  const [speakerBoost, setSpeakerBoost] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [testText, setTestText] = useState<string>("Hi, it’s Ellie. Let’s see how this voice sounds.");

  const base = useMemo(() => {
    const b = apiBase?.trim();
    if (!b) return '';
    return b.endsWith('/') ? b.slice(0,-1) : b;
  }, [apiBase]);

  useEffect(() => {
    // Persist basic settings
    if (typeof window !== 'undefined') {
      localStorage.setItem('ellie_api_base', apiBase);
      localStorage.setItem('ellie_user_id', userId);
    }
  }, [apiBase, userId]);

  async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function fetchArrayBuffer(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(await res.text());
    return res.arrayBuffer();
  }

  async function loadFromServer() {
    try {
      setLoading(true);
      setStatus('Loading from server...');
      const data = await fetchJson(`${base || ''}/api/get-voice-settings?userId=${encodeURIComponent(userId)}`);
      if (data?.settings) {
        const s = data.settings;
        setPitchSemi(Number(s.pitchSemi ?? 0));
        setTempo(Number(s.tempo ?? 1));
        setStability(Number(s.stability ?? 0.75));
        setClarity(Number(s.clarity ?? 0.6));
        setStyle(Number(s.style ?? 0.2));
        setSpeakerBoost(!!s.speakerBoost);
      }
      setStatus('Loaded current user settings.');
    } catch (e:any) {
      setStatus(`Load failed: ${e?.message || e}`);
    } finally { setLoading(false); }
  }

  async function saveToServer() {
    try {
      setLoading(true);
      setStatus('Saving settings...');
      await fetchJson(`${base || ''}/api/set-voice-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          settings: { pitchSemi, tempo, stability, clarity, style, speakerBoost }
        })
      });
      setStatus('Saved! These FX will apply to future TTS/voice replies.');
    } catch (e:any) {
      setStatus(`Save failed: ${e?.message || e}`);
    } finally { setLoading(false); }
  }

  async function applyPreset(key: string) {
    try {
      setLoading(true);
      setStatus(`Applying preset: ${key}...`);
      const resp = await fetchJson(`${base || ''}/api/apply-voice-preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preset: key })
      });
      const s = resp?.settings;
      if (s) {
        setPitchSemi(Number(s.pitchSemi ?? 0));
        setTempo(Number(s.tempo ?? 1));
        setStability(Number(s.stability ?? 0.75));
        setClarity(Number(s.clarity ?? 0.6));
        setStyle(Number(s.style ?? 0.2));
        setSpeakerBoost(!!s.speakerBoost);
      }
      setStatus(`Preset "${key}" applied & saved.`);
    } catch (e:any) {
      setStatus(`Preset failed: ${e?.message || e}`);
    } finally { setLoading(false); }
  }

  async function preview() {
    try {
      setLoading(true);
      setStatus('Generating preview...');
      const ab = await fetchArrayBuffer(`${base || ''}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice, userId })
      });
      const blob = new Blob([ab], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
      setStatus('Preview ready.');
    } catch (e:any) {
      setStatus(`Preview failed: ${e?.message || e}`);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ellie – Voice Tuner</h1>
          <span className="text-xs text-neutral-500">Simple FX editor & TTS preview</span>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="API Base" hint="Render URL (e.g. https://ellie-api-1.onrender.com)">
            <input value={apiBase} onChange={e=>setApiBase(e.target.value)} placeholder="https://..." className="w-full rounded-xl border p-2 focus:outline-none focus:ring" />
          </Field>
          <Field label="User ID" hint="Settings are saved per-user in Postgres">
            <input value={userId} onChange={e=>setUserId(e.target.value)} className="w-full rounded-xl border p-2 focus:outline-none focus:ring" />
          </Field>
        </div>

        <div className="mt-6 grid gap-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base Voice">
              <select value={voice} onChange={e=>setVoice(e.target.value)} className="w-full rounded-xl border p-2">
                {VOICES.map(v=> <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Speaker Boost">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={speakerBoost} onChange={e=>setSpeakerBoost(e.target.checked)} />
                <span>Enhance loudness</span>
              </label>
            </Field>
          </div>

          <div className="grid gap-4">
            <Field label={`Pitch (semitones): ${pitchSemi}`} hint="-12 = deeper, +12 = brighter">
              <Slider min={-12} max={12} step={1} value={pitchSemi} onChange={setPitchSemi} />
            </Field>
            <Field label={`Tempo: ${tempo.toFixed(2)}`} hint="0.5–2.0 (pitch preserved)">
              <Slider min={0.5} max={2} step={0.01} value={tempo} onChange={setTempo} />
            </Field>
            <Field label={`Stability: ${stability.toFixed(2)}`} hint="More compression = steadier loudness">
              <Slider min={0} max={1} step={0.01} value={stability} onChange={setStability} />
            </Field>
            <Field label={`Clarity: ${clarity.toFixed(2)}`} hint="High-shelf / air">
              <Slider min={0} max={1} step={0.01} value={clarity} onChange={setClarity} />
            </Field>
            <Field label={`Style: ${style.toFixed(2)}`} hint="Room/echo vibe">
              <Slider min={0} max={1} step={0.01} value={style} onChange={setStyle} />
            </Field>
          </div>

          <div className="grid gap-3">
            <Field label="Preview Text">
              <textarea value={testText} onChange={e=>setTestText(e.target.value)} rows={3} className="w-full rounded-xl border p-2 focus:outline-none focus:ring" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={preview} disabled={loading || !base} className="rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50">Preview</button>
              <button onClick={saveToServer} disabled={loading || !base} className="rounded-2xl border px-4 py-2">Save Settings</button>
              <button onClick={loadFromServer} disabled={loading || !base} className="rounded-2xl border px-4 py-2">Load Current</button>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <span>Status:</span><span className="font-medium">{loading ? 'Working…' : status || 'Idle'}</span>
              </div>
            </div>
            <audio ref={audioRef} controls className="w-full" />
          </div>

          <div className="border-t pt-4">
            <div className="mb-2 text-sm font-medium">Quick Presets</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button key={p.key} onClick={()=>applyPreset(p.key)} disabled={loading || !base}
                  className="rounded-2xl bg-neutral-100 px-4 py-2 hover:bg-neutral-200 disabled:opacity-50">
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Applying a preset saves it server-side for this user. You can tweak sliders after applying to fine-tune.
            </p>
          </div>
        </div>

        <footer className="mt-6 text-xs text-neutral-500">
          Tip: set <code>ELLIE_VOICE=sage</code> in your backend env to keep Sage by default.
        </footer>
      </div>
    </div>
  );
}
