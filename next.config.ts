import type { NextConfig } from "next";

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "";

const nextConfig: NextConfig = {
  async rewrites() {
    // Only add a rewrite if a backend base URL is set
    if (!BACKEND) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND}/api/:path*`, // Fixed: ensure /api is included
      },
    ];
  },
};

export default nextConfig;
