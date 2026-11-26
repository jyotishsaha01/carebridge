import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
const apiValue = process.env.NEXT_PUBLIC_API_URL;
if (production && !apiValue) throw new Error("NEXT_PUBLIC_API_URL must be set to the production HTTPS API URL before building.");
const api = new URL(apiValue ?? "http://localhost:4000");
if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash || api.pathname !== "/") {
  throw new Error("NEXT_PUBLIC_API_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.");
}
if (production && (api.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname))) {
  throw new Error("Production NEXT_PUBLIC_API_URL must use HTTPS and a public hostname.");
}
for (const [name, value] of [
  ["NEXT_PUBLIC_DOCTOR_APP_URL", process.env.NEXT_PUBLIC_DOCTOR_APP_URL],
  ["NEXT_PUBLIC_ADMIN_APP_URL", process.env.NEXT_PUBLIC_ADMIN_APP_URL],
] as const) {
  if (!value && !production) continue;
  if (!value) throw new Error(`${name} must be set to its HTTPS workspace origin before building.`);
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (production ? url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) : !["http:", "https:"].includes(url.protocol))) {
    throw new Error(`${name} must be a valid ${production ? "public HTTPS" : "HTTP(S)"} workspace origin.`);
  }
}

for (const value of (process.env.NEXT_PUBLIC_PAYMENT_CHECKOUT_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean)) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("NEXT_PUBLIC_PAYMENT_CHECKOUT_ORIGINS must contain exact HTTPS provider origins.");
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' blob: data:",
  `connect-src 'self' ${api.origin}${production ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { qualities: [75, 78] },
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
      ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }, { source: "/:private(dashboard|appointments|profile|records|care-plan|care|notifications|payments|support|checkout|documents|reset-password|verify-email|forgot-password)/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
};
export default nextConfig;
