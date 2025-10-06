// app/login/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type StartResp = { ok?: boolean; message?: string };
type VerifyResp = { ok?: boolean; paid?: boolean; message?: string };
type SignupResp = { ok?: boolean; message?: string };
type MeResponse = { email: string | null; paid: boolean };

type Mode = "signin" | "signup";

export default function LoginPage() {
  // query params
  const [dest, setDest] = useState<string>("/chat");
  const [mode, setMode] = useState<Mode>("signin");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const redirect = p.get("redirect");
    const signup = p.get("signup");
    if (redirect) setDest(redirect);
    if (signup === "1") setMode("signup");
  }, []);

  // shared
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // current session (NO AUTO-REDIRECT)
  const [me, setMe] = useState<MeResponse>({ email: null, paid: false });
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
  if (!API) return;
  setLoadingMe(true);
  fetch(`${API}/api/auth/me`, {
    credentials: "include",
    headers: { "X-CSRF": "1" },
  })
    .then((r) => r.json())
    .then((m: MeResponse) => {
      setMe(m);
      if (m?.email) {
        // ensure middleware lets user through
        setAuthedCookie(true);
      }
    })
    .catch(() => setMe({ email: null, paid: false }))
    .finally(() => setLoadingMe(false));
}, []);

  // --- tiny UX cookie helpers (for middleware) ---
  function setAuthedCookie(on: boolean) {
    // Lax so it works for normal navigation; 90 days like the API cookie
    document.cookie = `ellie_authed=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${on ? 60 * 60 * 24 * 90 : 0}`;
  }

  async function signOut() {
    try {
      setLoading(true);
      await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" });
      setMe({ email: null, paid: false });
      setAuthedCookie(false); // clear UX flag so middleware will redirect next time
    } finally {
      setLoading(false);
    }
  }

  // sign in (magic code)
  const [siEmail, setSiEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  // sign up (name / email / password)
  const [name, setName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  async function sendCode() {
    setErr(null);
    const e = siEmail.trim().toLowerCase();
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");
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
    const e = siEmail.trim().toLowerCase();
    const c = code.trim();
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");
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
      // update UI session (no auto-redirect)
      setMe({ email: e, paid: !!data.paid });
      setStep("email");
      setCode("");
      setSiEmail("");

      // set UX flag so middleware won't bounce /chat or /call
      setAuthedCookie(true);

      // If you want immediate navigation, uncomment:
      // if (data.paid) location.href = dest;
      // else location.href = `/pricing?redirect=${encodeURIComponent(dest)}`;
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setErr(null);
    const n = name.trim();
    const e = suEmail.trim().toLowerCase();
    const p = password.trim();
    if (!n) return setErr("Enter your name.");
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");
    if (p.length < 8) return setErr("Password must be at least 8 characters.");
    if (!API) return setErr("Missing NEXT_PUBLIC_API_URL");

    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF": "1" },
        body: JSON.stringify({ name: n, email: e, password: p }),
      });
      const data: SignupResp = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || "Could not create account.");
        return;
      }
      // set UI session (likely not paid yet)
      setMe({ email: e, paid: false });
      setName("");
      setSuEmail("");
      setPassword("");

      // set UX flag so middleware won't bounce
      setAuthedCookie(true);

      // Optional: go to pricing immediately
      // location.href = `/pricing?redirect=${encodeURIComponent(dest)}`;
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="futuristic-bg min-h-screen px-6 md:px-10 py-10">
      <div className="max-w-5xl mx-auto">
        {/* Header like pricing */}
        <h1 className="text-center text-4xl md:text-6xl font-extrabold mb-10">welcome</h1>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Auth card */}
          <div className="glass rounded-2xl p-6 md:p-8 border border-white/10">
            {/* If signed in: show status + actions (NO AUTO-REDIRECT) */}
            {!loadingMe && me.email ? (
              <div className="space-y-4">
                <div className="text-sm text-white/80">
                  You’re signed in as <span className="font-semibold">{me.email}</span>
                  {me.paid ? " (active subscription)" : " (no active subscription)"}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Link
                    href={dest || "/chat"}
                    className="w-full text-center rounded-lg bg-white text-black font-semibold px-3 py-2"
                  >
                    Go to Chat
                  </Link>
                  {!me.paid ? (
                    <Link
                      href={`/pricing?redirect=${encodeURIComponent(dest || "/chat")}`}
                      onClick={() => setAuthedCookie(true)}
                      className="w-full text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                    >
                      Go to Pricing
                    </Link>
                  ) : (
                    <Link
                      href="/call"
			 onClick={() => setAuthedCookie(true)}
                      className="w-full text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                    >
                      Start Call
                    </Link>
                  )}
                </div>
                <button
                  onClick={signOut}
                  disabled={loading}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm disabled:opacity-60"
                >
                  {loading ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : (
              <>
                {/* Toggle */}
                <div className="flex items-center gap-2 bg-white/10 rounded-xl p-1 w-fit mx-auto">
                  <button
                    onClick={() => setMode("signin")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      mode === "signin" ? "bg-white text-black" : "text-white/80"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => setMode("signup")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      mode === "signup" ? "bg-white text-black" : "text-white/80"
                    }`}
                  >
                    Sign up
                  </button>
                </div>

                {/* Content */}
                <div className="mt-6 space-y-3 max-w-md mx-auto w-full">
                  {mode === "signin" ? (
                    <>
                      {step === "email" && (
                        <>
                          <label className="text-sm text-white/80">Email</label>
                          <input
                            value={siEmail}
                            onChange={(e) => setSiEmail(e.target.value)}
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
                          <label className="text-sm text-white/80">Enter 6-digit code</label>
                          <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="123456"
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
                            onClick={() => {
                              setStep("email");
                              setCode("");
                              setErr(null);
                            }}
                            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
                          >
                            ← Use a different email
                          </button>
                          <div className="text-xs text-white/60 text-center">
                            We emailed you a 6-digit code.
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="text-sm text-white/80">Name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
                        type="text"
                        autoComplete="name"
                      />

                      <label className="text-sm text-white/80">Email</label>
                      <input
                        value={suEmail}
                        onChange={(e) => setSuEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
                        type="email"
                        autoComplete="email"
                      />

                      <label className="text-sm text-white/80">Password</label>
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
                        type="password"
                        autoComplete="new-password"
                      />

                      <button
                        disabled={loading}
                        onClick={signUp}
                        className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 disabled:opacity-60"
                      >
                        {loading ? "Creating…" : "Create account"}
                      </button>
                    </>
                  )}

                  {err && (
                    <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                      {err}
                    </div>
                  )}

                  <div className="text-xs text-white/60 text-center mt-2">
                    <Link href="/" className="underline">
                      ← Back home
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right: “What you get” (mirrors pricing vibe) */}
          <div className="glass rounded-2xl p-6 md:p-8 border border-white/10">
            <div className="text-sm font-semibold mb-2">What you get</div>
            <ul className="space-y-2 text-sm text-white/80">
              <li>• Ellie remembers you naturally</li>
              <li>• Mood-aware replies</li>
              <li>• High-quality voice</li>
              <li>• Priority compute</li>
            </ul>

            <div className="mt-6 text-xs text-white/60">
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("signin")} className="underline">
                Sign in
              </button>
              . New here?{" "}
              <button type="button" onClick={() => setMode("signup")} className="underline">
                Create your account
              </button>
              .
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
