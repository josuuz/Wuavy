"use server";

import type { Json } from "@/lib/supabase/database.types";

import {
  checkFields,
  FIXED_FIELDS,
  keyFor,
  missingRequired,
  readAnswers,
  readFields,
  type AnamnesisField,
  type Answer,
} from "./clinical";
import { clinicNow } from "./clock";
import { permissionsFor } from "./roles";
import { getSession } from "./session";
import { Invalid, id, optionalId, text, write, type Result } from "./write";

/*
  The anamnesis, in the database (migrations 0014–0016).

  Every read starts by asking for the tables: when Postgres says the relation
  does not exist, the answer carries `state: "absent"` and the screen says the
  feature is waiting on the database. The clinical records that already exist
  are untouched by any of this and go on working through actions.ts.
*/

const asJson = (fields: AnamnesisField[]) => fields as unknown as Json;

/** Postgres and PostgREST, each saying the table is not there. */
const MISSING = new Set(["42P01", "PGRST205", "PGRST200"]);
const isMissing = (error: { code?: string } | null) => Boolean(error?.code && MISSING.has(error.code));

const WAITING = "A anamnese ainda não está disponível: falta aplicar as migrations do Prontuário no banco.";

export interface AnamnesisSheet {
  id: string;
  recordedAt: string;
  authorId?: string;
  updatedBy?: string;
  updatedAt?: string;
  /** The five the product always asks. */
  fixed: Record<string, string>;
  /** The questions as they stood when this sheet was filled. */
  fields: AnamnesisField[];
  answers: Record<string, Answer>;
  /** How many times it has been edited since (anamnesis_revisions). */
  revisions: number;
}

export interface AnamnesisForm {
  id: string;
  name: string;
  procedureId: string | null;
  /** The newest published version, which a new sheet is filled from. */
  versionId: string | null;
  version: number;
  fields: AnamnesisField[];
}

/**
 * Why a file is not showing, when it is not showing. These are four different
 * things and the screen should not say the same sentence for all of them:
 * "the migrations are not applied" is a true statement about `absent` and a
 * misleading one about a network failure or an expired session.
 */
export type ClinicalState =
  | "ready"
  /** The tables are not in this database yet (migrations 0014–0016). */
  | "absent"
  /** This person's role does not reach clinical records at all. */
  | "blocked"
  /** Something else went wrong: a session that lapsed, the network, Postgres. */
  | "failed";

export interface ClinicalFile {
  state: ClinicalState;
  sheets: AnamnesisSheet[];
  forms: AnamnesisForm[];
}

const nothing = (state: ClinicalState): ClinicalFile => ({ state, sheets: [], forms: [] });

/**
 * A patient's anamnesis sheets and the clinic's forms. Read with the signed-in
 * person's own session, so row-level security decides what comes back: nothing
 * at all for the front desk, and only their own patients for a professional.
 */
