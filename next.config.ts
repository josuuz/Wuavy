import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Flow's CRM screen is called Vendas now; old links still land on it.
  async redirects() {
    return [
      { source: "/flow/demo/crm", destination: "/flow/demo/vendas", permanent: true },
      { source: "/flow/app/crm", destination: "/flow/app/vendas", permanent: true },
    ];
  },
};

export default nextConfig;
