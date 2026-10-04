import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FlowDemo } from "@/components/flow/demo/FlowDemo";
import { getClinicAccess, getSession } from "@/lib/flow/session";
import { supabaseSource } from "@/lib/flow/supabase-source";

/*
  The real Pulse: the demo's shell and screens over the signed-in clinic's
  data. Who is signed in and which clinic they belong to come from Supabase
  Auth and the members table; nobody else's rows can load (row-level security).
*/

export const metadata: Metadata = {
  title: { default: "Pulse", template: "%s · Wuavy Pulse" },
  robots: { index: false },
};

export default async function FlowAppLayout({ children }: LayoutProps<"/pulse/app">) {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar");
  if (!session.member) redirect("/pulse/comecar");

  const [data, access] = await Promise.all([
    supabaseSource(session.supabase).load(session.member.organization_id),
    getClinicAccess(),
  ]);
  return (
    <FlowDemo
      initial={data}
      access={access!}
      account={{ name: session.member.name, email: session.user.email ?? "", role: session.member.role }}
    >
      {children}
    </FlowDemo>
  );
}
