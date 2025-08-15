'use client';

import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'assistant' | 'user'; content: string };

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  ''; // empty = use /api/* via next.config.ts rewrite

const USER_ID = 'andri'; // keep a stable id

async function sendToEllie(userInput: string) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userInput, userId: USER_ID }), // <-- exact shape the API expects
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as { reply?: string };
  if (!data || typeof data.reply !== 'string') {
    throw new Error('Bad response shape');
  }
  return data.reply;
}

async function resetConversation() {
  await fetch(`${API_URL}/api/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID }),
  }).catch(() => {});
}

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: `Hey there! 😊 How’s it going, Andri?` },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // auto-scroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
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

  return (
    <main className="min-h-screen bg-[#0b0e14] text-white flex flex-col items-center py-8">
      <div className="w-full max-w-3xl px-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Ellie</h1>
          <button
            onClick={handleReset}
            className="rounded-xl px-4 py-2 bg-white/10 hover:bg-white/20 transition"
          >
            Reset
          </button>
        </div>

        {bannerError && (
          <div className="mb-4 rounded-xl bg-red-900/40 text-red-200 px-4 py-3">
            {bannerError}
          </div>
        )}

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
            onChange={(e) => setInput(e.target.value)}
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

        {/* Optional tiny debug footer so you can see which API base is used */}
        <div className="mt-3 text-xs text-white/40">
          Using API:{' '}
          <code className="text-white/60">
            {API_URL ? `${API_URL}/api` : '/api (rewrite)'}
          </code>
        </div>
      </div>
    </main>
  );
}
