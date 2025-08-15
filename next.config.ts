import type { NextConfig } from "next";

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "";

const nextConfig: NextConfig = {
  async rewrites() {
    if (!BACKEND) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND}/api/:path*`, // Fixed: added /api here
      },
    ];
  },
};

export default nextConfig;
