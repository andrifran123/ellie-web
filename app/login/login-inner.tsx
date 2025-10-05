// app/login/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type StartResp = { ok?: boolean; message?: string };
type VerifyResp = { ok?: boolean; paid?: boolean; message?: string };
type MeResponse = { email: string | null; paid: boolean };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse>({ email: null, paid: false });

  // figure out where we should go after login
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const dest = params?.get("redirect") || "/chat";

  // If already logged in, decide where to send them.
  useEffect(() => {
    if (!API) return;
    fetch(`${API}/api/auth/me`, {
      credentials: "include",
      headers: { "X-CSRF": "1" },
    })
      .then((r) => r.json())
      .then((m: MeResponse) => {
        setMe(m);
        if (m.email) {
          // already signed in
          if (m.paid) {
            location.href = dest;
          } else {
            location.href = `/pricing?redirect=${encodeURIComponent(dest)}`;
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendCode() {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setErr("Enter a valid email.");
    if (!API) return setErr("Missing NEXT_PUBLIC_API_URL");

    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF": "1" },
        body: JSON.stringify({ email: e }),
      });
      const data: StartResp = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || "Could not send code.");
        return;
      }
      setStep("code");
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setErr(null);
    const e = email.trim().toLowerCase();
    const c = code.trim();
    if (!c) return setErr("Enter the 6-digit code.");
    if (!API) return setErr("Missing NEXT_PUBLIC_API_URL");

    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF": "1" },
        body: JSON.stringify({ email: e, code: c }),
      });
      const data: VerifyResp = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || "Invalid or expired code.");
        return;
      }

      // ✅ route by paid
      if (data.paid) {
        location.href = dest;
      } else {
        location.href = `/pricing?redirect=${encodeURIComponent(dest)}`;
      }
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="futuristic-bg px-6 md:px-10 py-10">
      <div className="max-w-md mx-auto glass rounded-2xl p-6 md:p-8">
        <div className="text-lg font-semibold">Log in</div>
        <div className="text-sm text-white/70">Use your email and a 6-digit code.</div>

        <div className="mt-5 space-y-3">
          {step === "email" && (
            <>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
                type="email"
                autoComplete="email"
              />
              <button
                disabled={loading}
                onClick={sendCode}
                className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send code"}
              </button>
            </>
          )}

          {step === "code" && (
            <>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 tracking-widest text-center outline-none"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <button
                disabled={loading}
                onClick={verifyCode}
                className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify & continue"}
              </button>
              <div className="text-xs text-white/50">We emailed you a 6-digit code.</div>
            </>
          )}

          {err && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-white/60">
          <Link href="/" className="underline">← Back home</Link>
        </div>
      </div>
    </main>
  );
}
