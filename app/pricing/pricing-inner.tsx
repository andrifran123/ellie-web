"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * IMPORTANT:
 * - Use a configurable API base so cookies go to the API origin when needed.
 * - If NEXT_PUBLIC_API_BASE is empty, we fall back to relative /api paths.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

const toApiUrl = (path: string) => {
  const normalized = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
};

/** Your Lemon URLs */
const LEMON_MONTHLY_URL =
  "https://ellie-elite.lemonsqueezy.com/buy/8bcb0766-7f48-42cf-91ec-76f56c813c2a";
const LEMON_YEARLY_URL =
  "https://ellie-elite.lemonsqueezy.com/buy/63d6d95d-313f-44f8-ade3-53885b3457e4";

export default function PricingInner() {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // store logged-in email so we can lock it in Lemon checkout
  const emailRef = useRef<string | null>(null);

  // polling book-keeping
  const pollRef = useRef<number | null>(null);
  const startPollingRef = useRef<(() => void) | null>(null);

  // nebula canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ───────────────────────── helpers ─────────────────────────
  const goChat = useCallback(() => {
    setRedirecting(true);
    window.location.href = "/chat";
  }, []);

  const checkPaidOnce = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(toApiUrl("/auth/me"), {
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
      const j = await r.json();

      // capture email for later (to prefill/lock Lemon checkout)
      if (j?.email) emailRef.current = j.email as string;

      if (j?.paid) {
        setStatusMsg("Payment confirmed. Taking you to Chat…");
        goChat();
        return true;
      }
    } catch {
      // ignore; we'll check again on next tick
    }
    return false;
  }, [goChat]);

  const beginPolling = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);

    const started = Date.now();
    const tick = async () => {
      const ok = await checkPaidOnce();
      if (ok) return;

      // stop after 3 minutes
      if (Date.now() - started > 3 * 60 * 1000) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setStatusMsg(null);
      }
    };

    // do an immediate check and then keep polling
    tick();
    pollRef.current = window.setInterval(tick, 1500);
  }, [checkPaidOnce]);

  useEffect(() => {
    startPollingRef.current = beginPolling;
    // prime emailRef (useful if they land here logged-in before clicking)
    checkPaidOnce().catch(() => {});
    return () => {
      startPollingRef.current = null;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [beginPolling, checkPaidOnce]);

  // Listen for Lemon's success postMessage (works if checkout is embedded).
  // We still start polling on click so new-tab checkout also works.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      try {
        const okOrigin =
          typeof ev.origin === "string" &&
          (ev.origin.includes("lemonsqueezy.com") ||
            ev.origin === window.location.origin);
        if (!okOrigin) return;
        const data = ev.data;
        if (!data || typeof data !== "object") return;

        if (
          (data as { event?: string; type?: string }).event === "checkout_success" ||
          (data as { event?: string; type?: string }).event === "lemon_checkout_success" ||
          (data as { event?: string; type?: string }).type === "lemon_checkout_success"
        ) {
          setStatusMsg("Activating your plan…");
          beginPolling();
        }
      } catch {
        /* noop */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [beginPolling]);

  /** Build a Lemon URL with the session email prefilled and locked */
  const withLockedEmail = (baseUrl: string) => {
    try {
      const u = new URL(baseUrl);
      const email = emailRef.current;
      if (email) {
        // Prefill & lock the email so the webhook’s email matches the session
        u.searchParams.set("checkout[email]", email);
        u.searchParams.set("checkout[lock_email]", "true");
        // Also include custom payload for our webhook fallback
        u.searchParams.set("checkout[custom][email]", email);
      }
      return u.toString();
    } catch {
      return baseUrl; // if URL parsing fails, fall back
    }
  };

  // click → open Lemon in new tab + silent polling
  const openLemonAndPoll =
    (url: string) =>
    async (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      e.preventDefault();
      setStatusMsg(null);

      // refresh email (in case the page sat for a while)
      await checkPaidOnce();

      const finalUrl = withLockedEmail(url);
      try {
        window.open(finalUrl, "_blank", "noopener,noreferrer");
      } catch {
        window.location.href = finalUrl;
      }
      startPollingRef.current?.();
    };

  // “Check my status” button
  const onCheckStatus = async () => {
    setStatusMsg("Checking your status…");
    const ok = await checkPaidOnce();
    if (!ok) setStatusMsg("No active subscription yet.");
  };

  // ───────────────────────── nebula bg ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl =
      canvas.getContext("webgl2", {
        antialias: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      }) || null;

    if (!gl) {
      canvas.style.background =
        "radial-gradient(1200px circle at 60% 70%, #120824, #060214 55%, #03010b 85%)";
      return;
    }

    const VERT = `#version 300 es
    precision highp float;
    layout (location = 0) in vec2 pos;
    out vec2 vUv;
    void main() {
      vUv = pos * 0.5 + 0.5;
      gl_Position = vec4(pos, 0.0, 1.0);
    }`;

    const FRAG = `#version 300 es
    precision highp float;
    out vec4 fragColor;
    in vec2 vUv;
    uniform float u_time;
    uniform vec2  u_res;
    uniform float u_ratio;
    uniform float u_dpr;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y);}
    float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1.0,0.0));
      float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f);
      return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
    float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.02; a*=0.5;} return v; }
    float starKernel(vec2 d,float sz){ float r=length(d); float core=smoothstep(sz,0.0,r); float glow=smoothstep(0.6,0.0,r/(sz*4.0)); return core*0.85+glow*0.35; }
    float starLayer(vec2 uv,float density,float size,float seed){
      float s=0.0; for(int i=0;i<36;i++){ float a=float(i)/36.0*6.2831853+seed; vec2 p=vec2(cos(a),sin(a))*0.5+uv;
        float n=fbm(p*12.0+seed); vec2 d=uv-p*(0.98+0.04*sin(seed*13.0)); s+=starKernel(d,size*(0.7+0.6*n)); }
      return s*density;
    }
    void main(){
      vec2 uv = (vUv - 0.5) * vec2(u_ratio, 1.0);
      float t = u_time * 0.15;
      float neb = fbm(uv*1.6 + vec2(t*0.3, -t*0.25));
      vec3 col = mix(vec3(0.01,0.01,0.06), vec3(0.46,0.38,0.95), smoothstep(0.2,0.85,neb));
      float stars = starLayer(uv*0.75, 0.08, 0.02, 1.3) + starLayer(uv*1.1, 0.06, 0.015, 2.7);
      col += vec3(stars*0.65);
      fragColor = vec4(col, 1.0);
    }`;

    const glsl = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader) || "shader compile error");
      }
      return shader;
    };

    const prog = gl.createProgram()!;
    const vs = glsl(gl.VERTEX_SHADER, VERT);
    const fs = glsl(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uRatio = gl.getUniformLocation(prog, "u_ratio");
    const uDpr = gl.getUniformLocation(prog, "u_dpr");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uRatio, canvas.width / canvas.height);
      gl.uniform1f(uDpr, dpr);
    };
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    resize();

    let start = 0;
    let raf = 0;
    const frame = (t: number) => {
      if (!start) start = t;
      const sec = (t - start) / 1000;
      gl.useProgram(prog);
      gl.uniform1f(uTime, sec);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    };
  }, []);

  // ───────────────────────── UI ─────────────────────────
  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {statusMsg ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-white/90 text-black px-4 py-2 text-sm shadow-lg z-50">
          {statusMsg}
        </div>
      ) : null}
      {redirecting ? (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 rounded-xl bg-white/90 text-black px-4 py-2 text-sm shadow-lg z-50">
          Taking you to Chat…
        </div>
      ) : null}

      <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-6xl">
          <div className="text-center mb-10">
            <h1
              className="text-5xl md:text-7xl font-extrabold tracking-tight"
              style={{ textShadow: "0 0 32px rgba(140,110,255,0.35)" }}
            >
              Pricing
            </h1>
            <p className="mt-3 text-white/70">
              Pick a plan. We’ll take you to Chat as soon as your payment is
              active.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Monthly */}
            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-6 shadow-[0_0_60px_rgba(120,80,255,0.15)]">
              <div className="text-xs font-semibold tracking-wide text-white/80">
                MONTHLY
              </div>
              <div className="mt-2 text-4xl font-bold">$9.99</div>
              <div className="mt-4 text-sm text-white/80">
                Unlimited chat and voice. Memory &amp; mood. Cancel anytime.
              </div>

              <div className="mt-6">
                <a
                  href={LEMON_MONTHLY_URL}
                  onClick={openLemonAndPoll(LEMON_MONTHLY_URL)}
                  className="inline-flex items-center justify-center rounded-xl bg-white text-black px-5 py-3 font-semibold hover:bg-white/90 transition"
                >
                  Get Monthly
                </a>
              </div>
            </div>

            {/* Yearly */}
            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-6 shadow-[0_0_60px_rgba(120,80,255,0.15)]">
              <div className="text-xs font-semibold tracking-wide text-white/80">
                YEARLY
              </div>
              <div className="mt-2 text-4xl font-bold">$89</div>
              <div className="mt-4 text-sm text-white/80">
                Two months free. All features included.
              </div>

              <div className="mt-6">
                <a
                  href={LEMON_YEARLY_URL}
                  onClick={openLemonAndPoll(LEMON_YEARLY_URL)}
                  className="inline-flex items-center justify-center rounded-xl bg-white text-black px-5 py-3 font-semibold hover:bg-white/90 transition"
                >
                  Get Yearly
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <button
              onClick={onCheckStatus}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
            >
              I already paid — check my status
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
