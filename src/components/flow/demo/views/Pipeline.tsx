"use client";

import { useState } from "react";

import { contactLead, deleteLead, moveLead, saveLead, type Result } from "@/lib/flow/actions";
import { brl, capital, dayAt, daysFrom, hour, plural, relDay, shortDate } from "@/lib/flow/format";
import { CLOSED_DAYS, idleLeads, onBoard, openLeads, procedureOf, staleQuote, upcomingFor } from "@/lib/flow/insights";
import { LEAD_SOURCES, LEAD_STAGES, type Lead, type LeadSource, type LeadStage, type Patient } from "@/lib/flow/types";
import { NEXT_STEP, SOURCE_LABEL, STAGE_LABEL } from "../copy";
import { DeleteButton, digits, Field, FocusLink, FormError, Intro, Phone, reais, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow, useFocus } from "../store";
import styles from "../ui.module.css";
import { BookingForm } from "./Schedule";

/*
  Vendas: the people who have not booked yet, from first contact to the
  booking. Booking is the finish line: the person becomes a patient there,
  keeping everything written here. A quote left unanswered is marked where
  it sits.
*/

const SHOWN = 6;
/** The stages a contact moves through by hand; "Agendado" is reached by booking. */
const OPEN_STAGES = LEAD_STAGES.filter((stage) => stage !== "agendado");

export function Pipeline() {
  const { data } = useFlow();
  const focus = useFocus("sales");
  const opened = useFocus("lead");
  const [only, setOnly] = useState<"novo" | "sem_resposta" | "parados" | null>(focus?.filter ?? null);
  const [selected, setSelected] = useState<string | null>(opened?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<LeadStage[]>([]);
  const lead = data.leads.find((l) => l.id === selected);
  const open = openLeads(data);
  const stale = open.filter((l) => staleQuote(data, l));
  const won = data.leads.filter((l) => l.stage === "agendado" && daysFrom(data.now, l.lastContactAt) >= -CLOSED_DAYS);
  const fresh = open.filter((l) => l.stage === "novo");
  const idle = new Set(idleLeads(data).map((l) => l.id));
  const stages = LEAD_STAGES.filter((stage) =>
    only === "novo"
      ? stage === "novo"
      : only === "sem_resposta"
        ? stage === "orcamento"
        : only === "parados"
          ? stage === "novo" || stage === "contato" || stage === "avaliacao"
          : true,
  );
  const shows = (l: Lead) =>
    only === "sem_resposta" ? staleQuote(data, l) : only === "parados" ? idle.has(l.id) : true;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Vendas</h1>
        <p className={styles.lead}>
          O funil comercial da clínica: quem ainda não fechou, do primeiro contato ao agendamento. Ao agendar, a pessoa vira paciente, com a origem e o
          orçamento guardados.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
            Novo contato
          </button>
        </div>
      </header>

      {data.leads.length === 0 ? (
        <Intro title="Como funciona">
          Aqui ficam as pessoas que ainda não fecharam. Registre quem chamou a clínica e acompanhe cada uma até o agendamento.
        </Intro>
      ) : (
        <>
          <div className={styles.toolbar}>
            <p className={styles.summary}>
              <strong>{plural(open.length, "pessoa", "pessoas")}</strong> em negociação ·{" "}
              <strong>{brl(open.reduce((s, l) => s + l.potentialValue, 0))}</strong> em orçamentos ·{" "}
              <strong>{won.length}</strong> {won.length === 1 ? "agendou" : "agendaram"} nos últimos 30 dias
            </p>
            <div className={styles.segmented} role="group" aria-label="Filtrar contatos">
              <button type="button" aria-pressed={!only} onClick={() => setOnly(null)}>
                Todos
              </button>
              <button type="button" aria-pressed={only === "novo"} onClick={() => setOnly("novo")}>
                Novos ({fresh.length})
              </button>
              <button type="button" aria-pressed={only === "sem_resposta"} onClick={() => setOnly("sem_resposta")}>
                Sem resposta ({stale.length})
              </button>
              <button type="button" aria-pressed={only === "parados"} onClick={() => setOnly("parados")}>
                Parados ({idle.size})
              </button>
            </div>
          </div>

          <div className={styles.board}>
            {stages.map((stage) => {
              const leads = data.leads
                .filter((l) => l.stage === stage && onBoard(data, l) && shows(l))
                .sort((a, b) =>
                  stage === "agendado"
                    ? b.lastContactAt.localeCompare(a.lastContactAt)
                    : Number(staleQuote(data, b)) - Number(staleQuote(data, a)) || b.potentialValue - a.potentialValue,
                );
              const older = stage === "agendado" && data.leads.some((l) => l.stage === "agendado" && !onBoard(data, l));
              const all = expanded.includes(stage);
              return (
                <section key={stage} className={styles.column} aria-labelledby={`col-${stage}`}>
                  <header className={styles.colHead}>
                    <h2 id={`col-${stage}`}>{STAGE_LABEL[stage]}</h2>
                    <span>{leads.length}</span>
                    <span className={styles.colValue}>{brl(leads.reduce((s, l) => s + l.potentialValue, 0))}</span>
                  </header>
                  <ol className={styles.cards}>
                    {(all ? leads : leads.slice(0, SHOWN)).map((l) => (
                      <li key={l.id}>
                        <LeadCard lead={l} onOpen={() => setSelected(l.id)} />
                      </li>
                    ))}
                  </ol>
                  {leads.length === 0 ? <p className={styles.colEmpty}>Ninguém nesta etapa.</p> : null}
                  {leads.length > SHOWN ? (
                    <button
                      type="button"
                      className={styles.more}
                      onClick={() => setExpanded(all ? expanded.filter((s) => s !== stage) : [...expanded, stage])}
                    >
                      {all ? "Mostrar menos" : `+ ${plural(leads.length - SHOWN, "pessoa", "pessoas")}`}
                    </button>
                  ) : null}
                  {older ? <p className={styles.colEmpty}>Quem agendou há mais de 30 dias está em Pacientes.</p> : null}
                </section>
              );
            })}
          </div>
        </>
      )}

      <Sheet
        open={Boolean(lead)}
        onClose={() => setSelected(null)}
        title={lead?.name ?? ""}
        kicker={lead ? STAGE_LABEL[lead.stage] : undefined}
      >
        {lead ? <LeadDetail key={lead.id} lead={lead} onDone={() => setSelected(null)} /> : null}
      </Sheet>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Novo contato" kicker="Vendas">
        <LeadForm onDone={() => setCreating(false)} />
      </Sheet>
    </div>
  );
}

