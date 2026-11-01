import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { ClinicForm } from "@/components/flow/auth/ClinicForm";
import { releases } from "@/lib/flow/access";
import { getSession, getSubscription } from "@/lib/flow/session";

export const metadata: Metadata = {
  title: { absolute: "Configurar o Clinavy · Clinavy" },
  robots: { index: false },
};

/* Onboarding: only after the subscription is confirmed by the server, and only once. */
export default async function CreateClinicPage() {
  const session = await getSession();
  if (!session) redirect("/clinavy/entrar");
  if (session.member) redirect("/clinavy/app");
  const subscription = await getSubscription();
  if (!releases(subscription?.status) || subscription?.organization_id) redirect("/clinavy/assinar");

  return (
    <AuthFrame>
      <ClinicForm name={(session.user.user_metadata?.name as string | undefined) ?? ""} />
    </AuthFrame>
  );
}
