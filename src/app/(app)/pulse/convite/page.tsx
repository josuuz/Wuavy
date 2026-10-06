import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { InviteAccept, type InviteState } from "@/components/flow/auth/InviteAccept";
import { ROLE_LABEL, isRole } from "@/lib/flow/roles";
import { getSession } from "@/lib/flow/session";

/*
  An invitation to a clinic's team (Configurações → Equipe), or an access
  the owner ended. Who the person is comes from their session: the link's
  code (exchanged in the browser) or their own sign-in. The clinic's name
  comes through pulse_my_memberships, since an invited person can't read the
  clinic's rows yet (migration 0009).
*/

export const metadata: Metadata = {
  title: { absolute: "Convite · Wuavy Pulse" },
  robots: { index: false },
};

export default async function InvitePage() {
  const session = await getSession();
  if (session?.member) redirect("/pulse/app");

  let state: InviteState = { kind: "none", signedIn: Boolean(session) };
  const membership = session?.pending ?? session?.ended;
  if (session && membership) {
    const { data } = await session.supabase.rpc("pulse_my_memberships");
    const row = data?.find((m) => m.organization_id === membership.organization_id);
    const clinic = row?.clinic ?? "clínica";
    state = session.pending
      ? {
          kind: "pending",
          clinic,
          role: isRole(session.pending.role) ? ROLE_LABEL[session.pending.role] : session.pending.role,
          invitedBy: row?.invited_by_name ?? undefined,
          name: session.pending.name,
        }
      : { kind: "ended", clinic };
  }

  return (
    <AuthFrame
      title={state.kind === "ended" ? "Acesso encerrado" : "Convite para a equipe"}
      lead={
        state.kind === "pending"
          ? "Confirme o seu nome e crie a sua senha para entrar no Pulse da clínica."
          : "Cada pessoa da equipe entra no Pulse com o próprio e-mail e senha."
      }
    >
      <InviteAccept state={state} />
    </AuthFrame>
  );
}
