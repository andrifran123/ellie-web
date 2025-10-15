// app/login/login-inner.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

type StartResp = { ok?: boolean; message?: string };
type VerifyResp = { ok?: boolean; paid?: boolean; message?: string };
type MeResponse = { email: string | null; paid: boolean };
type Mode = "signin" | "signup";
type Flash = "none" | "signedin" | "signedup" | "signedout";

/* ─────────────────────────────────────────────────────────────
   Inline Nebula Background (full-screen)
   ───────────────────────────────────────────────────────────── */
function NebulaBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
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

    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){ vec2 i=floor(p),f=fract(p);
      float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
    }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }

    float starKernel(vec2 d, float sz){
      float r=length(d);
      float core=smoothstep(sz,0.,r);
      float glow=smoothstep(.6,0.,r/(sz*4.));
      return core*.85+glow*.35;
    }
    float starLayer(vec2 uv,float density,float size,float seed){
      float s=0.;
      for(int i=0;i<36;i++){
        float a=float(i)/36.*6.2831853+seed;
        vec2 p=vec2(cos(a),sin(a))*0.5+uv;
        float n=fbm(p*12.+seed);
        vec2 d=uv-p*(.98+.04*sin(seed*13.));
        s+=starKernel(d,size*(.7+.6*n));
      }
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

    const compile = (src: string, type: number) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(s) || "unknown";
        gl.deleteShader(s);
        throw new Error("Shader compile failed: " + info);
      }
      return s;
    };
    const link = (vs: WebGLShader, fs: WebGLShader) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "pos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(p) || "unknown";
        gl.deleteProgram(p);
        throw new Error("Program link failed: " + info);
      }
      return p;
    };

    const vs = compile(VERT, gl.VERTEX_SHADER);
    const fs = compile(FRAG, gl.FRAGMENT_SHADER);
    const prog = link(vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(prog);
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uRatio = gl.getUniformLocation(prog, "u_ratio");
    const uDpr = gl.getUniformLocation(prog, "u_dpr");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(window.innerWidth);
      const h = Math.floor(window.innerHeight);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(prog);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uRatio, w / Math.max(1, h));
      gl.uniform1f(uDpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    let start = 0;
    const frame = (t: number) => {
      if (!start) start = t;
      const sec = (t - start) / 1000;
      gl.useProgram(prog);
      gl.uniform1f(uTime, sec);
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

  return <canvas ref={canvasRef} className="absolute inset-0 block" />;
}

/* ─────────────────────────────────────────────────────────────
   Login Page (Passwordless email code)
   ───────────────────────────────────────────────────────────── */
export default function LoginInnerPage() {
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

  // UX toast
  const [flash, setFlash] = useState<Flash>("none");
  useEffect(() => {
    if (flash === "none") return;
    const t = setTimeout(() => setFlash("none"), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  // shared
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // session (NO AUTO-REDIRECT)
  const [me, setMe] = useState<MeResponse>({ email: null, paid: false });
  const [loadingMe, setLoadingMe] = useState(true);

  // tiny UX cookie used only by middleware (not security)
  function setAuthedCookie(on: boolean) {
    document.cookie = `ellie_authed=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${
      on ? 60 * 60 * 24 * 90 : 0
    }`;
  }

  // Load current session
  useEffect(() => {
    setLoadingMe(true);
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((m: MeResponse) => {
        setMe(m);
        if (m?.email) setAuthedCookie(true);
      })
      .catch(() => setMe({ email: null, paid: false }))
      .finally(() => setLoadingMe(false));
  }, []);

  async function signOut() {
    try {
      setLoading(true);
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      setMe({ email: null, paid: false });
      setAuthedCookie(false);
      setFlash("signedout");
    } finally {
      setLoading(false);
    }
  }

  // sign in (email code)
  const [siEmail, setSiEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  async function sendCode() {
    setErr(null);
    const e = siEmail.trim().toLowerCase();
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");

    setLoading(true);
    try {
      const r = await fetch("/api/auth/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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

    setLoading(true);
    try {
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, code: c }),
      });
      const data: VerifyResp = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || "Invalid or expired code.");
        return;
      }
      // session established → mark authed for middleware UX
      setMe({ email: e, paid: !!data.paid });
      setAuthedCookie(true);
      setFlash("signedin");

      // redirect:
      // - if already paid → go to dest (default /chat)
      // - if not paid → send to pricing
      if (data.paid) {
        window.location.href = dest || "/chat";
      } else {
        window.location.href = "/pricing";
      }
    } catch {
      setErr("Verify failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <NebulaBackground />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {/* Flash toasts */}
      {flash !== "none" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-white/90 text-black px-4 py-2 text-sm shadow-lg z-50">
          {flash === "signedin" && "Signed in!"}
          {flash === "signedup" && "Signed up!"}
          {flash === "signedout" && "Signed out."}
        </div>
      )}

      <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-6 shadow-[0_0_60px_rgba(120,80,255,0.15)]">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="mt-2 text-white/70">Sign in with a one-time code</p>
          </div>

          {/* Session status */}
          <div className="mt-4 text-sm text-white/70">
            {loadingMe ? "Checking your session…" : me.email ? (
              <>
                Signed in as <span className="font-semibold">{me.email}</span>
                {me.paid ? " — Paid ✅" : " — Free 🚧"}
              </>
            ) : (
              "Not signed in"
            )}
          </div>

          {err && (
            <div className="mt-4 rounded-lg bg-red-500/90 px-3 py-2 text-sm font-medium text-white">
              {err}
            </div>
          )}

          {/* Email → Code flow */}
          <div className="mt-6 space-y-4">
            {step === "email" ? (
              <>
                <label className="block text-sm text-white/80">Email</label>
                <input
                  type="email"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 outline-none focus:border-white/40"
                />
                <button
                  onClick={sendCode}
                  disabled={loading}
                  className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold hover:bg-white/90 transition disabled:opacity-60"
                >
                  {loading ? "Sending…" : "Send login code"}
                </button>
              </>
            ) : (
              <>
                <label className="block text-sm text-white/80">6-digit code</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="w-full rounded-xl border border-white/20 bg-black/20 px-4 py-3 outline-none focus:border-white/40 tracking-widest text-center"
                />
                <button
                  onClick={verifyCode}
                  disabled={loading || code.length < 6}
                  className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold hover:bg-white/90 transition disabled:opacity-60"
                >
                  {loading ? "Verifying…" : "Verify & continue"}
                </button>
                <button
                  onClick={() => setStep("email")}
                  className="w-full mt-2 rounded-xl border border-white/20 px-4 py-3 text-sm hover:bg-white/10 transition"
                >
                  Use a different email
                </button>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="mt-6 flex items-center justify-between text-sm text-white/70">
            <Link href="/" className="hover:underline">Home</Link>
            {me.email ? (
              <button onClick={signOut} className="hover:underline">Sign out</button>
            ) : (
              <Link href="/pricing" className="hover:underline">Skip to pricing</Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
