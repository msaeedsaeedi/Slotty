import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the E2E server (port 3100, test DB) run next to `next dev` without sharing build output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
