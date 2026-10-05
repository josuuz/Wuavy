import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FlowDemo } from "@/components/flow/demo/FlowDemo";
import { DEMO_ACCESS } from "@/lib/flow/access";
import { getSession, markJourney } from "@/lib/flow/session";
import { DEMO_ORGANIZATION, demoSource } from "@/lib/flow/source";

/*
  The Pulse demo is an app, not a page of the site: its own group, no site
  header or footer. It opens to anyone with an account (free, no
  subscription): the account is the lead. The data is always the demo's own
  fictitious clinic, loaded here; no real clinic's row ever reaches it.
*/

export const metadata: Metadata = {
  title: { default: "Demo", template: "%s · Wuavy Pulse" },
  description: "Demonstração navegável do Wuavy Pulse com dados ilustrativos de uma clínica de estética.",
  robots: { index: false },
};

export default async function FlowDemoLayout({ children }: LayoutProps<"/pulse/demo">) {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?depois=demo");

  const [data] = await Promise.all([demoSource.load(DEMO_ORGANIZATION), markJourney("demo")]);
  const name = session.member?.name ?? (session.user.user_metadata?.name as string | undefined) ?? "";
  // isDemoMode: fictitious data, every action simulated in the browser.
  return (
    <FlowDemo initial={data} access={DEMO_ACCESS} account={{ name, email: session.user.email ?? "", role: "demo" }}>
      {children}
    </FlowDemo>
  );
}
