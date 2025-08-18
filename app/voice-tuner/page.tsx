"use client";

import { useState } from "react";

export default function VoiceTuner() {
  const [apiBase, setApiBase] = useState(
    typeof window !== "undefined" ? localStorage.getItem("ellie_api_base") || "" : ""
  );
  const [userId, setUserId] = useState(
    typeof window !== "undefined" ? localStorage.getItem("ellie_user_id") || "default-user" : "default-user"
  );
  const [settings, setSettings] = useState({
    pitch: 0,
    tempo: 1.0,
    stability: 0.75,
    clarity: 0.6,
    style: 0.2,
    loudness: false,
  });
  const [previewText, setPreviewText] = useState("Hi, it’s Ellie. Let’s see how this voice sounds.");
  const [audioUrl, setAudioUrl] = useState("");
  const [status, setStatus] = useState("");

  const updateSetting = (field: string, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const saveSettings = async () => {
    try {
      await fetch(`${apiBase}/api/voice-settings/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setStatus("✅ Settings saved");
    } catch (e) {
      setStatus("❌ Failed to save");
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch(`${apiBase}/api/voice-settings/${userId}`);
      const data = await res.json();
      setSettings(data);
      setStatus("✅ Settings loaded");
    } catch (e) {
      setStatus("❌ Failed to load");
    }
  };

  const previewVoice = async () => {
    try {
      setStatus("Generating preview...");
      const res = await fetch(`${apiBase}/api/voice-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, settings, text: previewText }),
      });

      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      setStatus("✅ Preview ready");
    } catch (e) {
      setStatus("❌ Preview failed");
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>🎙️ Ellie Voice Tuner</h1>

      <div>
        <label>API Base URL:</label>
        <input
          type="text"
          value={apiBase}
          onChange={(e) => {
            setApiBase(e.target.value);
            localStorage.setItem("ellie_api_base", e.target.value);
          }}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label>User ID:</label>
        <input
          type="text"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            localStorage.setItem("ellie_user_id", e.target.value);
          }}
          style={{ width: "100%" }}
        />
      </div>

      <hr />

      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.loudness}
            onChange={(e) => updateSetting("loudness", e.target.checked)}
          />
          Enhance loudness
        </label>
      </div>

      <div>
        <label>Pitch (semitones)</label>
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={settings.pitch}
          onChange={(e) => updateSetting("pitch", Number(e.target.value))}
        />
        {settings.pitch}
      </div>

      <div>
        <label>Tempo</label>
        <input
          type="range"
          min="1"
          max="2"
          step="0.01"
          value={settings.tempo}
          onChange={(e) => updateSetting("tempo", Number(e.target.value))}
        />
        {settings.tempo.toFixed(2)}
      </div>

      <div>
        <label>Stability</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.stability}
          onChange={(e) => updateSetting("stability", Number(e.target.value))}
        />
        {settings.stability.toFixed(2)}
      </div>

      <div>
        <label>Clarity</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.clarity}
          onChange={(e) => updateSetting("clarity", Number(e.target.value))}
        />
        {settings.clarity.toFixed(2)}
      </div>

      <div>
        <label>Style</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.style}
          onChange={(e) => updateSetting("style", Number(e.target.value))}
        />
        {settings.style.toFixed(2)}
      </div>

      <hr />

      <div>
        <label>Preview Text</label>
        <textarea
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          rows={3}
          style={{ width: "100%" }}
        />
      </div>

      <button onClick={previewVoice}>Preview</button>
      <button onClick={saveSettings}>Save Settings</button>
      <button onClick={loadSettings}>Load Current</button>

      <p>Status: {status}</p>

      {audioUrl && <audio controls src={audioUrl}></audio>}
    </main>
  );
}
