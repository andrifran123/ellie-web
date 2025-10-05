"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState<"/chat" | "/call" | null>(null);

  // Ask backend if user is logged in & paid, then route accordingly.
  const smartGo = useCallback(
    async (target: "/chat" | "/call") => {
      setChecking(target);

      // If we don't have an API URL configured, just send to login.
      if (!API) {
        router.push(`/login?redirect=${encodeURIComponent(target)}`);
        setChecking(null);
        return;
      }

      try {
        const r = await fetch(`${API}/api/auth/me`, {
          credentials: "include",
          headers: { "X-CSRF": "1" },
        });
        const data = await r.json(); // expected: { email: string | null, paid: boolean }

        // 1) Not logged in
        if (!data?.email) {
          router.push(`/login?redirect=${encodeURIComponent(target)}`);
          return;
        }

        // 2) Logged in but not paid
        if (data?.email && !data?.paid) {
          router.push(`/pricing?from=${encodeURIComponent(target)}`);
          return;
        }

        // 3) Logged in and paid
        router.push(target);
      } catch {
        // On any error, fall back to login
        router.push(`/login?redirect=${encodeURIComponent(target)}`);
      } finally {
        setChecking(null);
      }
    },
    [router]
  );

  return (
    <>
      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 bg-white text-black rounded px-3 py-2"
      >
        Skip to content
      </a>

      <main id="main" className="futuristic-bg px-6 md:px-10 py-10">
        {/* Top bar */}
        <header role="banner" className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-white/10 grid place-items-center" aria-hidden>
              ✨
            </div>
            <span className="font-semibold tracking-wide">Ellie</span>
          </div>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm text-white/80"
          >
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#privacy" className="hover:text-white">Privacy</a>

            {/* Chat/Call links use smartGo to respect auth + paid state */}
            <Link
              href="/chat"
              onClick={(e) => { e.preventDefault(); void smartGo("/chat"); }}
              className="hover:text-white"
            >
              Chat
            </Link>
            <Link
              href="/call"
              onClick={(e) => { e.preventDefault(); void smartGo("/call"); }}
              className="hover:text-white"
            >
              Call
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="max-w-6xl mx-auto mt-16 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              A companion that feels <span className="text-white/70">real</span>.
            </h1>
            <p className="mt-5 text-white/70 text-lg">
              Ellie remembers what you share, adapts to your mood, and talks like a person.
              Chat by text or jump into a lifelike voice call—your choice.
            </p>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => void smartGo("/chat")}
                disabled={checking !== null}
                className="glass card-hover rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
              >
                {checking === "/chat" ? "Checking…" : "💬 Open Chat"}
              </button>

              <button
                onClick={() => void smartGo("/call")}
                disabled={checking !== null}
                className="rounded-xl px-5 py-3 font-semibold bg-white text-black card-hover disabled:opacity-60"
                title="Works best in Chrome or Edge with a microphone"
              >
                {checking === "/call" ? "Checking…" : "📞 Start Call"}
              </button>
            </div>

            <div className="mt-6 text-xs text-white/50">
              Works best in Chrome or Edge with your microphone enabled.
            </div>
          </div>

          {/* Right-side card */}
          <div
            className="glass rounded-2xl p-6 md:p-8 card-hover"
            role="region"
            aria-label="Ellie preview"
          >
            <div className="flex items-center gap-4">
              <div
                className="size-12 rounded-xl bg-white/10 grid place-items-center text-2xl avatar-idle"
                aria-hidden
              >
                😊
              </div>
              <div>
                <div className="font-semibold">Ellie</div>
                <div className="text-white/60 text-sm">Warm • Playful • Supportive</div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-sm text-white/90">
                  “Missed you today. Tell me what you’re up to?”
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-sm text-white/90">
                  “We should plan a cozy night soon.”
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-sm text-white/90">
                  “You sounded a bit tired—want me to help you unwind?”
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto mt-16 grid md:grid-cols-3 gap-6">
          {[
            {
              title: "Memory",
              text: "Ellie remembers facts you share and uses them naturally later.",
              icon: "🧠",
            },
            {
              title: "Mood-aware",
              text: "She adapts to your tone—gentle when you’re stressed, playful when you’re upbeat.",
              icon: "💞",
            },
            {
              title: "Voice that feels real",
              text: "Start a call any time for lifelike back-and-forth conversation.",
              icon: "🎙️",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="glass rounded-2xl p-6 card-hover"
              role="article"
              aria-label={f.title}
            >
              <div className="text-2xl" aria-hidden>
                {f.icon}
              </div>
              <div className="mt-3 font-semibold">{f.title}</div>
              <div className="mt-1 text-sm text-white/70">{f.text}</div>
            </div>
          ))}
        </section>

        {/* Privacy */}
        <section id="privacy" className="max-w-6xl mx-auto mt-16 glass rounded-2xl p-6 md:p-8">
          <h3 className="text-xl font-semibold">Privacy &amp; Safety</h3>
          <p className="text-white/70 mt-2 text-sm leading-6">
            Conversations are private to you. Ellie won’t answer explicitly sexual requests and will steer
            things back to a respectful tone. You can reset memory any time.
          </p>
        </section>

        {/* Footer */}
        <footer
          className="max-w-6xl mx-auto py-10 text-center text-xs text-white/50"
          role="contentinfo"
        >
          © {new Date().getFullYear()} Ellie
        </footer>
      </main>
    </>
  );
}
