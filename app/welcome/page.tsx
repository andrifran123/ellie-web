// app/welcome/page.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

export default function WelcomePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    let w = 0, h = 0;
    let stars: Star[] = [];
    let hueBase = 220; // blue→purple space vibe

    type Star = {
      x: number;
      y: number;
      z: number;      // depth (0..1)
      r: number;      // radius
      vx: number;     // drift
      vy: number;
      tw: number;     // twinkle offset
    };

    function resize() {
      w = Math.floor(window.innerWidth);
      h = Math.floor(window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawnStars();
    }

    function rand(a: number, b: number) {
      return a + Math.random() * (b - a);
    }

    function spawnStars() {
      const count = Math.floor((w * h) / 4500); // density
      stars = new Array(count).fill(0).map(() => {
        const z = Math.pow(Math.random(), 1.5); // more near-depth for parallax
        return {
          x: rand(0, w),
          y: rand(0, h),
          z,
          r: rand(0.6, 1.8) * (1 + (1 - z) * 0.8),
          vx: rand(-0.02, 0.02) * (1 - z + 0.3),
          vy: rand(0.01, 0.06) * (1 - z + 0.3),
          tw: Math.random() * Math.PI * 2,
        };
      });
    }

    function gradientSpace() {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.6, 0, w * 0.5, h * 0.6, Math.max(w, h) * 0.8);
      g.addColorStop(0, `rgba(20,20,35,1)`);
      g.addColorStop(0.5, `rgba(6,6,18,1)`);
      g.addColorStop(1, `rgba(2,2,10,1)`);
      return g;
    }

    let t = 0;
    function frame() {
      t += 0.016;

      // Slight hue drift for aurora vibe
      hueBase = 220 + Math.sin(t * 0.05) * 10;

      // Paint space backdrop
      ctx.fillStyle = gradientSpace();
      ctx.fillRect(0, 0, w, h);

      // Soft nebula wisps
      for (let i = 0; i < 2; i++) {
        const ox = (Math.sin(t * 0.05 + i) * 0.5 + 0.5) * w;
        const oy = (Math.cos(t * 0.04 + i * 3) * 0.5 + 0.5) * h;
        const r = Math.max(w, h) * 0.35;
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        g.addColorStop(0, `rgba(${30 + i*10}, 0, 80, 0.08)`);
        g.addColorStop(1, `rgba(0, 0, 0, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Stars
      for (const s of stars) {
        // twinkle
        const tw = (Math.sin(t * 4 + s.tw) * 0.5 + 0.5) * 0.8 + 0.2;
        const alpha = 0.5 * tw;

        // glow
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hueBase + (1 - s.z) * 30}, 90%, ${70 + (1 - s.z) * 10}%, ${alpha * 0.35})`;
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx.fill();

        // core
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hueBase + (1 - s.z) * 30}, 95%, 85%, ${alpha})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        // drift (wrap)
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < -5) s.x = w + 5;
        if (s.x > w + 5) s.x = -5;
        if (s.y > h + 5) s.y = -5;
      }

      // Sparse “shooting star”
      if (Math.random() < 0.003) {
        const sx = rand(0, w);
        const sy = rand(0, h * 0.4);
        const len = rand(80, 160);
        const ang = rand(Math.PI * 0.75, Math.PI * 1.1);
        ctx.strokeStyle = `hsla(${hueBase + 20}, 100%, 70%, 0.55)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      {/* Background canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* Glassy grid overlay for subtle futurism */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 24px 24px",
        }}
      />

      {/* Content */}
      <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="max-w-3xl text-center">
          <div className="mb-6 inline-block rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs tracking-widest uppercase">
            welcome aboard
          </div>

          <h1
            className="text-5xl md:text-6xl font-extrabold leading-tight"
            style={{
              textShadow:
                "0 0 20px rgba(120,160,255,0.35), 0 0 40px rgba(160,100,255,0.2)",
            }}
          >
            Drift through the <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">stars</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Welcome to Ellie. Settle in, breathe, and let the void hum. We’ll take it from here.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className="rounded-2xl px-5 py-2.5 font-semibold bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:scale-[1.02] active:scale-[0.99] transition"
            >
              Enter Chat
            </Link>
            <Link
              href="/call"
              className="rounded-2xl px-5 py-2.5 font-semibold border border-white/20 bg-white/10 backdrop-blur hover:bg-white/15 transition"
            >
              Start a Call
            </Link>
            <Link
              href="/pricing"
              className="rounded-2xl px-5 py-2.5 font-semibold border border-white/20 bg-white/5 hover:bg-white/10 transition"
            >
              See Plans
            </Link>
          </div>

          {/* Tiny footer */}
          <div className="mt-10 text-xs text-white/50">
            Tip: bookmark this page — it’s soothing 💫
          </div>
        </div>
      </main>
    </div>
  );
}