function LeadCard({ lead: l, onOpen }: { lead: Lead; onOpen: () => void }) {
  const { data } = useFlow();
  const stale = staleQuote(data, l);
  const next = l.patientId ? upcomingFor(data, l.patientId)[0] : undefined;
  return (
    <button type="button" className={styles.leadCard} data-stale={stale ? "" : undefined} onClick={onOpen}>
      <span className={styles.leadName}>{l.name}</span>
      <span className={styles.leadMeta}>{procedureOf(data, l.procedureId)?.name ?? "Interesse a definir"}</span>
      <span className={styles.leadFoot}>
        <strong>{brl(l.potentialValue)}</strong>
        <span>{relDay(data.now, l.lastContactAt)}</span>
      </span>
      {stale ? <span className={styles.flag}>Sem resposta há {-daysFrom(data.now, l.lastContactAt)} dias</span> : null}
      {l.stage === "agendado" ? (
        <span className={styles.flagQuiet}>
          {next
            ? `Atendimento ${daysFrom(data.now, next.startsAt) <= 1 ? dayAt(data.now, next.startsAt) : `em ${shortDate(next.startsAt)}, ${hour(next.startsAt)}`}`
            : "Agora é paciente"}
        </span>
      ) : l.patientId ? (
        <span className={styles.flagQuiet}>Já é paciente</span>
      ) : null}
    </button>
  );
}

