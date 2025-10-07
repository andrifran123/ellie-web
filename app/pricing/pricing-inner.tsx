// app/welcome/page.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

export default function WelcomePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      // graceful fallback if WebGL2 is unavailable
      canvas.style.background =
        "radial-gradient(1200px circle at 60% 70%, #120824, #060214 55%, #03010b 85%)";
      return;
    }

    // ───────────────────────────────────────────────────────────
    // Shaders
    // ───────────────────────────────────────────────────────────
    const VERT = `#version 300 es
    precision highp float;
    layout (location = 0) in vec2 pos;
    out vec2 vUv;
    void main() {
      vUv = pos * 0.5 + 0.5; // map -1..1 → 0..1
      gl_Position = vec4(pos, 0.0, 1.0);
    }`;

    // Parallax stars + animated nebula (FBM). Stars are layered with different
    // densities & scroll speeds to create depth.
    const FRAG = `#version 300 es
    precision highp float;

    out vec4 fragColor;
    in vec2 vUv;

    uniform float u_time;     // seconds
    uniform vec2  u_res;      // canvas px size
    uniform float u_ratio;    // width/height
    uniform float u_dpr;

    // -------- noise utils --------
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
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
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p *= 2.02;
        a *= 0.5;
      }
      return v;
    }

    // Soft star kernel
    float starKernel(vec2 d, float sz) {
      // Circular falloff with small core
      float r = length(d);
      float core = smoothstep(sz, 0.0, r);
      float glow = smoothstep(0.6, 0.0, r / (sz*4.0));
      return core * 0.85 + glow * 0.35;
    }

    // One star layer (parallax)
    float starLayer(vec2 uv, float density, float size, float speed, float twinkle, vec2 dir) {
      // Scroll the layer (parallax drift)
      vec2 sUv = uv + dir * speed * u_time;

      // Tile space
      vec2 grid = sUv * density;
      vec2 cell = floor(grid);
      vec2 f = fract(grid);

      // Pseudo-random star position inside cell
      float rnd = hash(cell);
      vec2 starPos = fract(vec2(
        sin(rnd * 37.0) * 43758.5,
        sin(rnd * 91.0) * 12345.6
      ));

      // Distance to star in the current cell
      vec2 d = f - starPos;
      float base = starKernel(d, size);

      // Twinkle per-cell
      float tw = sin(u_time * (0.5 + twinkle * 2.0) + rnd * 12.0) * 0.5 + 0.5;

      // Occasionally brighten a star (rare flashes)
      float flash = step(0.9975, hash(cell + 7.0)) * (sin(u_time * 8.0 + rnd * 50.0) * 0.5 + 0.5);

      return base * (0.55 + 0.45 * tw) + flash * 0.35 * base;
    }

    void main() {
      // Normalize coordinates with aspect to keep circles round
      vec2 uv = (vUv - 0.5);
      uv.x *= u_ratio;

      // Camera drift vector
      vec2 cam = vec2(sin(u_time*0.03), cos(u_time*0.025));

      // ---------- Nebula (animated FBM) ----------
      float n1 = fbm((uv * 1.6 + cam * 0.10) * 2.0 + u_time * 0.03);
      float n2 = fbm((uv * 0.9 + cam * 0.05) * 3.0 - u_time * 0.02);
      float n3 = fbm((uv * 2.8 - cam * 0.02) * 1.7 + u_time * 0.015);
      float neb = clamp(n1*0.6 + n2*0.8 + n3*0.4, 0.0, 1.2);

      vec3 colA = vec3(0.06, 0.04, 0.14); // deep space
      vec3 colB = vec3(0.45, 0.14, 0.62); // magenta
      vec3 colC = vec3(0.22, 0.60, 0.86); // cyan
      vec3 nebula = mix(colA, colB, smoothstep(0.15, 0.85, neb));
      nebula = mix(nebula, colC, pow(smoothstep(0.35, 1.0, neb), 2.2) * 0.6);

      // Vignette to focus the center
      float r = length(uv);
      float vig = smoothstep(1.0, 0.25, r);

      // ---------- Parallax stars ----------
      // Reconstruct 0..1 UV for star functions
      vec2 suv = uv;
      suv.x = suv.x / max(1e-4, u_ratio);
      suv = suv + 0.5;

      // Directions: slight diagonal drift
      vec2 dir = normalize(vec2(0.6, -0.4));

      // Far layer (slow, tiny, dense)
      float sf = starLayer(suv * 0.85, 420.0, 0.010, 0.004, 0.8, dir);
      // Mid layer (medium speed/size)
      float sm = starLayer(suv * 1.20, 260.0, 0.016, 0.010, 1.0, dir);
      // Near layer (fast, bigger, sparser)
      float sn = starLayer(suv * 1.65, 160.0, 0.024, 0.022, 1.3, dir);

      // Star color (slightly bluish-white)
      vec3 starCol = vec3(1.0, 1.0, 1.0) * 0.85 + vec3(0.05, 0.10, 0.20);

      vec3 color = nebula * (0.5 + 0.5 * vig);
      color += starCol * (sf * 0.9 + sm * 0.8 + sn * 0.75);

      // Subtle dust sparkle
      float dust = noise(suv * u_res.xy * 0.35) * 0.06;
      color += vec3(dust);

      // Final tone
      color = pow(color, vec3(0.94)); // mild HDR-ish punch
      fragColor = vec4(color, 1.0);
    }`;

    // ───────────────────────────────────────────────────────────
    // GL setup
    // ───────────────────────────────────────────────────────────
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

    // Fullscreen tri (fast)
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
      const dpr = Math.min(2, window.devicePixelRatio || 1); // cap for perf
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

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      {/* 4K shader canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* Optional faint grid for extra futurism */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px",
          mixBlendMode: "screen",
        }}
      />

      {/* Content */}
      <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-6xl">
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
              <div className="text-xs font-semibold tracking-wide text-white/80">MONTHLY</div>
              <div className="mt-2 text-4xl font-bold">$9.99</div>
              <div className="mt-4 text-sm text-white/80">
                Unlimited chat and voice. Memory &amp; mood. Cancel anytime.
              </div>
              <Link
                href="https://ellie-elite.lemonsqueezy.com/buy/8bcb0766-7f48-42cf-91ec-76f56c813c2a"
		 target="_blank"
		 rel="noopener noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white text-black font-semibold px-4 py-2.5 hover:scale-[1.01] active:scale-[0.99] transition card-hover"
              >
                Subscribe Monthly - $9.99
              </Link>
            </div>

            {/* Yearly */}
            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-6 shadow-[0_0_60px_rgba(60,180,255,0.15)]">
              <div className="text-xs font-semibold tracking-wide text-white/80">YEARLY</div>
              <div className="mt-2 text-4xl font-bold">$89.99</div>
              <div className="mt-4 text-sm text-white/80">
                2 months free. Priority compute &amp; early features.
              </div>
              <Link
                href="https://ellie-elite.lemonsqueezy.com/buy/63d6d95d-313f-44f8-ade3-53885b3457e4"
 		 target="_blank"
		  rel="noopener noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 font-semibold hover:bg-white/10 transition card-hover"
              >
                Subscribe Bundle, 3 months 29.80
              </Link>
            </div>
          </div>

          {/* Extra note from pricing page */}
          <div className="mt-8 text-center text-xs text-white/60">
            After logging in and activating your plan, you’ll be taken to Chat automatically.
          </div>
        </div>
      </main>
    </div>
  );
}
