// app/login/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// FE cookie helper for middleware hints (backend also sets httpOnly session)
function setFeCookie(name: string, value: string, maxAgeDays: number) {
  const max = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${value}; Path=/; Max-Age=${max}; SameSite=Lax; Secure`;
}

export default function LoginPage() {
  const router = useRouter();
  const qp = useSearchParams();

  const redirect = qp.get("redirect") || "/chat";
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, bounce to redirect
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/auth/me`, { credentials: "include" });
        const j: { email?: string | null; paid?: boolean } = await r.json();
        if (j?.email) {
          setFeCookie("fe_session", "1", 90);
          if (j.paid) setFeCookie("fe_paid", "1", 90);
          router.replace(redirect);
        }
      } catch {}
    })();
  }, [router, redirect]);

  const start = async () => {
    setMsg(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setMsg("Enter a valid email.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const j: { ok?: boolean; message?: string } = await r.json();
      if (j?.ok) {
        setStage("code");
        setMsg("We emailed you a 6-digit code.");
      } else {
        setMsg(j?.message || "Could not send code.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setMsg(null);
    if (!/^\d{6}$/.test(code)) {
      setMsg("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const j: { ok?: boolean; paid?: boolean; message?: string } = await r.json();
      if (j?.ok) {
        // FE hints for middleware (real session is httpOnly cookie from backend)
        setFeCookie("fe_session", "1", 90);
        if (j.paid) setFeCookie("fe_paid", "1", 90);
        router.replace(redirect);
      } else {
        setMsg(j?.message || "Invalid code.");
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center text-white px-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md border border-white/10">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-white/70 mt-2 text-sm">
          Use your email to get a one-time 6-digit code.
        </p>

        {stage === "email" && (
          <div className="mt-5 space-y-3">
            <input
              autoFocus
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
            />
            <button
              onClick={start}
              disabled={loading}
              className="w-full rounded-lg bg-white text-black font-semibold px-4 py-2 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send code"}
            </button>
          </div>
        )}

        {stage === "code" && (
          <div className="mt-5 space-y-3">
            <input
              autoFocus
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 tracking-widest text-center text-lg outline-none"
            />
            <button
              onClick={verify}
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg bg-white text-black font-semibold px-4 py-2 disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              onClick={() => setStage("email")}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm"
            >
              ← Use a different email
            </button>
          </div>
        )}

        {msg && <div className="mt-4 text-sm text-white/80">{msg}</div>}
      </div>
    </main>
  );
}
