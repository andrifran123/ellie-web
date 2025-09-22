// app/welcome/page.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

/**
 * Ultra HD, GPU-accelerated nebula + starfield using a fragment shader.
 * - Runs at 4K with WebGL2 (falls back to a soft gradient if WebGL2 missing).
 * - DPR-aware, resizes smoothly.
 * - UI: "welcome" + two pricing cards w/ Subscribe buttons.
 */

const VERT = `#version 300 es
precision highp float;
layout (location = 0) in vec2 pos;
out vec2 vUv;
void main() {
  vUv = (pos + 1.0) * 0.5;      // map to 0..1
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

// Fragment shader: layered FBM nebula + starfield + twinkle
const FRAG = `#version 300 es
precision highp float;

out vec4 fragColor;
in vec2 vUv;

uniform vec2 u_res;       // canvas size in px
uniform float u_time;     // seconds
uniform float u_ratio;    // aspect ratio
uniform float u_dpr;      // devicePixelRatio

// --- hash / noise utils ---
float hash(vec2 p) {
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
}
float fbm(vec2 p) {
  float f = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    f += amp * noise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return f;
}

// starfield (seeded hash w/ twinkle)
float stars(vec2 uv, float density, float speed) {
  // tile space for consistent density
  vec2 g = floor(uv * density);
  vec2 f = fract(uv * density);
  float rnd = hash(g);
  // star at cell center
  vec2 starPos = fract(sin(rnd*6.2831)*vec2(0.123,0.789));
  vec2 d = f - starPos;
  float dist = length(d);
  float base = smoothstep(0.02, 0.0, dist);
  // twinkle
  float tw = sin(u_time*speed + rnd*20.0)*0.5 + 0.5;
  return base * (0.5 + 0.5 * tw);
}

void main() {
  // normalized coords centered, with aspect
  vec2 uv = vUv;
  vec2 p = (uv - 0.5);
  p.x *= u_ratio;

  // slow camera drift
  vec2 drift = vec2(sin(u_time*0.03), cos(u_time*0.025)) * 0.15;

  // layered nebula using fbm at multiple scales
  float n1 = fbm((p*1.6 + drift*0.2) * 2.0 + u_time*0.03);
  float n2 = fbm((p*0.9 + drift*0.1) * 3.0 - u_time*0.02);
  float neb = smoothstep(0.2, 1.0, (n1*0.6 + n2*0.8));

  // color palette (deep blue -> violet -> pink/cyan)
  vec3 colA = vec3(0.06, 0.08, 0.18);     // base space blue
  vec3 colB = vec3(0.10, 0.06, 0.28);     // deep violet
  vec3 colC = vec3(0.45, 0.18, 0.65);     // magenta
  vec3 colD = vec3(0.25, 0.65, 0.85);     // cyan highlight

  // combine nebula layers
  vec3 nebula = mix(colA, colB, neb);
  nebula = mix(nebula, colC, pow(neb, 1.4));
  nebula = mix(nebula, colD, pow(neb, 6.0) * 0.35);

  // vignette to focus
  float r = length((uv - 0.5) * vec2(u_ratio, 1.0));
  float vig = smoothstep(0.95, 0.15, r);

  // star layers with different densities / twinkle speeds
  float s1 = stars(uv + drift*0.05, 180.0, 1.3);
  float s2 = stars(uv * 1.8 - drift*0.03, 320.0, 1.8) * 0.7;
  float s3 = stars(uv * 3.2 + drift*0.01, 640.0, 2.5) * 0.5;

  // add subtle “dust” sparkle via noise
  float dust = noise(uv * u_res.xy * 0.35) * 0.06;

  // composite
  vec3 color = nebula * (0.55 + 0.45*vig);
  color += vec3(1.0) * (s1*0.9 + s2*0.6 + s3*0.35);
  color += vec3(dust);

  // gentle HDR-ish punch
  color = pow(color, vec3(0.94)); // gamma tweak
  fragColor = vec4(color, 1.0);
}
`;

export default function WelcomePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef<number>(0);
  const uTimeRef = useRef<WebGLUniformLocation | null>(null);
  const uResRef = useRef<WebGLUniformLocation | null>(null);
  const uRatioRef = useRef<WebGLUniformLocation | null>(null);
  const uDprRef = useRef<WebGLUniformLocation | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: false });
    if (!gl) {
      // Fallback: static gradient background if no WebGL2
      canvas.style.background =
        "radial-gradient(1200px circle at 60% 70%, #124, #081026 40%, #040818 70%, #02040c)";
      return;
    }
    glRef.current = gl;

    // Compile helpers
    const compile = (src: string, type: number) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile failed: ${info}`);
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
        const info = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error(`Program link failed: ${info}`);
      }
      return p;
    };

    // Fullscreen triangle
    const vs = compile(VERT, gl.VERTEX_SHADER);
    const fs = compile(FRAG, gl.FRAGMENT_SHADER);
    const prog = link(vs, fs);
    progRef.current = prog;
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const vao = gl.createVertexArray()!;
    vaoRef.current = vao;
    gl.bindVertexArray(vao);

    const quad = new Float32Array([
      -1, -1,
       3, -1,
      -1,  3,
    ]);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(prog);
    uTimeRef.current = gl.getUniformLocation(prog, "u_time");
    uResRef.current = gl.getUniformLocation(prog, "u_res");
    uRatioRef.current = gl.getUniformLocation(prog, "u_ratio");
    uDprRef.current = gl.getUniformLocation(prog, "u_dpr");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1); // cap DPR for perf
      const w = Math.floor(window.innerWidth);
      const h = Math.floor(window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(prog);
      gl.uniform2f(uResRef.current, canvas.width, canvas.height);
      gl.uniform1f(uRatioRef.current, w / Math.max(1, h));
      gl.uniform1f(uDprRef.current, dpr);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const loop = (t: number) => {
      if (!t0Ref.current) t0Ref.current = t;
      const sec = (t - t0Ref.current) / 1000;
      gl.useProgram(prog);
      gl.uniform1f(uTimeRef.current, sec);

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Cleanup
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (vaoRef.current) gl.deleteVertexArray(vaoRef.current);
      if (progRef.current) gl.deleteProgram(progRef.current);
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      {/* 4K Shader Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {/* Content */}
      <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-6xl">
          {/* Title */}
          <div className="text-center mb-10">
            <h1
              className="text-5xl md:text-7xl font-extrabold tracking-tight"
              style={{ textShadow: "0 0 32px rgba(140,110,255,0.35)" }}
            >
              welcome
            </h1>
          </div>

          {/* Two pricing columns */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Monthly */}
            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-6 shadow-[0_0_60px_rgba(120,80,255,0.15)]">
              <div className="text-sm uppercase tracking-widest text-white/75">Monthly</div>
              <div className="mt-2 text-4xl font-bold">$9.99</div>
              <div className="mt-4 text-sm text-white/80">
                Unlimited chat and voice. Memory & mood. Cancel anytime.
              </div>
              <Link
                href="/pricing"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white text-black font-semibold px-4 py-2.5 hover:scale-[1.01] active:scale-[0.99] transition"
              >
                Subscribe
              </Link>
            </div>

            {/* Yearly */}
            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-6 shadow-[0_0_60px_rgba(60,180,255,0.15)]">
              <div className="text-sm uppercase tracking-widest text-white/75">Yearly</div>
              <div className="mt-2 text-4xl font-bold">$89.99</div>
              <div className="mt-4 text-sm text-white/80">
                2 months free. Priority compute & early features.
              </div>
              <Link
                href="/pricing"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 font-semibold hover:bg-white/10 transition"
              >
                Subscribe
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
