import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // ADDED: forward /api/* calls to your Render backend
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
