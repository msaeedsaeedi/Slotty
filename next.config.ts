import type { NextConfig } from "next";

/**
 * Report-only for now (ADR-015): browsers log what this policy would block
 * without blocking it. Inline scripts and styles stay allowed because Next
 * inlines its bootstrap; tighten with nonces before enforcing.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Lets the E2E server (port 3100, test DB) run next to `next dev` without sharing build output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Docker image ships only the files the server traces (see Dockerfile).
  output: "standalone",
  // The dev server behind Caddy at https://uniflow.local (infra/Caddyfile); HMR and dev assets need this.
  allowedDevOrigins: ["uniflow.local"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Dev mode needs eval for hot reload, so the policy is only sent by production builds.
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY }] : []),
        ],
      },
      {
        // The service worker must never be served stale, and may only run same-origin code.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
