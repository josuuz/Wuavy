"use server";

import { redirect } from "next/navigation";

import { getSession } from "@/lib/flow/session";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  The first step of a real clinic: the organization and its owner. Row-level
  security lets nobody insert either row, so this runs with the service role,
  on the server only, and for exactly one person: the one Supabase Auth says
  is signed in, who belongs to no clinic yet.
*/

export interface ClinicState {
  error?: string;
}

const field = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

export async function createClinic(_: ClinicState | null, form: FormData): Promise<ClinicState> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar");
  if (session.member) redirect("/pulse/app");

  const clinic = field(form, "clinic", 120);
  const city = field(form, "city", 80);
  const name = field(form, "name", 120);
  if (!clinic || !name) return { error: "Informe o nome da clínica e o seu nome." };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error(error);
    return { error: "O servidor ainda não está configurado para criar clínicas." };
  }

  const { data: org, error } = await admin.from("organizations").insert({ name: clinic, city: city || null }).select("id").single();
  if (error) {
    console.error("createClinic: organization", error);
    return { error: "Não foi possível criar a clínica. Tente de novo." };
  }

  const { error: memberError } = await admin
    .from("members")
    .insert({ organization_id: org.id, user_id: session.user.id, name, role: "owner" });
  if (memberError) {
    // No clinic without an owner: undo the first insert.
    await admin.from("organizations").delete().eq("id", org.id);
    console.error("createClinic: member", memberError);
    return { error: "Não foi possível criar a clínica. Tente de novo." };
  }

  redirect("/pulse/app");
}
