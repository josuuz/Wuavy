"use server";

import { redirect } from "next/navigation";

import { RULE_TEMPLATES } from "@/data/flow-demo";
import { releases } from "@/lib/flow/access";
import { getSession, getSubscription } from "@/lib/flow/session";
import { LOGO_MAX, SEGMENTS, TEAM_SIZES } from "@/lib/flow/types";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  Onboarding's last step: the clinic, its owner, and the subscription that
  paid for it. Row-level security lets nobody insert these rows, so this runs
  with the service role, on the server only, for exactly one person: the one
  Supabase Auth says is signed in, who belongs to no clinic yet and whose
  subscription Mercado Pago confirmed (checked here again, whatever the
  browser showed). The clinic starts with the automation templates switched
  off, for the owner to choose from.
*/

export interface ClinicState {
  error?: string;
  done?: boolean;
}

const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const field = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

export async function createClinic(_: ClinicState | null, form: FormData): Promise<ClinicState> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar");
  if (session.member) redirect("/pulse/app");
  const subscription = await getSubscription();
  if (!subscription || !releases(subscription.status) || subscription.organization_id) redirect("/pulse/assinar");

  const clinic = field(form, "clinic", 120);
  const name = field(form, "name", 120);
  const whatsapp = field(form, "whatsapp", 40);
  const segment = field(form, "segment", 40);
  const teamSize = field(form, "team", 10);
  const opens = field(form, "opens", 5);
  const closes = field(form, "closes", 5);
  const days = form
    .getAll("days")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!clinic || !name) return { error: "Informe o nome da clínica e o seu nome." };
  if (whatsapp.replace(/\D/g, "").length < 10) return { error: "Informe o WhatsApp da clínica com DDD." };
  if (!(SEGMENTS as readonly string[]).includes(segment)) return { error: "Escolha o tipo de clínica." };
  if (!(TEAM_SIZES as readonly string[]).includes(teamSize)) return { error: "Escolha quantos profissionais atendem." };
  if (!TIME.test(opens) || !TIME.test(closes) || opens >= closes) return { error: "Confira o horário de funcionamento." };
  if (!days.length) return { error: "Escolha ao menos um dia de atendimento." };
  const logo = form.get("logo");
  const hasLogo = logo instanceof File && logo.size > 0;
  if (hasLogo && (!(logo.type in LOGO_TYPES) || logo.size > LOGO_MAX)) {
    return { error: "O logo precisa ser PNG, JPG ou WebP de até 800 KB." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error(error);
    return { error: "O servidor ainda não está configurado para criar clínicas." };
  }

  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: clinic,
      segment,
      whatsapp,
      team_size: teamSize,
      opening_time: opens,
      closing_time: closes,
      work_days: [...new Set(days)].sort(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("createClinic: organization", error);
    return { error: "Não foi possível criar a clínica. Tente de novo." };
  }
  const undo = async (why: string, cause: unknown) => {
    // No clinic half made: the organization goes, and its member with it (cascade).
    await admin.from("organizations").delete().eq("id", org.id);
    console.error(`createClinic: ${why}`, cause);
    return { error: "Não foi possível criar a clínica. Tente de novo." };
  };

  const { error: memberError } = await admin
    .from("members")
    .insert({ organization_id: org.id, user_id: session.user.id, name, role: "owner" });
  if (memberError) return undo("member", memberError);

  // The subscription becomes the clinic's, only if it still has none: two tabs submitting make one clinic.
  const { data: attached, error: attachError } = await admin
    .from("subscriptions")
    .update({ organization_id: org.id, updated_at: new Date().toISOString() })
    .eq("id", subscription.id)
    .is("organization_id", null)
    .select("id");
  if (attachError || !attached?.length) return undo("subscription", attachError ?? "already attached");

  const { error: rulesError } = await admin.from("automation_rules").insert(
    RULE_TEMPLATES.map(({ kind, name: rule, when, conditions, actions }) => ({
      organization_id: org.id,
      kind,
      name: rule,
      when,
      conditions,
      actions,
      active: false,
    })),
  );
  // The templates help, they are not the clinic: without them it still works.
  if (rulesError) console.error("createClinic: automation templates", rulesError);

  if (hasLogo) {
    const path = `${org.id}/logo.${LOGO_TYPES[logo.type as keyof typeof LOGO_TYPES]}`;
    const upload = await admin.storage.from("clinic-logos").upload(path, logo, { contentType: logo.type, upsert: true });
    if (upload.error) console.error("createClinic: logo", upload.error);
    else {
      const { data } = admin.storage.from("clinic-logos").getPublicUrl(path);
      await admin.from("organizations").update({ logo_url: data.publicUrl }).eq("id", org.id);
    }
  }

  return { done: true };
}
