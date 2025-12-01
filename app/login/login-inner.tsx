// app/login/login-inner.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Route ALL auth via /api so cookies are first-party on your Vercel domain
const toApi = (path: string) =>
  path.startsWith("/api") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;

type StartResp = { ok?: boolean; message?: string };
type VerifyResp = { ok?: boolean; paid?: boolean; message?: string };
type SignupResp = { ok?: boolean; message?: string };
type MeResponse = { ok?: boolean; loggedIn?: boolean; email: string | null; paid: boolean };
type TermsResp = { ok?: boolean; terms?: { title: string; content: string; checkboxLabel: string } };
type Mode = "signin" | "signup";
type Flash = "none" | "signedin" | "signedup" | "signedout";

/* ================= Nebula BG ================= */
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
    void main() { vUv = pos * 0.5 + 0.5; gl_Position = vec4(pos, 0.0, 1.0); }`;

    const FRAG = `#version 300 es
    precision highp float;
    out vec4 fragColor; in vec2 vUv;
    uniform float u_time; uniform float u_ratio;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){ vec2 i=floor(p),f=fract(p);
      float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
      vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }
    float starKernel(vec2 d,float sz){ float r=length(d); float core=smoothstep(sz,0.,r); float glow=smoothstep(.6,0.,r/(sz*4.)); return core*.85+glow*.35; }
    void main(){
      vec2 uv=(vUv-.5); uv.x*=u_ratio;
      float t=u_time*.15;
      float neb=fbm(uv*1.6+vec2(t*.3,-t*.25));
      vec3 col=mix(vec3(.01,.01,.06), vec3(.46,.38,.95), smoothstep(.2,.85,neb));
      col+=vec3(starKernel(uv,.02)*.2);
      fragColor=vec4(col,1.0);
    }`;

    const sh = (src: string, type: number) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(VERT, gl.VERTEX_SHADER));
    gl.attachShader(prog, sh(FRAG, gl.FRAGMENT_SHADER));
    gl.linkProgram(prog);

    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

    const uTime = gl.getUniformLocation(prog,"u_time");
    const uRatio = gl.getUniformLocation(prog,"u_ratio");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0,0,canvas.width,canvas.height);
    };
    resize(); window.addEventListener("resize", resize);

    let start = 0;
    const frame = (t: number) => {
      if (!start) start = t; const sec = (t-start)/1000;
      gl.useProgram(prog);
      gl.uniform1f(uTime, sec);
      gl.uniform1f(uRatio, canvas.width/Math.max(1,canvas.height));
      gl.drawArrays(gl.TRIANGLES,0,3);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    return () => { window.removeEventListener("resize", resize); gl.deleteBuffer(vbo); gl.deleteVertexArray(vao); gl.deleteProgram(prog); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 block" />;
}

/* ================= Login Page ================= */
export default function LoginInnerPage() {
  const [dest, setDest] = useState<string>("/chat");
  const [mode, setMode] = useState<Mode>("signin");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const redirect = p.get("redirect"); const signup = p.get("signup");
    if (redirect) setDest(redirect); if (signup === "1") setMode("signup");
  }, []);

  const [flash, setFlash] = useState<Flash>("none");
  useEffect(() => { if (flash==="none") return; const t=setTimeout(()=>setFlash("none"),1600); return ()=>clearTimeout(t); }, [flash]);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [me, setMe] = useState<MeResponse>({ email: null, paid: false });
  const [loadingMe, setLoadingMe] = useState(true);

  function setAuthedCookie(on: boolean) {
    document.cookie = `ellie_authed=${on ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${on ? 60*60*24*90 : 0}`;
  }

  useEffect(() => {
    setLoadingMe(true);
    fetch(toApi("/auth/me"), { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) return { email: null, paid: false } as MeResponse;
        return (await r.json()) as MeResponse;
      })
      .then((m) => { setMe(m); if (m?.email) setAuthedCookie(true); })
      .catch(() => setMe({ email: null, paid: false }))
      .finally(() => setLoadingMe(false));
  }, []);

  async function signOut() {
    setLoading(true);
    try { await fetch(toApi("/auth/logout"), { method: "POST", credentials: "include" }); setMe({ email: null, paid: false }); setAuthedCookie(false); setFlash("signedout"); }
    finally { setLoading(false); }
  }

  const [siEmail, setSiEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email"|"code">("email");

  const [name, setName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // Terms modal state
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsData, setTermsData] = useState<TermsResp["terms"] | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loadingTerms, setLoadingTerms] = useState(false);

  async function sendCode() {
    setErr(null);
    const e = siEmail.trim().toLowerCase(); if (!emailRegex.test(e)) return setErr("Enter a valid email.");
    setLoading(true);
    try {
      const r = await fetch(toApi("/auth/start"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      const data: StartResp = await r.json();
      if (!r.ok || !data.ok) return setErr(data.message || "Could not send code.");
      setStep("code");
    } catch { setErr("Network error."); } finally { setLoading(false); }
  }

  async function verifyCode() {
    setErr(null);
    const e = siEmail.trim().toLowerCase(); const c = code.trim();
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");
    if (!c) return setErr("Enter the 6-digit code.");
    setLoading(true);
    try {
      const r = await fetch(toApi("/auth/verify"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, code: c }),
      });
      const data: VerifyResp = await r.json();
      if (!r.ok || !data.ok) return setErr(data.message || "Invalid or expired code.");
      setMe({ email: e, paid: !!data.paid }); setAuthedCookie(true); setStep("email"); setCode(""); setSiEmail(""); setFlash("signedin");
      if (data.paid) window.location.href = dest || "/chat";
      else window.location.href = `/pricing?redirect=${encodeURIComponent(dest || "/chat")}`;
    } catch { setErr("Network error."); } finally { setLoading(false); }
  }

  // Step 1: Validate form and show terms modal
  async function handleSignUpClick() {
    setErr(null);
    const n=name.trim(), e=suEmail.trim().toLowerCase(), p=password.trim();
    if (!n) return setErr("Enter your name.");
    if (!emailRegex.test(e)) return setErr("Enter a valid email.");
    if (p.length<8) return setErr("Password must be at least 8 characters.");

    // Fetch terms if not already loaded
    if (!termsData) {
      setLoadingTerms(true);
      try {
        const r = await fetch(toApi("/auth/terms"), { credentials: "include" });
        const data: TermsResp = await r.json();
        if (data.ok && data.terms) {
          setTermsData(data.terms);
        } else {
          return setErr("Could not load terms. Please try again.");
        }
      } catch {
        return setErr("Network error loading terms.");
      } finally {
        setLoadingTerms(false);
      }
    }

    setAcceptedTerms(false);
    setShowTermsModal(true);
  }

  // Step 2: Actually create the account after terms accepted
  async function signUp() {
    if (!acceptedTerms) return;
    setErr(null);
    const n=name.trim(), e=suEmail.trim().toLowerCase(), p=password.trim();
    setLoading(true);
    setShowTermsModal(false);
    try {
      const r = await fetch(toApi("/auth/signup"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, email: e, password: p, acceptedTerms: true }),
      });
      const data: SignupResp = await r.json();
      if (!r.ok || !data.ok) return setErr(data.message || "Could not create account.");
      setMe({ email: e, paid: false }); setAuthedCookie(true); setName(""); setSuEmail(""); setPassword(""); setFlash("signedup");
      window.location.href = `/pricing?redirect=${encodeURIComponent(dest || "/chat")}`;
    } catch { setErr("Network error."); } finally { setLoading(false); }
  }

  const Spinner = () => (
    <svg className="inline size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z" />
    </svg>
  );

  const flashText = flash==="signedin" ? "Signed in!" : flash==="signedup" ? "Account created!" : flash==="signedout" ? "Signed out" : "";

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <NebulaBackground />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{background:"linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px", mixBlendMode:"screen"}} />
      {flash!=="none" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 backdrop-blur-lg bg-white/10 text-white px-4 py-2 rounded-xl border border-white/15 shadow">
          <span className="mr-2">✅</span> {flashText}
        </div>
      )}

      {/* Terms & Disclaimer Modal */}
      {showTermsModal && termsData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-white/20 bg-[#0d0a1a] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">{termsData.title}</h2>
              <button
                onClick={() => setShowTermsModal(false)}
                className="text-white/60 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
              {termsData.content}
            </div>

            {/* Footer with checkbox and button */}
            <div className="p-4 border-t border-white/10 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-white/30 bg-white/10 accent-purple-500"
                />
                <span className="text-sm text-white/90">{termsData.checkboxLabel}</span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={signUp}
                  disabled={!acceptedTerms || loading}
                  className="flex-1 rounded-lg bg-white text-black px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating..." : "I Agree & Create Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-10 px-6 md:px-10 py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-center text-4xl md:text-6xl font-extrabold mb-10" style={{textShadow:"0 0 32px rgba(140,110,255,0.35)"}}>welcome</h1>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left card */}
            <div className="rounded-2xl p-6 md:p-8 border border-white/10 backdrop-blur-sm bg-white/10 shadow-[0_0_60px_rgba(120,80,255,0.15)]">
              {!loadingMe && me.email ? (
                <div className="space-y-4">
                  <div className="text-sm text-white/80">
                    You’re signed in as <span className="font-semibold">{me.email}</span>
                    {me.paid ? " (active subscription)" : " (no active subscription)"}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <Link href={dest || "/chat"} onClick={() => setAuthedCookie(true)} className="w-full text-center rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60">Go to Chat</Link>
                    {!me.paid ? (
                      <Link href={`/pricing?redirect=${encodeURIComponent(dest || "/chat")}`} onClick={() => setAuthedCookie(true)} className="w-full text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10 transition">Go to Pricing</Link>
                    ) : (
                      <Link href="/call" onClick={() => setAuthedCookie(true)} className="w-full text-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10 transition">Start Call</Link>
                    )}
                  </div>

                  <button onClick={signOut} disabled={loading} className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition disabled:opacity-60" aria-busy={loading ? "true" : "false"}>
                    {loading ? (<span className="inline-flex items-center gap-2"><Spinner /> Signing out…</span>) : ("Sign out")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-white/10 rounded-xl p-1 w-fit mx-auto">
                    <button onClick={()=>{setMode("signin"); setErr(null);}} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${mode==="signin"?"bg-white text-black":"text-white/80 hover:text-white"}`}>Sign in</button>
                    <button onClick={()=>{setMode("signup"); setErr(null);}} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${mode==="signup"?"bg-white text-black":"text-white/80 hover:text-white"}`}>Sign up</button>
                  </div>

                  <div className="mt-6 space-y-3 max-w-md mx-auto w-full">
                    {mode==="signin" ? (
                      <>
                        {step==="email" && (
                          <>
                            <label className="text-sm text-white/80">Email</label>
                            <input value={siEmail} onChange={(e)=>setSiEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition" type="email" autoComplete="email" />
                            <button disabled={loading} onClick={sendCode} className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60" aria-busy={loading ? "true":"false"}>{loading ? "Sending…" : "Send code"}</button>
                          </>
                        )}

                        {step==="code" && (
                          <>
                            <label className="text-sm text-white/80">Enter 6-digit code</label>
                            <input value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 tracking-widest text-center outline-none focus:border-white/30 transition" inputMode="numeric" autoComplete="one-time-code" />
                            <button disabled={loading || code.length<6} onClick={verifyCode} className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60" aria-busy={loading ? "true":"false"}>{loading ? "Verifying…" : "Verify & continue"}</button>
                            <button onClick={()=>{ setStep("email"); setCode(""); setErr(null); }} className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition">← Use a different email</button>
                            <div className="text-xs text-white/60 text-center">We emailed you a 6-digit code.</div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <label className="text-sm text-white/80">Name</label>
                        <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition" type="text" autoComplete="name" />
                        <label className="text-sm text-white/80">Email</label>
                        <input value={suEmail} onChange={(e)=>setSuEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition" type="email" autoComplete="email" />
                        <label className="text-sm text-white/80">Password</label>
                        <input value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="At least 8 characters" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30 transition" type="password" autoComplete="new-password" />
                        <button disabled={loading || loadingTerms} onClick={handleSignUpClick} className="w-full rounded-lg bg-white text-black font-semibold px-3 py-2 hover:opacity-90 transition disabled:opacity-60" aria-busy={loading || loadingTerms ? "true":"false"}>{loading ? "Creating…" : loadingTerms ? "Loading…" : "Create account"}</button>
                      </>
                    )}

                    {err && <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{err}</div>}
                    <div className="text-xs text-white/60 text-center mt-2"><Link href="/" className="underline">← Back home</Link></div>
                  </div>
                </>
              )}
            </div>

            {/* Right card */}
            <div className="rounded-2xl p-6 md:p-8 border border-white/10 backdrop-blur-sm bg-white/10 shadow-[0_0_60px_rgba(120,80,255,0.15)]">
              <div className="text-sm font-semibold mb-2">What you get</div>
              <ul className="space-y-2 text-sm text-white/80">
                <li>• Ellie remembers you naturally</li>
                <li>• Mood-aware replies</li>
                <li>• High-quality voice</li>
                <li>• Priority compute</li>
              </ul>
              <div className="mt-6 text-xs text-white/60">
                Already have an account? <button type="button" onClick={()=>setMode("signin")} className="underline">Sign in</button>. New here? <button type="button" onClick={()=>setMode("signup")} className="underline">Create your account</button>.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
