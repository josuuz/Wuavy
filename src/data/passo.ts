/*
  PASSO's diagnosis: a few quick questions and a local, deterministic
  recommendation (no AI, no server). A small graph: every answer leads to the
  next question or to a result, and no path asks more than three questions.
  Each answer also carries a first-person line (`say`) for the WhatsApp
  message, so the conversation arrives already told.
  The graph and its words live in each locale's dictionary (src/i18n): this
  file holds its shape and the logic that walks it.
*/

export type Stage = "identidade" | "website" | "trafego" | "automacao";

export const stageOrder: Stage[] = ["identidade", "website", "trafego", "automacao"];

const questionIds = [
  "goal",
  "hasSite",
  "handling",
  "brandForAds",
  "brandForSite",
  "siteAds",
  "brandSite",
  "bottleneck",
  "pain",
  "salesSite",
  "brandCheck",
] as const;

export type QuestionId = (typeof questionIds)[number];

export type ResultId =
  | "trafego"
  | "trafegoCrm"
  | "websiteTrafego"
  | "identidadeWebsite"
  | "website"
  | "identidade"
  | "atendimento"
  | "crm"
  | "processos";

export interface Answer {
  label: string;
  say: string;
  next: QuestionId | ResultId;
}

export interface Question {
  text: string;
  answers: Answer[];
}

export interface Result {
  /** What the card shows. */
  title: string;
  /** How the WhatsApp message names it. */
  service: string;
  why: string;
  /** The stages of the growth path this recommendation covers now. */
  now: Stage[];
}

/** Everything PASSO says, in one locale. Plain data: it is handed to the client. */
export interface PassoCopy {
  guide: {
    name: string;
    kicker: string;
    hello: string;
    start: string;
    later: string;
    resultKicker: string;
    path: string;
    pathNext: string;
    ask: string;
    cta: string;
    restart: string;
    close: string;
    open: string;
    hint: string;
    back: string;
    /** Read before each question: {done} and {total}. */
    progress: string;
    /** Read after the stages the recommendation covers now. */
    now: string;
  };
  stages: Record<Stage, string>;
  questions: Record<QuestionId, Question>;
  results: Record<ResultId, Result>;
  message: {
    hello: string;
    /** Closes the WhatsApp message: {service}. */
    recommended: string;
  };
}

export const isQuestion = (id: QuestionId | ResultId): id is QuestionId =>
  (questionIds as readonly string[]).includes(id);

/** The most questions still ahead of `id`, itself included. */
export function questionsLeft(questions: PassoCopy["questions"], id: QuestionId): number {
  return (
    1 + Math.max(0, ...questions[id].answers.map((a) => (isQuestion(a.next) ? questionsLeft(questions, a.next) : 0)))
  );
}

/** Fills {name} placeholders. */
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

export function whatsappMessage(copy: PassoCopy, answers: Answer[], result: Result): string {
  return [copy.message.hello, ...answers.map((a) => a.say), fill(copy.message.recommended, { service: result.service })].join(
    " ",
  );
}
