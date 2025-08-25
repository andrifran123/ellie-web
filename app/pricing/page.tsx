"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function PricingPage() {
  const qp = useSearchParams();
  const preEmail = qp.get("email") || "";
  const redirect = qp.get("redirect") || "/chat";

  const [email, setEmail] = useState(preEmail);
  const [msg, setMsg] = useState<string | null>(null);

  const checkout = async () => {
    setMsg(null);
    const r = await fetch(`${API}/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, redirect }),
    });
    const j = await r.json();
    if (j?.url) window.location.href = j.url;
    else setMsg(j?.message || "Could not start checkout");
  };

  const portal = async () => {
    const r = await fetch(`${API}/api/billing/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    const j = await r.json();
    if (j?.url) window.location.href = j.url;
    else setMsg(j?.message || "Could not open portal");
  };

  return (
    <main className="min-h-screen grid place-items-center text-white px-4">
      <div className="glass rounded-2xl p-6 w-full max-w-2xl border border-white/10">
        <h1 className="text-3xl font-bold">Ellie Plus</h1>
        <p className="text-white/70 mt-2">Unlimited chat & lifelike calls.</p>

        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-semibold">Monthly</div>
            <div className="text-3xl font-bold mt-2">$9.99</div>
            <ul className="text-sm text-white/70 mt-3 space-y-1">
              <li>• Unlimited texting</li>
              <li>• Voice calls</li>
              <li>• Memory & mood</li>
              <li>• Cancel anytime</li>
            </ul>

            <input
              placeholder="you@example.com" value={email}
              onChange={(e)=>setEmail(e.target.value)}
              className="mt-4 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none"
            />
            <button
              onClick={checkout} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
              className="mt-3 w-full rounded-lg bg-white text-black font-semibold px-4 py-2 disabled:opacity-60"
            >
              Continue to payment
            </button>
            <button
              onClick={portal}
              className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm"
            >
              Manage subscription
            </button>
            {msg && <div className="mt-3 text-sm text-white/80">{msg}</div>}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-semibold">What you get</div>
            <ul className="mt-3 text-white/80 space-y-2 text-sm">
              <li>• Ellie remembers you naturally</li>
              <li>• Mood-aware replies</li>
              <li>• High-quality voice</li>
              <li>• Priority compute</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
