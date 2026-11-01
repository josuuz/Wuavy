import type { CSSProperties, ReactNode } from "react";

import { VIEWS } from "@/components/flow/demo/copy";
import { cn } from "@/lib/utils";
import "@/components/flow/pulse-theme.css";
import styles from "./product.module.css";

/*
  The product, drawn on the public page.

  These are not screenshots and not illustrations: they are HTML and CSS
  reading the product's own tokens (components/flow/pulse-theme.css) — its
  light theme, its radii, its type — so a crop here looks like Clinavy
  because it is painted with Clinavy's palette. That buys three things a
  PNG cannot: it is legible on a phone, it reflows, and the motions in the
  sections around it can move its parts.

  Two rules hold everything here honest:

  · the shapes copy the real screens. An opportunity shows a tag, a headline
    with a count, the sentence, what the front is worth, and a button
    (components/flow/demo/views/Opportunities.tsx). Opening it shows "Sugestão
    do Clinavy", then whom Clinavy picked, then the drafted message — in that
    order, because that is the order the product has;
  · nothing here ends in a message sent. The last state of every sequence is
    a draft waiting for a person, which is what the product does today.

  The rail is `aria-hidden`: it is a picture of the product's navigation, and
  the real control is the tab list in the section around it. Screen readers
  get one set of controls, not two.

  The sample rows are fictitious and pt-BR, because the product itself runs
  only in pt-BR: a pt-PT visitor reads the explanation in their own language
  and sees the product's interface as it really is.
*/

/** The product's own surface. Light wherever it is shown, because the site's sections around it are dark. */
export function ProductSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(styles.surface, className)} data-pulse="" data-pulse-theme="light">
      {children}
    </div>
  );
}

/**
 * The app shell as the clinic sees it: the screens in a rail on the left, the
 * current screen's name above the work. On a phone the rail becomes a strip
 * across the top, which is what the product does there too.
 */
