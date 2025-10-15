// app/login/login-inner.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

type StartResp = { ok?: boolean; message?: string };
type VerifyResp = { ok?: boolean; paid?: boolean; message?: string };
type SignupResp = { ok?: boolean; message?: string };
type MeResponse = { email: string | null; paid: boolean };
type Mode = "signin" | "signup";
type Flash = "none" | "signedin" | "signedup" | "signedout";

/** Build API paths that always go through Vercel’s /api rewrite (first-party cookies) */
const toApi = (path: string) =>
  path.startsWith("/api") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;

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
      float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
      vec2 u=f*f*(3.-2.*f);
      return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
    }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }

    float starKernel(vec2 d, float sz){
      float r=length(d);
      float core=smoothstep(sz,0.,r);
      float glow=smoothstep(.6,0.,r/(sz*4.));
      return core*.85+glow*.35;
    }

    float starLayer(vec2 uv, float density, float size, float speed, float twinkle, vec2 dir){
      vec2 sUv=uv+dir*speed*u_time;
      vec2 grid=sUv*density;
      vec2 cell=floor(grid);
      vec2 f=fract(grid);
      float rnd=hash(cell);
      vec2 starPos=fract(vec2(
        sin(rnd*37.)*43758.5,
        sin(rnd*91.)*12345.6
      ));
      vec2 d=f-starPos;
      float base=starKernel(d,size);
      float tw=sin(u_time*(.5+twinkle*2.)+rnd*12.)*.5+.5;
      float flash=step(.9975,hash(cell+7.))* (sin(u_time*8.+rnd*50.)*.5+.5);
      return base*(.55+.45*tw)+flash*.35*base;
    }

    void main(){
      vec2 uv=(vUv-.5); uv.x*=u_ratio;
      vec2 cam=vec2(sin(u_time*.03),cos(u_time*.025));

      float n1=fbm((uv*1.6+cam*.10)*2.+u_time*.03);
      float n2=fbm((uv*.9+cam*.05)*3.-u_time*.02);
      float n3=fbm((uv*2.8-cam*.02)*1.7+u_time*.015);
      float neb=clamp(n1*.6+n2*.8+n3*.4,0.,1.2);

      vec3 colA=vec3(.06,.04,.14);
      vec3 colB=vec3(.45,.14,.62);
      vec3 colC=vec3(.22,.60,.86);
      vec3 nebula=mix(colA,colB,smoothstep(.15,.85,neb));
      nebula=mix(nebula,colC,pow(smoothstep(.35,1.,neb),2.2)*.6);

      float r=length(uv);
      float vig=smoothstep(1.,.25,r);

      vec2 suv=uv; suv.x=suv.x/max(1e-4,u_ratio); suv+=.5;
      vec2 dir=normalize(vec2(.6,-.4));

      float sf=starLayer(suv*.85,420.,.010,.004,.8,dir);
      float sm=starLayer(suv*1.20,260.,.016,.010,1.0,dir);
      float sn=starLayer(suv*1.65,160.,.024,.022,1.3,dir);

      vec3 starCol=vec3(1.)*.85+vec3(.05,.10,.20);

      vec3 color=nebula*(.5+.5*vig);
      color+=starCol*(sf*.9+sm*.8+sn*.75);

      float dust=noise(suv*u_res.xy*.35)*.06;
      color+=vec3(dust);

      color=pow(color,vec3(.94));
      fragColor=vec4(color,1.);
    }`;

    const compile = (src: string, type: number) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh) || "unknown";
        gl.deleteShader(sh);
        throw new Error("Shader compile failed: " + info);
      }
      return sh;
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

    const quad = new Float32Array([-1, -1, 3, -1, -1, 3]); // fullscreen tri
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
   Login Page
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

  // tiny UX cookie used only by middleware (not for security)
  function setAuthedCookie(on: boolean) {
    document.cookie = `ellie_authed=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${
      on ? 60 * 60 * 24 * 90 : 0
    }`;
  }

  // Load current session
  useEffect(() => {
    setLoadingMe(true);
    fetch(toApi("/auth/me"), { credentials: "include" })
      .then((r) => r.json())
      .then((m: MeResponse) => {
        setMe(m);
        if (m?.email) setAuthedCookie(true); // allow middleware UX
      })
      .catch(() => setMe({ email: null, paid: false }))
      .finally(() => setLoadingMe(false));
  }, []);

  async function signOut() {
    try {
      setLoading(true);
      await fetch(toApi("/auth/logout"), { method: "POST", credentials: "include" });
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

  // sign up (name/email/password)
  const [name, setName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  async function sendCode() {
    setErr(null);
    const e = siEmail.trim().toLowerCase();
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");

    setLoading(true);
    try {
      const r = await fetch(toApi("/auth/start"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }, // simple header, preflight minimal
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
      const r = await fetch(toApi("/auth/verify"), {
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
      // session established
      setMe({ email: e, paid: !!data.paid });
      setAuthedCookie(true);
      setFlash("signedin");

      // redirect:
      if (data.paid) {
        window.location.href = dest || "/chat";
      } else {
        window.location.href = `/pricing?redirect=${encodeURIComponent(dest || "/chat")}`;
      }
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

    setLoading(true);
    try {
      const r = await fetch(toApi("/auth/signup"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, email: e, password: p }),
      });
      const data: SignupResp = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || "Could not create account.");
        return;
      }
      setMe({ email: e, paid: false });
      setAuthedCookie(true);
      setName("");
      setSuEmail("");
      setPassword("");
      setFlash("signedup");
      window.location.href = `/pricing?redirect=${encodeURIComponent(dest || "/chat")}`;
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  // inline spinner
  const Spinner = () => (
    <svg className="inline size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z" />
    </svg>
  );

  const flashText =
    flash === "signedin"
      ? "Signed in!"
      : flash === "signedup"
      ? "Account created!"
      : flash === "signedout"
      ? "Signed out"
      : "";

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      {/* Background */}
      <NebulaBackground />

      {/* faint grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {/* Toast */}
      {flash !== "none" && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 backdrop-blur-lg bg-white/10 text-white px-4 py-2 rounded-xl border border-white/15 shadow transition-all duration-300
                     animate-[fadeIn_120ms_ease-out,fadeOut_300ms_ease-in_1.2s_forwards]"
          role="status"
          aria-live="polite"
        >
          <span className="mr-2">✅</span> {flashText}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeOut { to { opacity: 0; transform: translate(-50%, -6px); } }
      `}</style>

      {/* Foreground content */}
      <main className="relative z-10 px-6 md:px-10 py-10">
        <div className="max-w-5xl mx-auto">
          <h1
            className="text-center text-4xl md:text-6xl font-extrabold mb-10"
            style={{ textShadow: "0 0 32px rgba(140,110,255,0.35)" }}
          >
            welcome
          </h1>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Auth card */}
            <div className="glass rounded-2xl p-6 md:p-8 border border-white/10 backdrop-blur-sm bg-white/10">
              {/* Signed-in panel (NO AUTO-REDIRECT) */}
              {!loadingMe && me.email ? (
                <div className="space-y-4">
                  <div className="text-sm text-white/80">
                    You’re signed in as <span className="font-semibold">{me.email}</span>
                    {me.paid ? " (active subscription)" : " (no active subscription)"}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <Link
                      href={dest || "/chat"}
                      onClick={() => setAuthedCookie(true)}
                      className="w-full text-center rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60"
                    >
                      Go to Chat
                    </Link>

                    {!me.paid ? (
                      <Link
                        href={`/pricing?redirect=${encodeURIComponent(dest || "/chat")}`}
                        className="w-full text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
                        onClick={() => setAuthedCookie(true)}
                      >
                        Go to Pricing
                      </Link>
                    ) : (
                      <Link
                        href="/call"
                        onClick={() => setAuthedCookie(true)}
                        className="w-full text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
                      >
                        Start Call
                      </Link>
                    )}
                  </div>

                  <button
                    onClick={signOut}
                    disabled={loading}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition disabled:opacity-60"
                    aria-busy={loading ? "true" : "false"}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner /> Signing out…
                      </span>
                    ) : (
                      "Sign out"
                    )}
                  </button>
                </div>
              ) : (
                <>
                  {/* Toggle */}
                  <div className="flex items-center gap-2 bg-white/10 rounded-xl p-1 w-fit mx-auto">
                    <button
                      onClick={() => {
                        setMode("signin");
                        setErr(null);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                        mode === "signin" ? "bg-white text-black" : "text-white/80 hover:text-white"
                      }`}
                    >
                      Sign in
                    </button>
                    <button
                      onClick={() => {
                        setMode("signup");
                        setErr(null);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                        mode === "signup" ? "bg-white text-black" : "text-white/80 hover:text-white"
                      }`}
                    >
                      Sign up
                    </button>
                  </div>

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
                              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition"
                              type="email"
                              autoComplete="email"
                            />
                            <button
                              disabled={loading}
                              onClick={sendCode}
                              className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60"
                              aria-busy={loading ? "true" : "false"}
                            >
                              {loading ? (
                                <span className="inline-flex items-center gap-2">
                                  <Spinner /> Sending…
                                </span>
                              ) : (
                                "Send code"
                              )}
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
                              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 tracking-widest text-center outline-none focus:border-white/30 transition"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                            />
                            <button
                              disabled={loading || code.length < 6}
                              onClick={verifyCode}
                              className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60"
                              aria-busy={loading ? "true" : "false"}
                            >
                              {loading ? (
                                <span className="inline-flex items-center gap-2">
                                  <Spinner /> Verifying…
                                </span>
                              ) : (
                                "Verify & continue"
                              )}
                            </button>

                            <button
                              onClick={() => {
                                setStep("email");
                                setCode("");
                                setErr(null);
                              }}
                              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
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
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition"
                          type="text"
                          autoComplete="name"
                        />

                        <label className="text-sm text-white/80">Email</label>
                        <input
                          value={suEmail}
                          onChange={(e) => setSuEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition"
                          type="email"
                          autoComplete="email"
                        />

                        <label className="text-sm text-white/80">Password</label>
                        <input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition"
                          type="password"
                          autoComplete="new-password"
                        />

                        <button
                          disabled={loading}
                          onClick={signUp}
                          className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60"
                          aria-busy={loading ? "true" : "false"}
                        >
                          {loading ? (
                            <span className="inline-flex items-center gap-2">
                              <Spinner /> Creating…
                            </span>
                          ) : (
                            "Create account"
                          )}
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

            {/* Right: “What you get” */}
            <div className="glass rounded-2xl p-6 md:p-8 border border-white/10 backdrop-blur-sm bg-white/10">
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
    </div>
  );
}
