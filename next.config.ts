import type { NextConfig } from "next";

/*
  Headers every response carries: no framing of the site or the Pulse by
  another page (clickjacking), no guessing of content types, no full URLs
  leaked to other sites, and no camera, microphone or location. HTTPS (HSTS)
  is Vercel's.
*/
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // The worker itself is never cached, so a fix to it reaches a phone on the next open.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  async redirects() {
    return [
      // The Pulse's CRM screen is called Vendas now; old links still land on it.
      { source: "/:base(flow|pulse)/demo/crm", destination: "/pulse/demo/vendas", permanent: true },
      { source: "/:base(flow|pulse)/app/crm", destination: "/pulse/app/vendas", permanent: true },
      // Wuavy Flow is Wuavy Pulse now: every old address, query included, lands on its twin.
      { source: "/flow/:path*", destination: "/pulse/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
