"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES } from "./roles";
import { getSession } from "./session";
import { Invalid, describe, id, oneOf, required, text, write, type Result } from "./write";

/*
  Configurações → Equipe. The owner adds people by name, e-mail and role;
  each one gets their own Supabase Auth account (nobody shares the owner's
  password) and belongs to this clinic only. Creating the account and its
  one-time link needs the service role, so it runs here, on the server, after
  the session says the person asking is the clinic's active owner; the key
  never reaches a browser.

  How someone joins:
  - an e-mail with no account: the account is created, invited, and the
    owner gets a link to send (WhatsApp or e-mail). It opens /pulse/convite,
    where the person sets their password and joins;
  - an account nobody has used yet: the same, with a new link;
  - an account already in use (say, someone who tried the demo): no link,
    which would sign the owner into someone else's account. The person signs
    in with their own password and accepts the invitation there.

  Roles and access change through pulse_team_update (migration 0009), which
  checks the owner again and keeps the clinic with an active owner. Nobody
  is deleted: a disabled member keeps their name on everything they did.
*/

export interface InviteResult extends Result {
  /** The one-time link to send, when there is one. */
  link?: string;
  /** The e-mail already had an account in use: the person accepts after signing in. */
  existing?: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** This site's address, from the request: where the link opens. */
async function origin() {
  const h = await headers();
  const from = h.get("origin");
  if (from && /^https?:\/\/[^/\s]+$/.test(from)) return from;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
}

function admin() {
  try {
    return createAdminClient();
  } catch (error) {
    console.error("team: admin client", error);
    throw new Invalid("O servidor ainda não está configurado para convidar pessoas.");
  }
}

/**
 * A one-time link that signs the invited person in on /pulse/convite, made
 * without sending any e-mail (the owner sends it). "invite" creates the
 * account when there is none, or renews an account still unconfirmed; an
 * account confirmed but never used gets a sign-in link instead.
 */
async function joinLink(email: string, name?: string) {
  const auth = admin().auth.admin;
  let { data, error } = await auth.generateLink({ type: "invite", email, options: name ? { data: { name } } : undefined });
  let type = "invite";
  if (error?.code === "email_exists") {
    ({ data, error } = await auth.generateLink({ type: "magiclink", email }));
    type = "magiclink";
  }
  if (error || !data.user || !data.properties?.hashed_token) {
    console.error("team: generateLink", error);
    throw new Invalid("Não foi possível gerar o link de convite. Tente de novo.");
  }
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type });
  return { userId: data.user.id, link: `${await origin()}/pulse/convite?${params}` };
}

/** Adds someone to the team, invited until they join. Returns the link to send them, when there is one. */
export async function inviteMember(form: FormData): Promise<InviteResult> {
  let link: string | undefined;
  let existing = false;
  const result = await write(async (_db, org, who) => {
    const name = required(text(form, "name", 120), "o nome");
    const email = required(text(form, "email", 320).toLowerCase(), "o e-mail");
    if (!EMAIL.test(email)) throw new Invalid("Confira o e-mail.");
    const role = oneOf(text(form, "role"), ROLES, "a função");
    const db = admin();

    const { data: found, error } = await db.rpc("pulse_user_by_email", { lookup: email });
    if (error) return error;
    const account = found?.[0];
    if (account) {
      const { data: memberships, error: membershipsError } = await db
        .from("members")
        .select("organization_id, status")
        .eq("user_id", account.id);
      if (membershipsError) return membershipsError;
      const here = memberships.find((m) => m.organization_id === org);
      if (here?.status === "active") throw new Invalid("Essa pessoa já faz parte da equipe.");
      if (here?.status === "invited") throw new Invalid("Essa pessoa já foi convidada. Use “Gerar novo link” na lista da equipe.");
      if (here?.status === "disabled") throw new Invalid("Essa pessoa já fez parte da equipe. Reative o acesso dela na lista.");
      if (memberships.some((m) => m.status !== "disabled")) throw new Invalid("Este e-mail já está na equipe de outra clínica do Pulse.");
    }

    let userId = account?.id;
    if (!account || !account.last_sign_in_at) {
      const made = await joinLink(email, name);
      userId = made.userId;
      link = made.link;
    } else {
      existing = true;
    }

    const inserted = await db.from("members").insert({
      organization_id: org,
      user_id: userId!,
      name,
      role,
      status: "invited",
      email,
      invited_by: who.userId,
      invited_at: new Date().toISOString(),
    });
    if (inserted.error?.code === "23505") throw new Invalid("Este e-mail já está na equipe de outra clínica do Pulse.");
    return inserted.error;
  }, (can) => can.team);
  return result.error ? result : { link, existing };
}

/** A new link for someone invited who has not joined yet (the last one expired or got lost). */
export async function renewInvite(userId: string): Promise<InviteResult> {
  let link: string | undefined;
  let existing = false;
  const result = await write(async (_db, org) => {
    const db = admin();
    const { data: member, error } = await db
      .from("members")
      .select("email, status")
      .eq("organization_id", org)
      .eq("user_id", id(userId))
      .maybeSingle();
    if (error) return error;
    if (!member || member.status !== "invited") throw new Invalid("Este convite não está mais pendente.");
    const { data: account } = await db.auth.admin.getUserById(userId);
    if (account.user?.last_sign_in_at) {
      existing = true;
      return null;
    }
    if (!member.email) throw new Invalid("Este convite não tem e-mail.");
    link = (await joinLink(member.email)).link;
    return null;
  }, (can) => can.team);
  return result.error ? result : { link, existing };
}

/** A member's role, or their access (disabled, or active again). Their records stay either way. */
export async function updateMember(userId: string, change: { role?: string; status?: "active" | "disabled" }): Promise<Result> {
  return write(async (db, org) => {
    const { error } = await db.rpc("pulse_team_update", {
      org,
      member: id(userId),
      new_role: change.role ? oneOf(change.role, ROLES, "a função") : undefined,
      new_status: change.status,
    });
    if (error?.message.includes("last owner")) throw new Invalid("A clínica precisa de pelo menos um responsável ativo.");
    if (error?.code === "23505") throw new Invalid("Essa pessoa está na equipe de outra clínica agora; não dá para reativar.");
    return error;
  }, (can) => can.team);
}

/**
 * The invited person joins: their membership becomes active, with the name
 * they confirm. Their password was set just before, in the browser, by their
 * own session (the invitation page).
 */
export async function acceptInvite(form: FormData): Promise<Result> {
  const session = await getSession();
  if (!session) return { error: "Sua sessão expirou. Abra o link de convite de novo." };
  if (!session.pending) return session.member ? {} : { error: "Não há convite pendente para esta conta." };
  const { error } = await session.supabase.rpc("pulse_accept_invite", {
    org: session.pending.organization_id,
    display_name: text(form, "name", 120) || undefined,
  });
  if (error) return { error: describe(error) };
  refresh();
  return {};
}
