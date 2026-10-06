import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FlowDemo } from "@/components/flow/demo/FlowDemo";
import { getClinicAccess, getSession, homePath } from "@/lib/flow/session";
import { supabaseSource } from "@/lib/flow/supabase-source";

/*
  The real Pulse: the demo's shell and screens over the signed-in clinic's
  data. Who is signed in, which clinic they belong to and their role come
  from Supabase Auth and the members table; nobody else's rows can load, and
  each role loads only what it may see (row-level security, migration 0009).
  Without an active membership there is nothing real to show: an invitation
  or an ended access goes to /pulse/convite, a paid subscription on to
  onboarding, anyone else back to the demo (homePath).
*/

export const metadata: Metadata = {
  title: { default: "Pulse", template: "%s · Wuavy Pulse" },
  robots: { index: false },
};

export default async function FlowAppLayout({ children }: LayoutProps<"/pulse/app">) {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar");
  if (!session.member) redirect(await homePath());

  const [data, access] = await Promise.all([
    supabaseSource(session.supabase, session.member.role).load(session.member.organization_id),
    getClinicAccess(),
  ]);
  return (
    <FlowDemo
      initial={data}
      access={access!}
      account={{ id: session.user.id, name: session.member.name, email: session.user.email ?? "", role: session.member.role }}
    >
      {children}
    </FlowDemo>
  );
}