function LeadDetail({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const { data, dispatch, live, editable } = useFlow();
  const { pending, error, write } = useWrite();
  const [mode, setMode] = useState<"ver" | "agendar" | "editar">("ver");
  const stale = staleQuote(data, lead);
  const at = (OPEN_STAGES as LeadStage[]).indexOf(lead.stage);
  const next = at >= 0 ? OPEN_STAGES[at + 1] : undefined;
  const prev = at > 0 ? OPEN_STAGES[at - 1] : undefined;
  const patient = data.patients.find((p) => p.id === lead.patientId);
  const upcoming = patient ? upcomingFor(data, patient.id)[0] : undefined;
  const booked = lead.stage === "agendado";
  // The demo moves the contact in memory; a real clinic writes it, then closes.
  const move = (stage: LeadStage) => {
    if (live) return write(() => moveLead(lead.id, stage), onDone);
    dispatch({ type: "moveLead", id: lead.id, stage });
    onDone();
  };
  const contact = () => (live ? write(() => contactLead(lead.id)) : dispatch({ type: "contactLead", id: lead.id }));

  if (mode === "agendar") {
    return <BookingForm draft={{ leadId: lead.id, procedureId: lead.procedureId || undefined }} onDone={onDone} />;
  }
  if (mode === "editar") return <LeadForm lead={lead} onDone={() => setMode("ver")} />;

  return (
    <>
      <ol className={styles.stages} aria-label="Etapas até o agendamento">
        {LEAD_STAGES.map((stage, i) => (
          <li
            key={stage}
            data-state={i < LEAD_STAGES.indexOf(lead.stage) ? "done" : stage === lead.stage ? "now" : undefined}
            aria-current={stage === lead.stage ? "step" : undefined}
          >
            {STAGE_LABEL[stage]}
          </li>
        ))}
      </ol>

      {stale ? <p className={styles.flag}>Orçamento sem resposta há {-daysFrom(data.now, lead.lastContactAt)} dias</p> : null}

      <dl className={styles.fields}>
        <div>
          <dt>Telefone</dt>
          <dd>
            <Phone phone={lead.phone} />
          </dd>
        </div>
        <div>
          <dt>Como conheceu</dt>
          <dd>{SOURCE_LABEL[lead.source]}</dd>
        </div>
        <div>
          <dt>Interesse</dt>
          <dd>{procedureOf(data, lead.procedureId)?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Valor do orçamento</dt>
          <dd>{brl(lead.potentialValue)}</dd>
        </div>
        <div>
          <dt>Primeiro contato</dt>
          <dd>{capital(relDay(data.now, lead.createdAt))}</dd>
        </div>
        <div>
          <dt>Último contato</dt>
          <dd>{capital(relDay(data.now, lead.lastContactAt))}</dd>
        </div>
        {booked ? null : (
          <div>
            <dt>Próximo passo</dt>
            <dd>{lead.nextAction || NEXT_STEP[lead.stage]}</dd>
          </div>
        )}
      </dl>

      {patient ? (
        <div className={styles.suggestion}>
          <p className={styles.label}>{booked ? "Virou paciente" : "Já é paciente"}</p>
          <p>
            {upcoming
              ? `Atendimento ${dayAt(data.now, upcoming.startsAt)}: ${procedureOf(data, upcoming.procedureId)?.name}.`
              : booked
                ? "O histórico continua na ficha: atendimentos, gastos e o próximo retorno."
                : "Esta é uma nova venda para quem já é paciente. Nada foi cadastrado de novo."}
          </p>
          <FocusLink focus={{ to: "patient", id: patient.id }}>
            Abrir a ficha <span aria-hidden="true">→</span>
          </FocusLink>
        </div>
      ) : null}

      {booked ? null : (
        <>
          <div className={styles.actions}>
            <button
              type="button"
              className={next ? styles.secondary : styles.primary}
              disabled={pending}
              onClick={() => setMode("agendar")}
            >
              Agendar
            </button>
            {next ? (
              <button type="button" className={styles.primary} disabled={pending} onClick={() => move(next)}>
                Passar para {STAGE_LABEL[next]}
              </button>
            ) : null}
            <button type="button" className={styles.secondary} disabled={pending} onClick={contact}>
              Registrar contato
            </button>
            {prev ? (
              <button type="button" className={styles.quiet} disabled={pending} onClick={() => move(prev)}>
                Voltar para {STAGE_LABEL[prev]}
              </button>
            ) : null}
          </div>
          {patient ? null : (
            <p className={styles.fine}>Ao agendar, a pessoa vira paciente com tudo o que está aqui: origem, orçamento e contatos.</p>
          )}
        </>
      )}
      <FormError error={error} />

      {editable ? (
        <div className={styles.actions}>
          <button type="button" className={styles.quiet} onClick={() => setMode("editar")}>
            Editar
          </button>
          <DeleteButton confirm="Excluir este contato" pending={pending} onDelete={() => write(() => deleteLead(lead.id), onDone)} />
        </div>
      ) : (
        <p className={styles.fine}>Na demo, as mudanças valem até recarregar a página.</p>
      )}
    </>
  );
}

/** "1.240", "1240,50" or "R$ 380" to cents; NaN when it is not a number. */
const toCents = (value: string) => Math.round(Number(value.replace(/[R$\s.]/g, "").replace(",", ".")) * 100);

/**
 * A new contact, or a new sale for someone who is a patient already. A phone
 * that belongs to a patient is offered as the same person, so nobody is
 * registered twice.
 */
export function LeadForm({ lead, patient, onDone }: { lead?: Lead; patient?: Patient; onDone: () => void }) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, submit } = useWrite();
  const [name, setName] = useState(lead?.name ?? patient?.name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? patient?.phone ?? "");
  const [linked, setLinked] = useState(patient?.id ?? "");
  const [stage, setStage] = useState<LeadStage>(lead?.stage ?? "novo");
  const [procedureId, setProcedureId] = useState(lead?.procedureId ?? "");
  const [value, setValue] = useState(lead ? reais(lead.potentialValue) : "");
  const person = data.patients.find((p) => p.id === linked);
  const match =
    !lead && !person && digits(phone).length >= 8 ? data.patients.find((p) => digits(p.phone) === digits(phone)) : undefined;

  const demoAdd = async (form: FormData): Promise<Result> => {
    const potentialValue = value ? toCents(value) : 0;
    if (!name.trim()) return { error: "Informe o nome." };
    if (!Number.isFinite(potentialValue) || potentialValue < 0) return { error: "Informe o valor do orçamento em reais." };
    dispatch({
      type: "addLead",
      lead: {
        name: name.trim(),
        phone: phone.trim(),
        source: String(form.get("source")) as LeadSource,
        procedureId,
        potentialValue,
        stage,
        nextAction: String(form.get("nextAction") ?? "").trim(),
        patientId: linked || undefined,
      },
    });
    return {};
  };

  return (
    <form className={styles.form} onSubmit={submit(live ? (form) => saveLead(lead?.id ?? null, form) : demoAdd, onDone)}>
      <input type="hidden" name="patientId" value={linked} />
      <Field label="Nome">
        <input
          className={styles.input}
          name="name"
          required
          maxLength={200}
          value={name}
          readOnly={Boolean(person)}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Telefone">
        <input
          className={styles.input}
          name="phone"
          type="tel"
          maxLength={40}
          value={phone}
          readOnly={Boolean(person)}
          onChange={(event) => setPhone(event.target.value)}
        />
      </Field>

      {match ? (
        <div className={styles.suggestion} role="status">
          <p>Este telefone é de {match.name}, que já é paciente.</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setLinked(match.id);
              setName(match.name);
            }}
          >
            É a mesma pessoa
          </button>
        </div>
      ) : null}
      {person && !patient ? (
        <p className={styles.fine}>
          Ligado à ficha de {person.name}: nada é cadastrado de novo.{" "}
          <button type="button" className={styles.quiet} onClick={() => setLinked("")}>
            Não é a mesma pessoa
          </button>
        </p>
      ) : null}

      <Field label="Como conheceu a clínica">
        <select className={styles.input} name="source" defaultValue={lead?.source ?? "instagram"}>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABEL[source]}
            </option>
          ))}
        </select>
      </Field>
      {lead ? null : (
        <Field label="Etapa">
          <select className={styles.input} name="stage" value={stage} onChange={(event) => setStage(event.target.value as LeadStage)}>
            {OPEN_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Interesse">
        <select
          className={styles.input}
          name="procedureId"
          value={procedureId}
          onChange={(event) => {
            setProcedureId(event.target.value);
            // The procedure's price is the natural first quote.
            const price = procedureOf(data, event.target.value)?.price;
            if (!value && price) setValue(reais(price));
          }}
        >
          <option value="">Ainda não sabe</option>
          {data.procedures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Valor do orçamento (R$)">
        <input
          className={styles.input}
          name="potentialValue"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <Field label="Próximo passo">
        <input
          className={styles.input}
          name="nextAction"
          maxLength={300}
          defaultValue={lead?.nextAction}
          placeholder={NEXT_STEP[lead?.stage ?? stage]}
        />
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {lead ? "Salvar" : "Adicionar contato"}
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
