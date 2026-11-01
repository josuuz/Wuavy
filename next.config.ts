import type { NextConfig } from "next";

/*
  Headers every response carries: no framing of the site or Clinavy by
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
      // The installed app's old manifest address: a browser that checks it for updates is sent to the new one.
      { source: "/pulse.webmanifest", destination: "/clinavy.webmanifest", permanent: true },
      // The product's pages (/pulse, and /flow before it) are redirected in src/proxy.ts, only for GET and HEAD,
      // never for the API or for a POST: a redirect here would answer every method.
    ];
  },
};

export default nextConfig;
