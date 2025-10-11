// next.config.ts
import type { NextConfig } from "next";

// Prefer explicit env, but fall back to sensible defaults.
const isProd = process.env.VERCEL === "1";
const BACKEND =
  process.env.NEXT_PUBLIC_API_URL ||          // set this in Vercel to override
  process.env.NEXT_PUBLIC_BACKEND_URL ||      // legacy alias
  (isProd ? "https://ellie-api-1.onrender.com"
          : "http://localhost:10000");        // dev: Render local or your API port

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