export async function loadClinicalFile(patientId: string): Promise<ClinicalFile> {
  const session = await getSession();
  if (!session?.member) return nothing("failed");
  // Row-level security refuses the front desk on its own; asking here as well
  // means the screen can say why, and one fewer pointless round trip is made.
  if (!permissionsFor(session.member.role).records) return nothing("blocked");
  const org = session.member.organization_id;
  let patient: string;
  try {
    patient = id(patientId);
  } catch {
    return nothing("failed");
  }

  const db = session.supabase;
  const sheets = await db
    .from("anamneses")
    .select(
      "id, recorded_at, author_id, updated_by, updated_at, health_history, allergies, medications, contraindications, goals, fields_snapshot, answers",
    )
    .eq("organization_id", org)
    .eq("patient_id", patient)
    .order("recorded_at", { ascending: false })
    .limit(50);
  // The table is not there yet: the feature is off, and this is not an error.
  if (isMissing(sheets.error)) return nothing("absent");
  // Anything else is a failure, and saying "waiting on the database" about it
  // would send someone to look in the wrong place.
  if (sheets.error) {
    console.error("loadClinicalFile: sheets", sheets.error);
    return nothing("failed");
  }

  const ids = (sheets.data ?? []).map((row) => row.id as string);
  const [revisions, forms] = await Promise.all([
    ids.length
      ? db.from("anamnesis_revisions").select("anamnesis_id").eq("organization_id", org).in("anamnesis_id", ids)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("anamnesis_forms")
      .select("id, name, procedure_id, anamnesis_form_versions (id, version, fields)")
      .eq("organization_id", org)
      .is("archived_at", null),
  ]);

  // The forms are the clinic's questionnaires, not the patient's file: losing
  // them means no new sheet can be filled, but the sheets already written must
  // still be readable, so this is logged and the file is served without them.
  if (forms.error) console.error("loadClinicalFile: forms", forms.error);
  if (revisions.error) console.error("loadClinicalFile: revisions", revisions.error);

  const counted = new Map<string, number>();
  for (const row of (revisions.data ?? []) as { anamnesis_id: string }[]) {
    counted.set(row.anamnesis_id, (counted.get(row.anamnesis_id) ?? 0) + 1);
  }

  return {
    state: "ready",
    sheets: (sheets.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const fields = readFields(r.fields_snapshot);
      return {
        id: r.id as string,
        recordedAt: r.recorded_at as string,
        authorId: (r.author_id as string) ?? undefined,
        updatedBy: (r.updated_by as string) ?? undefined,
        updatedAt: (r.updated_at as string) ?? undefined,
        fixed: Object.fromEntries(FIXED_FIELDS.map((f) => [f.key, (r[f.column] as string) ?? ""])),
        fields,
        answers: readAnswers(fields, r.answers),
        revisions: counted.get(r.id as string) ?? 0,
      };
    }),
    forms: ((forms.data ?? []) as Record<string, unknown>[]).map((row) => {
      const versions = ((row.anamnesis_form_versions ?? []) as Record<string, unknown>[])
        .map((v) => ({ id: v.id as string, version: v.version as number, fields: readFields(v.fields) }))
        .sort((a, b) => b.version - a.version);
      const newest = versions[0];
      return {
        id: row.id as string,
        name: row.name as string,
        procedureId: (row.procedure_id as string) ?? null,
        versionId: newest?.id ?? null,
        version: newest?.version ?? 0,
        fields: newest?.fields ?? [],
      };
    }),
  };
}

/**
 * Writes a sheet. A new one copies the questions it is answering, so it keeps
 * meaning what it meant today; an edit changes only the answers, and the
 * database keeps the previous state on its own (anamnesis_revisions).
 */
export async function saveAnamnesis(sheetId: string | null, patientId: string, form: FormData): Promise<Result> {
  return write(
    async (db, org) => {
      const patient = id(patientId);

      /*
        The questions these answers belong to, always read on the server.

        Editing reads them from the sheet's own frozen copy, never from what
        the browser sends. If an edit took the questions from a `versionId` in
        the request, sending a different one — or none — would make every
        answer it does not recognise disappear from a patient's file, quietly,
        in the name of validation. The sheet decides which questions it
        answered; that was settled the day it was written.

        A new sheet has no copy yet, so it takes the published version's, read
        from the database and scoped to this clinic.
      */
      let fields: AnamnesisField[] = [];
      let versionId: string | null = null;
      if (sheetId) {
        const sheet = await db
          .from("anamneses")
          .select("fields_snapshot")
          .eq("organization_id", org)
          .eq("id", id(sheetId))
          .maybeSingle();
        if (isMissing(sheet.error)) throw new Invalid(WAITING);
        if (sheet.error) return sheet.error;
        if (!sheet.data) throw new Invalid("Ficha não encontrada.");
        fields = readFields((sheet.data as { fields_snapshot: unknown }).fields_snapshot);
      } else {
        versionId = optionalId(text(form, "versionId"));
        if (versionId) {
          const version = await db
            .from("anamnesis_form_versions")
            .select("fields")
            .eq("organization_id", org)
            .eq("id", versionId)
            .maybeSingle();
          if (isMissing(version.error)) throw new Invalid(WAITING);
          if (version.error) return version.error;
          if (!version.data) throw new Invalid("O formulário escolhido não existe mais.");
          fields = readFields((version.data as { fields: unknown }).fields);
        }
      }

      let sent: unknown = {};
      try {
        sent = JSON.parse(text(form, "answers", 20000) || "{}");
      } catch {
        throw new Invalid("Não foi possível ler as respostas.");
      }
      const answers = readAnswers(fields, sent);
      const missing = missingRequired(fields, answers);
      if (missing.length) throw new Invalid(`Responda: ${missing.slice(0, 3).join(", ")}.`);

      const fixed = Object.fromEntries(FIXED_FIELDS.map((f) => [f.column, text(form, f.key, f.max) || null]));
      if (!Object.values(fixed).some(Boolean) && !Object.keys(answers).length) {
        throw new Invalid("Preencha ao menos um campo da anamnese.");
      }

      if (sheetId) {
        // The questions and the version are frozen; only the answers change.
        const { data, error } = await db
          .from("anamneses")
          .update({ ...fixed, answers })
          .eq("id", id(sheetId))
          .eq("organization_id", org)
          .select("id");
        if (isMissing(error)) throw new Invalid(WAITING);
        if (error) return error;
        if (!data?.length) throw new Invalid("Ficha não encontrada.");
        return null;
      }

      const { error } = await db.from("anamneses").insert({
        organization_id: org,
        patient_id: patient,
        version_id: versionId,
        fields_snapshot: asJson(fields),
        answers,
        recorded_at: clinicNow(),
        ...fixed,
      });
      if (isMissing(error)) throw new Invalid(WAITING);
      return error;
    },
    (can) => can.records,
  );
}

