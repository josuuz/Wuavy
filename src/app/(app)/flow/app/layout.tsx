import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FlowDemo } from "@/components/flow/demo/FlowDemo";
import { getSession } from "@/lib/flow/session";
import { supabaseSource } from "@/lib/flow/supabase-source";

/*
  The real Flow: the demo's shell and screens over the signed-in clinic's
  data. Who is signed in and which clinic they belong to come from Supabase
  Auth and the members table; nobody else's rows can load (row-level security).
*/

export const metadata: Metadata = {
  title: { default: "Flow", template: "%s · Wuavy Flow" },
  robots: { index: false },
};

export default async function FlowAppLayout({ children }: LayoutProps<"/flow/app">) {
  const session = await getSession();
  if (!session) redirect("/flow/entrar");
  if (!session.member) redirect("/flow/comecar");

  const data = await supabaseSource(session.supabase).load(session.member.organization_id);
  return (
    <FlowDemo initial={data} account={{ name: session.member.name }}>
      {children}
    </FlowDemo>
  );
}