export function AppFrame({
  screen,
  rail,
  chip,
  children,
  className,
  bodyClassName,
  contentKey,
  pressSlug,
}: {
  /** The screen's name, shown above the work. */
  screen: string;
  /** Which of the product's screens is lit in the rail, by slug ("" is Visão geral). */
  rail: string;
  /** The plan chip, as the shell shows it. */
  chip?: string;
  children: ReactNode;
  className?: string;
  /** Class of the work area: the tour animates it, so a new screen comes in while the frame and the rail stay put. */
  bodyClassName?: string;
  /** Changes with the screen: only the work area is remounted, never the frame. */
  contentKey?: string;
  /** The rail item that is being pressed right now (the demonstration's cursor), by slug. */
  pressSlug?: string;
}) {
  // The host carries the container; the frame inside answers the query. A
  // container query styles what is inside a container, never the container
  // itself, so the two cannot be the same element.
  return (
    <div className={cn(styles.host, className)}>
      <ProductSurface className={styles.frame}>
        <div className={styles.rail} data-pulse-surface="rail" aria-hidden="true">
          <p className={styles.brand}>
            <span className={styles.brandName}>CLINAVY</span>
          </p>
          <p className={styles.org}>
            Clínica Aurora
            {chip ? <span className={styles.chip}>{chip}</span> : null}
          </p>
          <ul className={styles.nav}>
            {VIEWS.map((view) => (
              <li
                key={view.slug}
                data-slug={view.slug}
                data-here={view.slug === rail ? "" : undefined}
                data-press={view.slug === pressSlug ? "" : undefined}
              >
                {view.label}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.panel}>
          <p className={styles.bar} aria-hidden="true">
            {screen}
          </p>
          <div key={contentKey} className={cn(styles.body, bodyClassName)}>
            {children}
          </div>
        </div>
      </ProductSurface>
    </div>
  );
}

/* ── The opportunity, in the states the product really has ──────────────── */

export type OppStage = "closed" | "open" | "picks" | "draft";

export interface OppPerson {
  name: string;
  detail: string;
  value: string;
}

export interface OppScreen {
  tag: string;
  headline: string;
  sentence: string;
  value: string;
  valueLabel: string;
  action: string;
  suggestion: string;
  picked: string;
  people: readonly OppPerson[];
  draft: string;
}

/** What the product calls the parts of an opportunity, in its own pt-BR. */
export const OPP_LABELS = {
  suggestion: "Sugestão do Clinavy",
  draft: "Mensagem pronta",
  review: "A equipe revisa e envia pelo WhatsApp da clínica.",
  whatsapp: "Abrir no WhatsApp",
  record: "Registrar contato",
} as const;

/**
 * One front, opening the way it opens in the product. `stage` says how far it
 * has been taken, so the hero's sequence and the scenarios show the same card
 * at different depths without two components existing.
 */
export function OpportunityCard({
  screen,
  stage,
  draftLabel,
  reviewNote,
}: {
  screen: OppScreen;
  stage: OppStage;
  /** "Mensagem preparada para revisão", in the page's language. */
  draftLabel?: string;
  /** Who decides to send. Always shown with a draft. */
  reviewNote?: string;
}) {
  const open = stage !== "closed";
  const picks = stage === "picks" || stage === "draft";
  const draft = stage === "draft";

  return (
    <article className={styles.opp} data-stage={stage}>
      <header className={styles.oppHead}>
        <p className={styles.oppTag}>
          <span className="pulse-dot" aria-hidden="true" />
          {screen.tag}
        </p>
        <h4 className={styles.oppHeadline}>{screen.headline}</h4>
        <p className={styles.oppValue}>
          <strong>{screen.value}</strong>
          <span>{screen.valueLabel}</span>
        </p>
        <p className={styles.oppAction} data-on={open ? "" : undefined}>
          {open ? "Fechar" : screen.action}
        </p>
      </header>

      {open ? (
        <div className={styles.oppBody}>
          <p className={styles.oppSentence}>{screen.sentence}</p>

          <section className={styles.suggestion}>
            <p className={styles.kicker}>{OPP_LABELS.suggestion}</p>
            <p className={styles.suggestionText}>{screen.suggestion}</p>
          </section>

          {picks ? (
            <section className={styles.picks}>
              <p className={styles.kicker}>{screen.picked}</p>
              <ul>
                {screen.people.map((person, i) => (
                  <li key={person.name} style={{ "--i": i } as CSSProperties}>
                    <span className={styles.pickName}>{person.name}</span>
                    <span className={styles.pickDetail}>{person.detail}</span>
                    <span className={styles.pickValue}>{person.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {draft ? (
            <section className={styles.draft}>
              <p className={styles.kicker}>{draftLabel ?? OPP_LABELS.draft}</p>
              <p className={styles.draftText}>{screen.draft}</p>
              <p className={styles.draftActions} aria-hidden="true">
                <span className={styles.ghostPrimary}>{OPP_LABELS.whatsapp}</span>
                <span className={styles.ghost}>{OPP_LABELS.record}</span>
              </p>
              <p className={styles.fine}>{reviewNote ?? OPP_LABELS.review}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* ── The five crops of the tour ─────────────────────────────────────────── */

/*
  Fictitious, and chosen to show one task per screen rather than a whole
  dashboard shrunk until nothing reads. Clínica Aurora is the demo's own clinic.
*/
const SAMPLE = {
  attention: [
    { tag: "Orçamentos", text: "3 orçamentos sem resposta", value: "R$ 7.400" },
    { tag: "Retornos", text: "5 pacientes no período de retorno", value: "R$ 6.150" },
    { tag: "Agenda", text: "2 horários livres até amanhã", value: "R$ 980" },
  ],
  today: [
    { hour: "09h", name: "Beatriz S.", what: "Limpeza de pele", who: "Dra. Helena" },
    { hour: "10h30", name: "Carla M.", what: "Avaliação", who: "Dra. Helena" },
    { hour: "14h", name: "Marcos T.", what: "Peeling", who: "Dra. Helena" },
  ],
  agenda: [
    { hour: "09h", name: "Beatriz S.", what: "Limpeza de pele", state: "Confirmado" },
    { hour: "10h30", name: "Carla M.", what: "Avaliação", state: "Confirmado" },
    { hour: "14h", name: null, what: "Horário livre", state: "2 pacientes compatíveis" },
    { hour: "15h30", name: "Lívia C.", what: "Skinbooster", state: "Confirmado" },
  ],
  patients: [
    { name: "Ana P.", last: "Skinbooster · há 4 meses", next: "Retorno hoje", tone: "due" },
    { name: "Beatriz S.", last: "Limpeza de pele · há 3 semanas", next: "Retorno em 5 semanas", tone: undefined },
    { name: "Carla M.", last: "Sem atendimento", next: "Orçamento aberto", tone: "open" },
    { name: "Marcos T.", last: "Peeling · há 2 meses", next: "Faltou há 5 dias", tone: "miss" },
  ],
  record: {
    patient: "Ana P.",
    complaint: "Quer melhorar a textura da pele do rosto antes do casamento, em março.",
    complaintAt: "Registrada em 12 de outubro de 2026",
    tabs: ["Evolução", "Histórico", "Anamnese", "Fotos", "Consentimento"],
    soon: ["Fotos", "Consentimento"],
    entry: {
      when: "12 de outubro de 2026 · Dra. Helena",
      what: "Skinbooster, 2 ml, terço médio. Pele reativa nas primeiras horas, sem intercorrência. Orientada quanto à exposição solar.",
    },
    anamnesis: [
      { label: "Alergias", value: "Nenhuma relatada" },
      { label: "Medicamentos em uso", value: "Anticoncepcional oral" },
      { label: "Contraindicações", value: "Nenhuma identificada" },
      { label: "Objetivos estéticos", value: "Textura e viço da pele" },
    ],
  },
  frontValues: ["R$ 7.400", "R$ 6.150", "R$ 9.800", "R$ 3.100", "R$ 980", "R$ 2.450", "R$ 1.600"],
} as const;

/** "O que pede atenção" beside the day: the overview's two columns, nothing else. */
export function OverviewCrop() {
  return (
    <div className={styles.cols}>
      <section className={styles.block}>
        <p className={styles.kicker}>O que pede atenção</p>
        <ul className={styles.rows}>
          {SAMPLE.attention.map((row, i) => (
            <li key={row.tag} style={{ "--i": i } as CSSProperties}>
              <span className={styles.rowTag}>{row.tag}</span>
              <span className={styles.rowText}>{row.text}</span>
              <span className={styles.rowValue}>{row.value}</span>
            </li>
          ))}
        </ul>
        <p className={styles.fine}>Receita potencial estimada por frente. Não representa venda realizada.</p>
      </section>

      <section className={styles.block}>
        <p className={styles.kicker}>Hoje na agenda</p>
        <ul className={cn(styles.rows, styles.timed)}>
          {SAMPLE.today.map((row, i) => (
            <li key={row.hour} style={{ "--i": i } as CSSProperties}>
              <span className={styles.rowHour}>{row.hour}</span>
              <span className={styles.rowText}>
                {row.name}
                <small>{row.what}</small>
              </span>
              <span className={styles.rowWho}>{row.who}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** One day of the agenda, with the hole a cancellation left in it. */
export function AgendaCrop() {
  return (
    <section className={styles.block}>
      <p className={styles.kicker}>Quinta-feira · Dra. Helena</p>
      <ul className={styles.day}>
        {SAMPLE.agenda.map((slot, i) => (
          <li
            key={slot.hour}
            data-free={slot.name ? undefined : ""}
            data-focus={slot.name ? undefined : ""}
            style={{ "--i": i } as CSSProperties}
          >
            <span className={styles.rowHour}>{slot.hour}</span>
            <span className={styles.rowText}>
              {slot.name ?? slot.what}
              <small>{slot.name ? slot.what : "Cancelado ontem"}</small>
            </span>
            <span className={styles.rowState} data-tone={slot.name ? undefined : "open"}>
              {slot.state}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The patients list, with what each one is waiting for. */
export function PatientsCrop() {
  return (
    <section className={styles.block}>
      <p className={styles.kicker}>Pacientes · 248 no total</p>
      <ul className={styles.rows}>
        {SAMPLE.patients.map((patient, i) => (
          <li key={patient.name} data-focus={patient.tone === "due" ? "" : undefined} style={{ "--i": i } as CSSProperties}>
            <span className={styles.rowText}>
              {patient.name}
              <small>{patient.last}</small>
            </span>
            <span className={styles.rowState} data-tone={patient.tone}>
              {patient.next}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The clinical file: the chief complaint, the day's entry, the anamnesis that is answered. */
export function RecordCrop() {
  const { patient, complaint, complaintAt, tabs, soon, entry, anamnesis } = SAMPLE.record;
  const isSoon = (tab: string) => (soon as readonly string[]).includes(tab);

  return (
    <div className={styles.block}>
      <p className={styles.kicker}>{patient} · Prontuário</p>

      <section className={styles.complaint} data-focus="">
        <p className={styles.kicker}>Queixa principal</p>
        <p className={styles.complaintText}>{complaint}</p>
        <p className={styles.fine}>{complaintAt}</p>
      </section>

      <ul className={styles.tabs} aria-hidden="true">
        {tabs.map((tab, i) => (
          <li key={tab} data-here={i === 0 ? "" : undefined} data-soon={isSoon(tab) ? "" : undefined}>
            {tab}
            {isSoon(tab) ? <small>Em breve</small> : null}
          </li>
        ))}
      </ul>

      <section className={styles.entry}>
        <p className={styles.entryWhen}>{entry.when}</p>
        <p className={styles.entryText}>{entry.what}</p>
      </section>

      <dl className={styles.anamnesis}>
        {anamnesis.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The seven fronts as Oportunidades lists them. The names come from the page, so they stay translated. */
export function OpportunitiesCrop({ fronts }: { fronts: readonly { tag: string; name: string }[] }) {
  return (
    <section className={styles.block}>
      <p className={styles.kicker}>Oportunidades · 7 frentes</p>
      <ul className={styles.rows}>
        {fronts.map((front, i) => (
          <li key={front.name} data-focus={i === 0 ? "" : undefined} style={{ "--i": i } as CSSProperties}>
            <span className={styles.rowTag}>{front.tag}</span>
            <span className={styles.rowText}>{front.name}</span>
            <span className={styles.rowValue}>{SAMPLE.frontValues[i] ?? ""}</span>
          </li>
        ))}
      </ul>
      <p className={styles.fine}>
        Receita potencial estimada, calculada por frente. A mesma pessoa pode aparecer em mais de uma, então o total não é
        cumulativo.
      </p>
    </section>
  );
}
