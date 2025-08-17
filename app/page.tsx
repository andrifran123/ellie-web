'use client';

import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'assistant' | 'user'; content: string };

// Backend base URL (empty string = use Next.js rewrite /api/*)
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  '';

const USER_ID = 'andri'; // keep a stable id

/* ──────────────────────────────────────────────────────────────
   Helpers to call your backend
   ────────────────────────────────────────────────────────────── */
async function sendToEllie(userInput: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userInput, userId: USER_ID }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text}`);
  }

  const data: { reply?: string } = await res.json();
  if (!data || typeof data.reply !== 'string') {
    throw new Error('Bad response shape');
  }
  return data.reply;
}

async function resetConversation(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID }),
    });
  } catch {
    /* ignore */
  }
}

/* ──────────────────────────────────────────────────────────────
   Voice helpers (upload mic → STT → chat → TTS → play)
   ────────────────────────────────────────────────────────────── */
async function ttsToAudioBuffer(text: string): Promise<AudioBuffer> {
  const res = await fetch(`${API_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // voice is set to "sage" on the server; sending blank is fine
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('TTS failed');
  const arrayBuf = await res.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx.decodeAudioData(arrayBuf);
}

async function playBuffer(buf: AudioBuffer): Promise<void> {
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start(0);
  await new Promise<void>((resolve) => {
    src.onended = () => resolve();
  });
}

async function recordOnce(stream: MediaStream, ms: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const rec = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    rec.onerror = () => reject(new Error('Recorder error'));
    rec.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    rec.start();

    setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, ms);
  });
}

async function transcribe(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'clip.webm');
  const res = await fetch(`${API_URL}/api/upload-audio`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Transcription failed');
  const data: { text?: string } = await res.json();
  return data.text ?? '';
}

/* ──────────────────────────────────────────────────────────────
   React component
   ────────────────────────────────────────────────────────────── */
export default function Page() {
  // chat (text) state
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: `Hey there! 😊 How’s it going, Andri?` },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // voice mode state
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceLoopOnRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // auto-scroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  /* ───────── text chat handlers ───────── */
  async function handleSend(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    setBannerError(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setIsSending(true);

    try {
      const reply = await sendToEllie(text);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error(err);
      setBannerError(`Couldn't reach Ellie. Is your API URL correct and running?`);
      setMessages((m) => [...m, { role: 'assistant', content: 'Oops—API error.' }]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleReset() {
    setBannerError(null);
    setMessages([{ role: 'assistant', content: `Hey there! 😊 How’s it going, Andri?` }]);
    await resetConversation();
  }

  /* ───────── voice mode (continuous) ───────── */
  async function startVoiceLoop(): Promise<void> {
    // request mic
    if (!mediaStreamRef.current) {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    voiceLoopOnRef.current = true;

    // greeting (audio)
    try {
      const greet = await ttsToAudioBuffer(`Hi Andri. Voice mode is on. Just talk, and I’ll answer. Say "stop" or switch the toggle to turn me off.`);
      await playBuffer(greet);
    } catch (e) {
      console.error(e);
    }

    // loop: record → transcribe → chat → tts → play
    while (voiceLoopOnRef.current) {
      try {
        const stream = mediaStreamRef.current!;
        const chunk = await recordOnce(stream, 5000); // ~5s clip
        const text = (await transcribe(chunk)).trim();

        if (!text) {
          // no speech detected; keep listening
          continue;
        }

        // small “stop” voice command
        if (/^\s*(stop|turn off|quit)\s*$/i.test(text)) {
          break;
        }

        const reply = await sendToEllie(text);
        const buf = await ttsToAudioBuffer(reply);
        await playBuffer(buf);
      } catch (err) {
        console.error('voice loop error:', err);
        // surface the error once
        setBannerError('Voice error. Check mic permissions and reload.');
        break;
      }
    }

    // clean up
    voiceLoopOnRef.current = false;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  function stopVoiceLoop(): void {
    voiceLoopOnRef.current = false;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  async function handleToggleVoice(nextOn: boolean): Promise<void> {
    setVoiceMode(nextOn);
    setBannerError(null);

    if (nextOn) {
      // switch UI into “call mode” by clearing messages
      setMessages([]);
      await startVoiceLoop();
      // when the loop exits (user said stop or toggled off), flip toggle off in UI
      setVoiceMode(false);
    } else {
      stopVoiceLoop();
      // leave “call mode” back to text intro
      setMessages([{ role: 'assistant', content: `Hey there! 😊 How’s it going, Andri?` }]);
    }
  }

  /* ───────── UI ───────── */
  return (
    <main className="min-h-screen bg-[#0b0e14] text-white flex flex-col items-center py-8">
      <div className="w-full max-w-3xl px-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Ellie</h1>

          <div className="flex items-center gap-3">
            {/* Voice toggle */}
            <label className="flex items-center gap-2 text-sm">
              <span className="opacity-80">Voice mode</span>
              <button
                type="button"
                onClick={() => handleToggleVoice(!voiceMode)}
                className={`w-[56px] h-[32px] rounded-full relative transition
                  ${voiceMode ? 'bg-green-500/80' : 'bg-white/15'}`}
                aria-pressed={voiceMode}
                aria-label="Toggle voice mode"
              >
                <span
                  className={`absolute top-1 left-1 w-[28px] h-[28px] rounded-full bg-white transition-transform
                    ${voiceMode ? 'translate-x-[24px]' : 'translate-x-0'}`}
                />
              </button>
            </label>

            {/* Reset button (hidden in voice call mode) */}
            {!voiceMode && (
              <button
                onClick={handleReset}
                className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 transition"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {bannerError && (
          <div className="mb-4 rounded-xl bg-red-900/40 text-red-200 px-4 py-3">
            {bannerError}
          </div>
        )}

        {/* Call mode screen (no text bubbles) */}
        {voiceMode ? (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-8 h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="text-3xl mb-2">🎧 Voice call with Ellie</div>
            <div className="text-white/70">
              Speak naturally. I’ll reply out loud. Say <em>“stop”</em> or toggle off to end.
            </div>
            <div className="mt-6 animate-pulse text-white/60">Listening…</div>
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              className="rounded-2xl bg-white/5 border border-white/10 p-4 h-[60vh] overflow-y-auto"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="text-sm text-white/60 mt-2">Ellie is typing...</div>
              )}
            </div>

            <form onSubmit={handleSend} className="mt-4 flex gap-2">
              <input
                value={input}
                onChange={(ev) => setInput(ev.target.value)}
                placeholder="Say something…"
                className="flex-1 rounded-xl px-4 py-3 bg-white/10 border border-white/10 outline-none focus:border-white/30"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="rounded-xl px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition"
              >
                Send
              </button>
            </form>

            {/* tiny debug footer */}
            <div className="mt-3 text-xs text-white/40">
              Using API:{' '}
              <code className="text-white/60">
                {API_URL ? `${API_URL}/api` : '/api (rewrite)'}
              </code>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
