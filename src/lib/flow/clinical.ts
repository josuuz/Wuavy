/*
  The clinical file's shapes and rules, with no server and no database in them,
  so the forms, the server actions and the tests all read the same file.

  Two halves make an anamnesis. The five fixed answers below are columns of
  their own in the database (migration 0014), because an allergy must never
  depend on a clinic's template still having that field, nor on a screen
  knowing to render it. Everything else is the clinic's own questionnaire: a
  published, frozen list of questions, and the answers keyed by their `key`.

  A filled sheet carries a copy of the questions it answered, so it goes on
  meaning what it meant the day it was signed even after the form moves on.
  That copy is what this module reads back; the live form is only for new ones.
*/

/** The five the product always asks, whatever the clinic's form says. */
export const FIXED_FIELDS = [
  { key: "healthHistory", column: "health_history", label: "Histórico de saúde", max: 4000, rows: 4 },
  { key: "allergies", column: "allergies", label: "Alergias", max: 2000, rows: 2 },
  { key: "medications", column: "medications", label: "Medicamentos em uso", max: 2000, rows: 2 },
  { key: "contraindications", column: "contraindications", label: "Contraindicações", max: 2000, rows: 2 },
  { key: "goals", column: "goals", label: "Objetivos estéticos", max: 2000, rows: 3 },
] as const;

export type FixedKey = (typeof FIXED_FIELDS)[number]["key"];

/**
 * What a clinic may ask. `choice` is one answer out of a list, `list` is any
 * number of them; `boolean` is the yes/no that most intake questions really
 * are. Anything longer than a line is `text`.
 */
export const FIELD_KINDS = ["text", "boolean", "choice", "list", "date"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const KIND_LABEL: Record<FieldKind, string> = {
  text: "Texto",
  boolean: "Sim ou não",
  choice: "Escolha uma",
  list: "Escolha várias",
  date: "Data",
};

export interface AnamnesisField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** For `choice` and `list`. */
  options?: string[];
  /** For `text`. */
  max?: number;
}

/** One answer, as it is stored: the shape follows the field's kind. */
export type Answer = string | boolean | string[] | null;

export const FIELD_MAX = 40;
export const OPTION_MAX = 30;
export const TEXT_MAX = 4000;

/** A key the database and a URL can both carry, derived from the question. */
export function keyFor(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "pergunta";
}

/**
 * Reads a questionnaire that came from the database or from a form. Anything
 * malformed is dropped rather than guessed at: a half-understood question is
 * worse than a missing one, and the sheet it belongs to is already written.
 */
export function readFields(raw: unknown): AnamnesisField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AnamnesisField[] = [];
  for (const item of raw.slice(0, FIELD_MAX)) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === "string" ? f.key.slice(0, 40) : "";
    const label = typeof f.label === "string" ? f.label.trim().slice(0, 200) : "";
    const kind = FIELD_KINDS.find((k) => k === f.kind);
    if (!key || !label || !kind || seen.has(key)) continue;
    seen.add(key);
    const options =
      (kind === "choice" || kind === "list") && Array.isArray(f.options)
        ? f.options
            .filter((o): o is string => typeof o === "string" && o.trim() !== "")
            .map((o) => o.trim().slice(0, 120))
            .slice(0, OPTION_MAX)
        : undefined;
    // A choice with nothing to choose from is not a question.
    if ((kind === "choice" || kind === "list") && !options?.length) continue;
    out.push({
      key,
      label,
      kind,
      ...(f.required === true ? { required: true } : {}),
      ...(options ? { options } : {}),
      ...(kind === "text" && typeof f.max === "number" && f.max > 0 ? { max: Math.min(Math.round(f.max), TEXT_MAX) } : {}),
    });
  }
  return out;
}

/** What is wrong with a questionnaire, in a line someone can act on; null when it is fine. */
export function checkFields(fields: AnamnesisField[]): string | null {
  if (!fields.length) return "Acrescente ao menos uma pergunta.";
  if (fields.length > FIELD_MAX) return `Um formulário vai até ${FIELD_MAX} perguntas.`;
  const keys = new Set<string>();
  for (const field of fields) {
    if (!field.label.trim()) return "Toda pergunta precisa de um enunciado.";
    if (keys.has(field.key)) return `Duas perguntas têm a mesma chave (${field.key}).`;
    keys.add(field.key);
    if ((field.kind === "choice" || field.kind === "list") && !field.options?.length) {
      return `"${field.label}" precisa de opções para escolher.`;
    }
  }
  return null;
}

/**
 * The answers, read against the questions they belong to. Unknown keys are
 * dropped: they are either a question that has since gone or something the
 * browser made up, and neither belongs in a patient's file.
 */
export function readAnswers(fields: AnamnesisField[], raw: unknown): Record<string, Answer> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, Answer> = {};
  for (const field of fields) {
    const value = source[field.key];
    if (value === undefined || value === null || value === "") continue;
    if (field.kind === "boolean") {
      if (typeof value === "boolean") out[field.key] = value;
      else if (value === "sim" || value === "true") out[field.key] = true;
      else if (value === "nao" || value === "não" || value === "false") out[field.key] = false;
      continue;
    }
    if (field.kind === "list") {
      const picked = (Array.isArray(value) ? value : [value])
        .filter((v): v is string => typeof v === "string")
        .filter((v) => field.options?.includes(v));
      if (picked.length) out[field.key] = picked;
      continue;
    }
    if (typeof value !== "string") continue;
    if (field.kind === "choice") {
      if (field.options?.includes(value)) out[field.key] = value;
      continue;
    }
    if (field.kind === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) out[field.key] = value;
      continue;
    }
    const trimmed = value.trim().slice(0, field.max ?? 2000);
    if (trimmed) out[field.key] = trimmed;
  }
  return out;
}

/** Which required questions were left empty, by label, for the form to point at. */
export function missingRequired(fields: AnamnesisField[], answers: Record<string, Answer>): string[] {
  return fields.filter((f) => f.required && (answers[f.key] === undefined || answers[f.key] === "")).map((f) => f.label);
}

/** How an answer reads on the screen, whatever its kind. */
export function showAnswer(value: Answer): string {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return value ?? "";
}
