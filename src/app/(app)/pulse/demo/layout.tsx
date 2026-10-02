import type { Metadata } from "next";

import { FlowDemo } from "@/components/flow/demo/FlowDemo";
import { DEMO_ACCESS } from "@/lib/flow/access";
import { DEMO_ORGANIZATION, demoSource } from "@/lib/flow/source";

/*
  The Pulse demo is an app, not a page of the site: its own group, no site
  header or footer. The data is loaded here, through the FlowSource; moving
  to Supabase means changing this one line.
*/

export const metadata: Metadata = {
  title: { default: "Demo", template: "%s · Wuavy Pulse" },
  description: "Demonstração navegável do Wuavy Pulse com dados ilustrativos de uma clínica de estética.",
  robots: { index: false },
};

export default async function FlowDemoLayout({ children }: LayoutProps<"/pulse/demo">) {
  const data = await demoSource.load(DEMO_ORGANIZATION);
  // isDemoMode: fictitious data, every action simulated in the browser.
  return (
    <FlowDemo initial={data} access={DEMO_ACCESS}>
      {children}
    </FlowDemo>
  );
}
