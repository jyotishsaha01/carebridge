import type { NextConfig } from "next";
import path from "node:path";

const production = process.env.NODE_ENV === "production";
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (production) {
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is required for production builds.");
  const parsed = new URL(apiUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("NEXT_PUBLIC_API_URL must be a public HTTPS API URL without credentials, query, or fragment.");
  }
}
const apiOrigin = new URL(apiUrl ?? "http://localhost:4000").origin;
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'", "font-src 'self' data:", "img-src 'self' blob: data:",
  `connect-src 'self' ${apiOrigin}${production ? "" : " ws: wss:"}`,
  "form-action 'self'", "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Content-Security-Policy", value: csp },
      ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }];
  },
};
export default nextConfig;
