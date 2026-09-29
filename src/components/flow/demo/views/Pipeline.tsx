"use client";

import { useState } from "react";

import { contactLead, deleteLead, moveLead, saveLead } from "@/lib/flow/actions";
import { brl, daysFrom, relDay } from "@/lib/flow/format";
import { procedureOf, STALE_DAYS } from "@/lib/flow/insights";
import { LEAD_SOURCES, LEAD_STAGES, type Lead, type LeadStage } from "@/lib/flow/types";
import { SOURCE_LABEL, STAGE_LABEL } from "../copy";
import { DeleteButton, Field, FormError, reais, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* The pipeline, first contact to return. A quote left unanswered is marked where it sits. */

const SHOWN = 6;

export function Pipeline() {
  const { data, live } = useFlow();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<LeadStage[]>([]);
  const lead = data.leads.find((l) => l.id === selected);
  const stale = (l: Lead) => Boolean(l.quoteSentAt) && daysFrom(data.now, l.lastContactAt) <= -STALE_DAYS;
  const open = data.leads.filter((l) => l.stage !== "retorno");

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>CRM</h1>
        <p className={styles.lead}>
          {open.length} leads em aberto, {brl(open.reduce((s, l) => s + l.potentialValue, 0))} em valor potencial. Os que
          pararam aparecem marcados.
        </p>
        {live ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
              Novo lead
            </button>
          </div>
        ) : null}
      </header>

      <div className={styles.board}>
        {LEAD_STAGES.map((stage) => {
          const leads = data.leads
            .filter((l) => l.stage === stage)
            .sort((a, b) => Number(stale(b)) - Number(stale(a)) || b.potentialValue - a.potentialValue);
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
                    <button
                      type="button"
                      className={styles.leadCard}
                      data-stale={stale(l) ? "" : undefined}
                      onClick={() => setSelected(l.id)}
                    >
                      <span className={styles.leadName}>{l.name}</span>
                      <span className={styles.leadMeta}>{procedureOf(data, l.procedureId)?.name}</span>
                      <span className={styles.leadFoot}>
                        <strong>{brl(l.potentialValue)}</strong>
                        <span>{relDay(data.now, l.lastContactAt)}</span>
                      </span>
                      {stale(l) ? (
                        <span className={styles.flag}>Sem resposta há {-daysFrom(data.now, l.lastContactAt)} dias</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ol>
              {leads.length > SHOWN ? (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => setExpanded(all ? expanded.filter((s) => s !== stage) : [...expanded, stage])}
                >
                  {all ? "Mostrar menos" : `+ ${leads.length - SHOWN} leads`}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>

      <Sheet
        open={Boolean(lead)}
        onClose={() => setSelected(null)}
        title={lead?.name ?? ""}
        kicker={lead ? STAGE_LABEL[lead.stage] : undefined}
      >
        {lead ? <LeadDetail key={lead.id} lead={lead} stale={stale(lead)} onDone={() => setSelected(null)} /> : null}
      </Sheet>

      {live ? (
        <Sheet open={creating} onClose={() => setCreating(false)} title="Novo lead" kicker="CRM">
          <LeadForm onDone={() => setCreating(false)} />
        </Sheet>
      ) : null}
    </div>
  );
}

function LeadDetail({ lead, stale, onDone }: { lead: Lead; stale: boolean; onDone: () => void }) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, write } = useWrite();
  const [editing, setEditing] = useState(false);
  const at = LEAD_STAGES.indexOf(lead.stage);
  const next = LEAD_STAGES[at + 1];
  const prev = LEAD_STAGES[at - 1];
  // The demo moves the lead in memory; a real clinic writes it, then closes.
  const move = (stage: LeadStage) => {
    if (live) return write(() => moveLead(lead.id, stage), onDone);
    dispatch({ type: "moveLead", id: lead.id, stage });
    onDone();
  };
  const contact = () => (live ? write(() => contactLead(lead.id)) : dispatch({ type: "contactLead", id: lead.id }));

  if (editing) return <LeadForm lead={lead} onDone={() => setEditing(false)} />;

  return (
    <>
      {stale ? <p className={styles.flag}>Orçamento sem resposta há {-daysFrom(data.now, lead.lastContactAt)} dias</p> : null}
      <dl className={styles.fields}>
        <div>
          <dt>Telefone</dt>
          <dd>{lead.phone || "—"}</dd>
        </div>
        <div>
          <dt>Origem</dt>
          <dd>{SOURCE_LABEL[lead.source]}</dd>
        </div>
        <div>
          <dt>Procedimento de interesse</dt>
          <dd>{procedureOf(data, lead.procedureId)?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Valor potencial</dt>
          <dd>{brl(lead.potentialValue)}</dd>
        </div>
        <div>
          <dt>Último contato</dt>
          <dd>{relDay(data.now, lead.lastContactAt)}</dd>
        </div>
        <div>
          <dt>Próxima ação</dt>
          <dd>{lead.nextAction || "—"}</dd>
        </div>
      </dl>
      <div className={styles.actions}>
        {next ? (
          <button type="button" className={styles.primary} disabled={pending} onClick={() => move(next)}>
            Avançar para {STAGE_LABEL[next]}
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
      <FormError error={error} />
      {live ? (
        <div className={styles.actions}>
          <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>
            Editar
          </button>
          <DeleteButton confirm="Excluir este lead" pending={pending} onDelete={() => write(() => deleteLead(lead.id), onDone)} />
        </div>
      ) : (
        <p className={styles.fine}>Na demo, as mudanças valem até recarregar a página.</p>
      )}
    </>
  );
}

function LeadForm({ lead, onDone }: { lead?: Lead; onDone: () => void }) {
  const { data } = useFlow();
  const { pending, error, submit } = useWrite();
  return (
    <form className={styles.form} onSubmit={submit((form) => saveLead(lead?.id ?? null, form), onDone)}>
      <Field label="Nome">
        <input className={styles.input} name="name" required maxLength={200} defaultValue={lead?.name} autoComplete="off" />
      </Field>
      <Field label="Telefone">
        <input className={styles.input} name="phone" type="tel" maxLength={40} defaultValue={lead?.phone} />
      </Field>
      <Field label="Origem">
        <select className={styles.input} name="source" defaultValue={lead?.source ?? "instagram"}>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABEL[source]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Procedimento de interesse">
        <select className={styles.input} name="procedureId" defaultValue={lead?.procedureId ?? ""}>
          <option value="">Nenhum ainda</option>
          {data.procedures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Valor potencial (R$)">
        <input
          className={styles.input}
          name="potentialValue"
          inputMode="decimal"
          placeholder="0"
          defaultValue={lead ? reais(lead.potentialValue) : undefined}
        />
      </Field>
      <Field label="Próxima ação">
        <input className={styles.input} name="nextAction" maxLength={300} defaultValue={lead?.nextAction} />
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {lead ? "Salvar" : "Criar lead"}
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
