"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// hit our own domain so cookies are first-party
const toApi = (path: string) =>
  path.startsWith("/api") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;

const LEMON_MONTHLY_URL =
  "https://ellie-elite.lemonsqueezy.com/buy/8bcb0766-7f48-42cf-91ec-76f56c813c2a";
const LEMON_YEARLY_URL =
  "https://ellie-elite.lemonsqueezy.com/buy/63d6d95d-313f-44f8-ade3-53885b3457e4";

type MeResponse = { email: string | null; paid: boolean };
type LemonMessage = { event?: string; type?: string };

export default function PricingInner() {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [paidReady, setPaidReady] = useState(false);

  const emailRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const startPollingRef = useRef<(() => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(toApi("/auth/me"), { credentials: "include" });
        if (r.status === 401) {
          window.location.href = "/login?redirect=/pricing";
          return;
        }
        const j: MeResponse = await r.json();
        if (!j?.email) {
          window.location.href = "/login?redirect=/pricing";
          return;
        }
        emailRef.current = j.email;
        if (j?.paid) {
          setPaidReady(true);
          setStatusMsg("Your subscription is active.");
        }
      } catch {
        window.location.href = "/login?redirect=/pricing";
      }
    })();
  }, []);

  const goChat = useCallback(() => {
    setRedirecting(true);
    window.location.href = "/chat";
  }, []);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const checkPaidOnce = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(toApi("/auth/me"), { credentials: "include" });
      if (r.status === 401) return false;
      const j: MeResponse = await r.json();
      if (j?.email) emailRef.current = j.email;
      if (j?.paid) {
        setPaidReady(true);
        setStatusMsg("Payment confirmed! You can open chat now.");
        return true;
      }
    } catch {}
    return false;
  }, []);

  const beginPolling = useCallback(() => {
    stopPolling();
    const started = Date.now();
    const tick = async () => {
      const ok = await checkPaidOnce();
      if (ok) {
        stopPolling();
        return;
      }
      if (Date.now() - started > 3 * 60 * 1000) {
        stopPolling();
        setStatusMsg(null);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 1500);
  }, [checkPaidOnce]);

  useEffect(() => {
    startPollingRef.current = beginPolling;
    checkPaidOnce().catch(() => {});
    return () => {
      startPollingRef.current = null;
      stopPolling();
    };
  }, [beginPolling, checkPaidOnce]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const okOrigin =
        typeof ev.origin === "string" &&
        (ev.origin.includes("lemonsqueezy.com") || ev.origin === window.location.origin);
      if (!okOrigin) return;

      const data: unknown = ev.data;
      if (!data || typeof data !== "object") return;

      const maybe = data as LemonMessage;
      const evt = maybe.event ?? maybe.type;
      if (evt === "checkout_success" || evt === "lemon_checkout_success") {
        setStatusMsg("Activating your plan…");
        beginPolling();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [beginPolling]);

  const withLockedEmail = (baseUrl: string) => {
    try {
      const u = new URL(baseUrl);
      const email = emailRef.current;
      if (email) {
        u.searchParams.set("checkout[email]", email);
        u.searchParams.set("checkout[lock_email]", "true");
        u.searchParams.set("checkout[custom][email]", email);
      }
      return u.toString();
    } catch {
      return baseUrl;
    }
  };

  const openLemonAndPoll =
    (url: string) =>
    async (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      e.preventDefault();
      setStatusMsg(null);
      await checkPaidOnce();
      const finalUrl = withLockedEmail(url);
      try {
        window.open(finalUrl, "_blank", "noopener,noreferrer");
      } catch {
        window.location.href = finalUrl;
      }
      startPollingRef.current?.();
    };

  // Nebula background
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl =
      canvas.getContext("webgl2", {
        antialias: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      }) || null;

    const ensureSize = () => {
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };
    ensureSize();

    if (!gl) {
      canvas.style.background =
        "radial-gradient(1800px circle at 60% 70%, #120824, #060214 55%, #03010b 85%)";
      return;
    }

    const VERT = `#version 300 es
    precision highp float; layout (location=0) in vec2 pos; out vec2 vUv;
    void main(){ vUv=pos*0.5+0.5; gl_Position=vec4(pos,0.0,1.0);} `;
    const FRAG = `#version 300 es
    precision highp float; out vec4 fragColor; in vec2 vUv; uniform float u_time; uniform float u_ratio;
    float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y);}
    float n(vec2 p){ vec2 i=floor(p),f=fract(p); float a=h(i),b=h(i+vec2(1,0)),c=h(i+vec2(0,1)),d=h(i+vec2(1,1)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
    float f(vec2 p){ float v=0.,a=.5; for(int i=0;i<6;i++){ v+=a*n(p); p*=2.02; a*=.5;} return v;}
    void main(){ vec2 uv=(vUv-.5); uv.x*=u_ratio; float t=u_time*.15; float neb=f(uv*1.6+vec2(t*.3,-t*.25));
      vec3 col=mix(vec3(.01,.01,.06), vec3(.46,.38,.95), smoothstep(.2,.85,neb)); fragColor=vec4(col,1.0);} `;
    const sh = (s: string, t: number, glctx: WebGL2RenderingContext) => {
      const x = glctx.createShader(t)!;
      glctx.shaderSource(x, s);
      glctx.compileShader(x);
      return x;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(VERT, gl.VERTEX_SHADER, gl));
    gl.attachShader(prog, sh(FRAG, gl.FRAGMENT_SHADER, gl));
    gl.linkProgram(prog);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRatio = gl.getUniformLocation(prog, "u_ratio");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener("resize", resize);
    resize();
    let start = 0;
    const frame = (t: number) => {
      if (!start) start = t;
      const sec = (t - start) / 1000;
      gl.useProgram(prog);
      gl.uniform1f(uTime, sec);
      gl.uniform1f(uRatio, canvas.width / Math.max(1, canvas.height));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {/* Centered “Open Chat” button */}
      {paidReady && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <button
            onClick={goChat}
            className="backdrop-blur-lg bg-white/10 border border-white/20 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg hover:bg-white/15 active:bg-white/20 transition"
          >
            Open Chat
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-white/90 text-black px-4 py-2 text-sm shadow-lg z-50">
          {statusMsg}
        </div>
      )}
      {redirecting && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-xl bg-white/90 text-black px-4 py-2 text-sm shadow-lg z-50">
          Taking you to Chat…
        </div>
      )}

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
              Pick a plan. As soon as your payment is active, you’ll see an
              <strong> “Open Chat” </strong> button below.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
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
        </div>
      </main>
    </div>
  );
}