/**
 * Publishes a questionnaire. A form is never edited in place: a change is a new
 * version, so every sheet already filled goes on reading the way it was signed.
 * Only the clinic's owner shapes the forms (0014's policies say so too).
 */
export async function publishAnamnesisForm(formId: string | null, form: FormData): Promise<Result> {
  return write(
    async (db, org) => {
      const name = text(form, "name", 120);
      if (!name) throw new Invalid("Dê um nome ao formulário.");
      const procedureId = optionalId(text(form, "procedureId"));

      let fields: AnamnesisField[];
      try {
        fields = readFields(JSON.parse(text(form, "fields", 40000) || "[]"));
      } catch {
        throw new Invalid("Não foi possível ler as perguntas.");
      }
      const wrong = checkFields(fields);
      if (wrong) throw new Invalid(wrong);
      // Keys are settled here, not in the browser: two questions may not collide.
      const seen = new Set<string>();
      for (const field of fields) {
        let key = field.key || keyFor(field.label);
        let n = 2;
        while (seen.has(key)) key = `${keyFor(field.label)}_${n++}`;
        seen.add(key);
        field.key = key;
      }

      const api = db;
      let target = formId ? id(formId) : null;
      if (target) {
        const { data, error } = await api
          .from("anamnesis_forms")
          .update({ name, procedure_id: procedureId })
          .eq("id", target)
          .eq("organization_id", org)
          .select("id");
        if (isMissing(error)) throw new Invalid(WAITING);
        if (error) return error;
        if (!data?.length) throw new Invalid("Formulário não encontrado.");
      } else {
        const { data, error } = await api
          .from("anamnesis_forms")
          .insert({ organization_id: org, name, procedure_id: procedureId })
          .select("id")
          .single();
        if (isMissing(error)) throw new Invalid(WAITING);
        if (error) return error;
        target = (data as { id: string }).id;
      }

      // The next version number, read from what is published rather than
      // counted in the browser: two owners publishing at once get different
      // numbers, and unique (organization_id, form_id, version) refuses a tie.
      const last = await api
        .from("anamnesis_form_versions")
        .select("version")
        .eq("organization_id", org)
        .eq("form_id", target)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isMissing(last.error)) throw new Invalid(WAITING);
      const next = ((last.data as { version?: number } | null)?.version ?? 0) + 1;

      const { error } = await api
        .from("anamnesis_form_versions")
        .insert({ organization_id: org, form_id: target, version: next, fields: asJson(fields) });
      if (isMissing(error)) throw new Invalid(WAITING);
      return error;
    },
    (can) => can.admin,
  );
}
