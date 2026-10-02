import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
