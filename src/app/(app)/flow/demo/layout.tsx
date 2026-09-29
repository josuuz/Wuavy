import type { Metadata } from "next";

import { FlowDemo } from "@/components/flow/demo/FlowDemo";
import { DEMO_ORGANIZATION, demoSource } from "@/lib/flow/source";

/*
  The Flow demo is an app, not a page of the site: its own group, no site
  header or footer. The data is loaded here, through the FlowSource; moving
  to Supabase means changing this one line.
*/

export const metadata: Metadata = {
  title: { default: "Demo", template: "%s · Wuavy Flow" },
  description: "Demonstração navegável do Wuavy Flow com dados ilustrativos de uma clínica de estética.",
  robots: { index: false },
};

export default async function FlowDemoLayout({ children }: LayoutProps<"/flow/demo">) {
  const data = await demoSource.load(DEMO_ORGANIZATION);
  return <FlowDemo initial={data}>{children}</FlowDemo>;
}
