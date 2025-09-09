// app/pricing/pricing-inner.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type MeResponse = { email: string | null; paid: boolean };
type StartResp = { ok?: boolean; message?: string };
type VerifyResp = { ok?: boolean; paid?: boolean; message?: string };

export default function PricingInner() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse>({ email: null, paid: false });

  // If already logged in, we’ll show the "Manage/Go to chat" state.
  useEffect(() => {
    if (!API) return;
    fetch(`${API}/api/auth/me`, {
      credentials: "include",
      headers: { "X-CSRF": "1" },
    })
      .then((r) => r.json())
      .then((m: MeResponse) => {
        setMe(m);
        if (m.email) setStep("done");
      })
      .catch(() => {});
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
        credentials: "include", // <-- IMPORTANT for session cookie
        headers: { "Content-Type": "application/json", "X-CSRF": "1" },
        body: JSON.stringify({ email: e, code: c }), // MUST include same email
      });
      const data: VerifyResp = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || "Invalid or expired code.");
        return;
      }
      // You are now logged in; go instantly (no reload needed)
      if (data.paid) {
        location.href = "/chat";
      } else {
        location.href = "/pricing";
      }
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function resetEmail() {
    setErr(null);
    setCode("");
    setStep("email");
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Left: plan + auth */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="text-sm text-white/80">Monthly</div>
        <div className="text-3xl font-bold mt-1">$9.99</div>
        <ul className="mt-3 space-y-1 text-sm text-white/70">
          <li>• Unlimited texting</li>
          <li>• Voice calls</li>
          <li>• Memory & mood</li>
          <li>• Cancel anytime</li>
        </ul>

        {/* Auth box */}
        <div className="mt-5 space-y-3">
          {!me.email && step === "email" && (
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

          {!me.email && step === "code" && (
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
              <button
                onClick={resetEmail}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
              >
                ← Use a different email
              </button>
              <div className="text-xs text-white/50">We emailed you a 6-digit code.</div>
            </>
          )}

         {(me.email || step === "done") && (
  <>
    <div className="text-sm text-white/80">
      Signed in as <span className="font-medium">{me.email ?? email}</span>
    </div>

    {me.paid ? (
      <>
        <Link
          href="/chat"
          className="w-full inline-block text-center rounded-lg bg-white text-black font-semibold px-3 py-2"
        >
          Go to Chat
        </Link>
        <Link
          href="/call"
          className="w-full inline-block text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2"
        >
          Start Call
        </Link>
      </>
    ) : (
      <>
        <button
          disabled
          className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 opacity-60 cursor-not-allowed"
        >
          Go to Chat
        </button>
        <button
          disabled
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 opacity-60 cursor-not-allowed"
        >
          Start Call
        </button>
        <div className="text-xs text-white/60 mt-2">
          You need Ellie Plus to enter chat or call.
        </div>
      </>
    )}
  </>
)}



          {err && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>
      </div>

      {/* Right: features */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="text-sm font-semibold mb-2">What you get</div>
        <ul className="space-y-2 text-sm text-white/80">
          <li>• Ellie remembers you naturally</li>
          <li>• Mood-aware replies</li>
          <li>• High-quality voice</li>
          <li>• Priority compute</li>
        </ul>
      </div>
    </div>
  );
}
