import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { READ_ONLY_MESSAGE } from "./access";
import { permissionsFor, type Permissions } from "./roles";
import { getClinicAccess, getSession } from "./session";

/*
  What every write of the real Pulse goes through (actions.ts, team.ts,
  conversation-actions.ts): the clinic and the person come from the verified
  session, never from the browser; the person's role must allow the write
  (the database checks it again, migration 0009); a subscription that is not
  active only reads; input the person can fix goes back to the form; and
  the route refreshes, so the screen shows the database. Nothing internal
  (a table, a constraint, a stack) reaches the person.
*/

export interface Result {
  error?: string;
}

export type Db = SupabaseClient<Database>;

/** Who is writing: the verified session's person, their role and what it allows. */
export interface Writer {
  userId: string;
  role: string;
  can: Permissions;
}

/** Input the person can fix: its message goes back to the form. */
export class Invalid extends Error {}

export const NO_PERMISSION = "Seu acesso não permite esta ação. Fale com o responsável pela clínica.";

export async function write(
  step: (db: Db, org: string, who: Writer) => Promise<PostgrestError | null>,
  allow?: (can: Permissions) => boolean,
): Promise<Result> {
  const session = await getSession();
  if (!session?.member) return { error: "Sua sessão expirou ou seu acesso mudou. Entre de novo." };
  const can = permissionsFor(session.member.role);
  if (allow && !allow(can)) return { error: NO_PERMISSION };
  // A subscription that is not active reads, never writes: checked here, whatever the screen showed.
  if (!(await getClinicAccess())?.canEdit) return { error: READ_ONLY_MESSAGE };
  try {
    const error = await step(session.supabase, session.member.organization_id, {
      userId: session.user.id,
      role: session.member.role,
      can,
    });
    if (error) return { error: describe(error) };
  } catch (error) {
    if (error instanceof Invalid) return { error: error.message };
    throw error;
  }
  refresh();
  return {};
}

export function describe(error: PostgrestError) {
  if (error.code === "23514") return "Algum valor está fora do permitido.";
  if (error.code === "23503") return "Há outros registros ligados a este.";
  if (error.code === "42501") return NO_PERMISSION;
  if (error.code === "P0002") return "Registro não encontrado.";
  if (error.code === "22023" && error.message.includes("not yet")) {
    return "Finalizar ou marcar falta só no dia do atendimento ou depois.";
  }
  // A column the database does not have yet: the schema is behind the app.
  if (error.code === "PGRST204" || error.code === "PGRST202" || error.code === "42703" || error.code === "42883") {
    return "Falta atualizar o banco de dados do Pulse (migrations em supabase/migrations).";
  }
  console.error("Pulse write failed", error);
  return "Não foi possível salvar. Tente de novo.";
}

/** An update or delete that matched nothing touched a row this clinic can't see. */
export function affected({ data, error }: { data: unknown[] | null; error: PostgrestError | null }) {
  if (error) return error;
  if (!data?.length) throw new Invalid("Registro não encontrado.");
  return null;
}

/* ── Input ─────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function text(form: FormData, key: string, max = 200) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function required(value: string, what: string) {
  if (!value) throw new Invalid(`Informe ${what}.`);
  return value;
}

export function id(value: string) {
  if (!UUID.test(value)) throw new Invalid("Registro inválido.");
  return value;
}

export const optionalId = (value: string) => (value ? id(value) : null);

export function oneOf<T extends string>(value: string, options: readonly T[], what: string): T {
  if (!(options as readonly string[]).includes(value)) throw new Invalid(`Escolha ${what}.`);
  return value as T;
}

/** "1.240", "1240,50" or "R$ 380" to cents. */
export function cents(value: string, what: string) {
  const n = Number(value.replace(/[R$\s.]/g, "").replace(",", "."));
  if (!value || !Number.isFinite(n) || n < 0) throw new Invalid(`Informe ${what} em reais.`);
  return Math.round(n * 100);
}

export function whole(value: string, what: string) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Invalid(`Informe ${what}.`);
  return n;
}

/** "0,5" or "2" to a quantity of stock, to the thousandth. */
export function amount(value: string, what: string, { zero = false } = {}) {
  const n = Number(value.replace(",", "."));
  if (!value || !Number.isFinite(n) || n < 0 || (!zero && n === 0)) throw new Invalid(`Informe ${what}.`);
  return Math.round(n * 1000) / 1000;
}

export function isoDate(value: string, what: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Invalid(`Informe ${what}.`);
  return value;
}
