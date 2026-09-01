import type { NextConfig } from "next";

// Baseline security headers — none were configured before. Deliberately
// not a nonce-based CSP (would need per-request middleware wiring this
// project doesn't have, and can't be safely verified live in this
// environment — no reachable browser session against a real deploy). This
// is defense-in-depth: no active XSS/injection vector was found in the
// app (no dangerouslySetInnerHTML, no unparameterized SQL), but shipping
// zero headers on a public, authenticated product is an easy gap to close.
// img-src/media-src allow any https origin rather than a specific bucket
// domain, since the storage endpoint is deployment-specific (an env var,
// not known at build time) — signed URLs to R2/S3 must keep working.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' only in dev — Next's dev-mode bundler needs it; not
  // required for a production build.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
