// next.config.ts
import type { NextConfig } from "next";

// Accept either env name; if neither is set, BACKEND = "" (rewrite will be skipped)
const BACKEND =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "";

const nextConfig: NextConfig = {
  /* config options here */

  // Forward /api/* to your backend when BACKEND is provided
  async rewrites() {
    if (!BACKEND) {
      console.warn(
        "⚠️ NEXT_PUBLIC_API_URL/NEXT_PUBLIC_BACKEND_URL not set — skipping /api/* rewrite"
      );
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND}/:path*`,
      },
    ];
  },
};

export default nextConfig;
