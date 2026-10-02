import type { Metadata } from "next";

import { Overview } from "@/components/flow/demo/views/Overview";

// Same segment as the layout, so its title template does not reach here.
export const metadata: Metadata = { title: { absolute: "Visão geral · Wuavy Pulse" } };

export default function FlowDemoPage() {
  return <Overview />;
}
