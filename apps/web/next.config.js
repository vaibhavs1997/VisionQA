const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  reactStrictMode: true,
  // Keep the long-running dev server's hot-reload files isolated from
  // production builds. Sharing .next makes `next build` invalidate chunks
  // that the active dev server is still trying to serve.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  // Standalone output traces the minimal set of files/deps actually
  // needed at runtime into .next/standalone — lets the Docker image
  // avoid shipping the full node_modules tree (see web.Dockerfile).
  output: "standalone",
  // No rewrites needed: the API now returns fully-qualified signed
  // evidence URLs directly (see ScanPage.screenshotUrls) rather than
  // relying on a same-origin static-file proxy, since evidence access
  // is authorization-gated (signed token), not just path-based.
});

module.exports = nextConfig;
