"use client";

import Link from "next/link";
import { useState } from "react";

import { brl, capital, daysFrom, hour, plural, relDay, units } from "@/lib/flow/format";
import {
  dueReturns,
  expiryOpportunities,
  history,
  idleLeads,
  lotValue,
  missed,
  openSlots,
  procedureOf,
  recovered,
  returnValue,
  slotMatches,
  stuckLeads,
  type ExpiryOpportunity,
} from "@/lib/flow/insights";
import type { FlowData, ID, Opportunity, OpportunityKind } from "@/lib/flow/types";
import { KIND, SOURCE_LABEL, STAGE_LABEL, STATUS_LABEL, VIEWS, viewHref } from "../copy";
import { Approval, Prepared } from "../forms";
import { useFlow, useFocus } from "../store";
import styles from "../ui.module.css";

/*
  The Pulse's opportunity engine: every front where money is waiting, what
  it is worth, who the Pulse picked to start with, and the action it
  recommends. Nothing goes out on its own: the Pulse identifies, recommends
  and prepares; a person reviews and approves.
*/

const SHOWN = 8;
/** How many people the Pulse picks to start with, per front. */
const PICK = 8;

/** One person the Pulse picked, with the message it would send them. */
export interface Pick {
  id: string;
  name: string;
  detail: string;
  value: number;
  message: string;
}

const first = (name: string) => name.split(" ")[0];

/** The most relevant people behind a front, best first: whom to call, and what to say. */
export function selection(d: FlowData, kind: OpportunityKind): Pick[] {
  switch (kind) {
    case "lead_followup":
      return stuckLeads(d)
        .slice(0, PICK)
        .map((l) => {
          const procedure = procedureOf(d, l.procedureId)?.name ?? "o procedimento";
          return {
            id: l.id,
            name: l.name,
            detail: `${procedure} · sem resposta há ${plural(-daysFrom(d.now, l.lastContactAt), "dia", "dias")}`,
            value: l.potentialValue,
            message: `Oi ${first(l.name)}! Passando para saber se ficou alguma dúvida sobre o orçamento de ${procedure}. Se quiser, já deixo um horário reservado para você.`,
          };
        });
    case "lead_idle":
      return idleLeads(d)
        .slice(0, PICK)
        .map((l) => {
          const procedure = procedureOf(d, l.procedureId)?.name ?? "o procedimento";
          return {
            id: l.id,
            name: l.name,
            detail: `${STAGE_LABEL[l.stage]} · ${procedure} · parado há ${plural(-daysFrom(d.now, l.lastContactAt), "dia", "dias")}`,
            value: l.potentialValue,
            message: `Oi ${first(l.name)}! Conseguiu pensar sobre ${procedure}? Tenho horários de avaliação nesta semana e posso reservar um para você.`,
          };
        });
    case "patient_return":
      // Closest to the recommended date first: that is when a return is most likely.
      return [...dueReturns(d)]
        .sort(
          (a, b) =>
            Math.abs(daysFrom(d.now, a.nextReturnAt!)) - Math.abs(daysFrom(d.now, b.nextReturnAt!)) ||
            returnValue(d, b) - returnValue(d, a),
        )
        .slice(0, PICK)
        .map((p) => {
          const procedure = procedureOf(d, history(d, p.id)[0]?.procedureId ?? "")?.name ?? "procedimento";
          const days = daysFrom(d.now, p.nextReturnAt!);
          return {
            id: p.id,
            name: p.name,
            detail: `${procedure} · ${days < 0 ? `atrasado há ${plural(-days, "dia", "dias")}` : days === 0 ? "retorno hoje" : `retorno em ${plural(days, "dia", "dias")}`}`,
            value: returnValue(d, p),
            message: `Oi ${first(p.name)}! Já está na época do seu retorno de ${procedure}. Quer que eu veja um horário para você esta semana?`,
          };
        });
    case "no_show":
      return missed(d)
        .slice(0, PICK)
        .map(({ patient, step }) => {
          const procedure = procedureOf(d, step.appointment.procedureId);
          return {
            id: patient.id,
            name: patient.name,
            detail: `${procedure?.name ?? "Atendimento"} · faltou ${relDay(d.now, step.appointment.startsAt)}`,
            value: procedure?.price ?? 0,
            message: `Oi ${first(patient.name)}! Sentimos sua falta no ${procedure?.name ?? "atendimento"}. Quer remarcar? Tenho horários livres nos próximos dias.`,
          };
        });
    case "open_slot": {
      // The best match for each free hour, never the same person twice.
      const used = new Set<ID>();
      return openSlots(d).flatMap((slot) => {
        const match = slotMatches(d, slot.startsAt, 6).find((m) => !used.has(m.patient.id));
        if (!match) return [];
        used.add(match.patient.id);
        const when = `${relDay(d.now, slot.startsAt)} às ${hour(slot.startsAt)}`;
        return [
          {
            id: `${slot.startsAt}:${match.patient.id}`,
            name: match.patient.name,
            detail: `${capital(when)} · ${match.procedure.name} · ${match.score}% compatível`,
            value: match.procedure.price,
            message: `Oi ${first(match.patient.name)}! Abriu um horário ${when} para ${match.procedure.name}. Quer que eu reserve para você?`,
          },
        ];
      });
    }
    case "stock_expiry": {
      // As many people per lot as it has sessions, each once: the lot that expires first picks first.
      const used = new Set<ID>();
      const picks: Pick[] = [];
      for (const x of expiryOpportunities(d)) {
        for (const patient of x.patients.filter((p) => !used.has(p.id)).slice(0, x.sessions)) {
          const did = history(d, patient.id).find((a) => x.procedures.some((p) => p.id === a.procedureId));
          const procedure = procedureOf(d, did?.procedureId ?? "") ?? x.procedures[0];
          if (!procedure) continue;
          used.add(patient.id);
          picks.push({
            id: patient.id,
            name: patient.name,
            detail: `${procedure.name} · usa ${x.product?.name ?? "o produto"}`,
            value: procedure.price,
            message: `Oi ${first(patient.name)}! Estamos com horários para ${procedure.name} nas próximas semanas. Quer que eu reserve um para você?`,
          });
        }
      }
      return picks.slice(0, PICK);
    }
  }
}

export function Opportunities() {
  const { data, ops } = useFlow();
  // Opened from another screen: start on that one.
  const focus = useFocus("opportunity");
  const [opened, setOpened] = useState<OpportunityKind | null>(focus?.kind ?? null);
  const open = ops.filter((o) => o.count > 0 && o.status !== "resolvida");
  const potential = open.reduce((s, o) => s + o.value, 0);
  const back = recovered(data).total;
  // Where the money is first; empty and settled fronts go last.
  const sorted = [...ops].sort(
    (a, b) =>
      Number(a.count === 0 || a.status === "resolvida") - Number(b.count === 0 || b.status === "resolvida") ||
      b.value - a.value,
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Oportunidades</h1>
        <p className={styles.lead}>
          O motor do Pulse cruza vendas, pacientes, agenda e estoque, calcula quanto vale cada frente e separa por onde
          começar. Nada sai da clínica sem a sua aprovação.
        </p>
      </header>

      <p className={styles.summary}>
        <strong>{brl(potential)}</strong> em potencial aberto · <strong>{open.length}</strong>{" "}
        {open.length === 1 ? "frente" : "frentes"} com ação recomendada · <strong>{brl(back)}</strong> recuperados nos
        últimos 30 dias
      </p>

      <ol className={styles.opps}>
        {sorted.map((o) => (
          <Front
            key={o.kind}
            o={o}
            open={opened === o.kind}
            onToggle={() => setOpened(opened === o.kind ? null : o.kind)}
          />
        ))}
      </ol>
    </div>
  );
}

/** One front: what it is, what it is worth, and the approval that settles it. */
function Front({ o, open, onToggle }: { o: Opportunity; open: boolean; onToggle: () => void }) {
  const { data, dispatch, base, access } = useFlow();
  const copy = KIND[o.kind];
  const picks = selection(data, o.kind);
  const [reviewing, setReviewing] = useState(false);
  const [left, setLeft] = useState<string[]>([]);
  const chosen = picks.filter((p) => !left.includes(p.id));
  const step = o.status === "resolvida" ? 4 : o.status === "em_andamento" ? 3 : reviewing ? 2 : 1;

  return (
    <li className={styles.opp} data-status={o.status}>
      <div className={styles.oppHead}>
        <span className={styles.tag}>{copy.tag}</span>
        <div className={styles.oppMain}>
          <p className={styles.oppSentence}>{copy.headline(o)}</p>
          {o.count ? <p className={styles.fine}>{copy.picked(picks.length)}</p> : null}
        </div>
        <p className={styles.oppValue}>
          {brl(o.value)} <span>{copy.valueLabel}</span>
        </p>
        <span className={styles.status} data-status={o.status}>
          {o.count ? STATUS_LABEL[o.status] : "Nada agora"}
        </span>
        <button
          type="button"
          className={open ? styles.secondary : styles.primary}
          aria-expanded={open}
          aria-controls={`opp-${o.kind}`}
          onClick={onToggle}
          disabled={o.count === 0}
        >
          {open ? "Fechar" : copy.action}
        </button>
      </div>

      {open ? (
        <div id={`opp-${o.kind}`} className={styles.oppBody}>
          <div className={styles.records}>
            <p className={styles.fine}>{copy.sentence(o)}</p>
            <Detail kind={o.kind} data={data} />
          </div>

          <div className={styles.suggestion}>
            <p className={styles.label}>Sugestão do Pulse</p>
            <p>{copy.suggestion}</p>
            <Approval step={step} />

            {!access.canEdit ? null : o.status === "nova" && !reviewing ? (
              <button type="button" className={styles.primary} onClick={() => setReviewing(true)}>
                {copy.review} ({picks.length})
              </button>
            ) : o.status === "nova" ? (
              <>
                <ul className={styles.picks} aria-label="Quem o Pulse selecionou">
                  {picks.map((p) => (
                    <li key={p.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!left.includes(p.id)}
                          onChange={() => setLeft(left.includes(p.id) ? left.filter((id) => id !== p.id) : [...left, p.id])}
                        />
                        <span>
                          <strong>{p.name}</strong>
                          <span>{p.detail}</span>
                        </span>
                        <span className={styles.pickValue}>{brl(p.value)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={!chosen.length}
                    onClick={() => dispatch({ type: "status", kind: o.kind, status: "em_andamento", text: copy.prepared(chosen.length) })}
                  >
                    {copy.prepare} ({chosen.length})
                  </button>
                  <button type="button" className={styles.quiet} onClick={() => setReviewing(false)}>
                    Voltar
                  </button>
                </div>
              </>
            ) : o.status === "em_andamento" ? (
              <>
                <p className={styles.done}>{copy.prepared(chosen.length)}</p>
                {chosen[0] ? (
                  <>
                    <p className={styles.label}>Mensagem para {first(chosen[0].name)}</p>
                    <Prepared text={chosen[0].message} />
                  </>
                ) : null}
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => dispatch({ type: "status", kind: o.kind, status: "resolvida" })}
                >
                  Marcar como resolvida
                </button>
              </>
            ) : (
              <p className={styles.done}>Resolvida.</p>
            )}

            <Link href={viewHref(copy.view, base)} className={styles.textAction}>
              Abrir {VIEWS.find((v) => v.slug === copy.view)?.label} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** A lot near its date, read as the Pulse reads it: the product, the procedures, the people, what it is worth. */
export function ExpiryChain({ x, data }: { x: ExpiryOpportunity; data: FlowData }) {
  return (
    <ol className={styles.chain}>
      <li>
        <span className={styles.label}>Produto perto da validade</span>
        <strong>{x.product?.name}</strong>
        <span>
          {units(x.lot.quantity, x.product?.unit ?? "un")} · vence em {daysFrom(data.now, x.lot.expiresAt)} dias ·{" "}
          {brl(lotValue(data, x.lot))} em produto
        </span>
      </li>
      <li>
        <span className={styles.label}>Pulse identifica</span>
        <strong>{x.procedures.map((p) => p.name).join(", ") || "Nenhum procedimento usa"}</strong>
        <span>procedimentos que usam o produto</span>
      </li>
      <li>
        <span className={styles.label}>Pulse cruza</span>
        <strong>{plural(x.patients.length, "paciente compatível", "pacientes compatíveis")}</strong>
        <span>{x.patients.slice(0, 3).map((p) => p.name).join(", ") || "ninguém ainda"}</span>
      </li>
      <li>
        <span className={styles.label}>Oportunidade</span>
        <strong>{brl(x.potential)} em procedimentos</strong>
        <span>campanha antes do vencimento · o lote rende {plural(x.sessions, "sessão", "sessões")}</span>
      </li>
    </ol>
  );
}

function Detail({ kind, data }: { kind: OpportunityKind; data: FlowData }) {
  switch (kind) {
    case "lead_followup":
      return (
        <Records
          head={["Contato", "Interesse", "Orçamento", "Sem resposta"]}
          rows={stuckLeads(data).map((l) => [
            `${l.name} · ${SOURCE_LABEL[l.source]}`,
            procedureOf(data, l.procedureId)?.name ?? "",
            brl(l.potentialValue),
            `${-daysFrom(data.now, l.lastContactAt)} dias`,
          ])}
        />
      );
    case "lead_idle":
      return (
        <Records
          head={["Contato", "Etapa", "Interesse", "Parado há"]}
          rows={idleLeads(data).map((l) => [
            `${l.name} · ${SOURCE_LABEL[l.source]}`,
            STAGE_LABEL[l.stage],
            `${procedureOf(data, l.procedureId)?.name ?? ""} · ${brl(l.potentialValue)}`,
            `${-daysFrom(data.now, l.lastContactAt)} dias`,
          ])}
        />
      );
    case "patient_return":
      return (
        <Records
          head={["Paciente", "Último procedimento", "Retorno recomendado", "Valor provável"]}
          rows={dueReturns(data).map((p) => [
            p.name,
            procedureOf(data, history(data, p.id)[0]?.procedureId ?? "")?.name ?? "",
            capital(relDay(data.now, p.nextReturnAt!)),
            brl(returnValue(data, p)),
          ])}
        />
      );
    case "no_show":
      return (
        <Records
          head={["Paciente", "Procedimento", "Faltou", "Valor"]}
          rows={missed(data).map(({ patient, step }) => {
            const procedure = procedureOf(data, step.appointment.procedureId);
            return [patient.name, procedure?.name ?? "", capital(relDay(data.now, step.appointment.startsAt)), brl(procedure?.price ?? 0)];
          })}
        />
      );
    case "stock_expiry":
      return (
        <div className={styles.lots}>
          {expiryOpportunities(data).map((x) => (
            <ExpiryChain key={x.lot.id} x={x} data={data} />
          ))}
        </div>
      );
    case "open_slot":
      return (
        <Records
          head={["Horário", "Situação", "Mais compatíveis"]}
          rows={openSlots(data).map((slot) => [
            capital(`${relDay(data.now, slot.startsAt)}, ${hour(slot.startsAt)}`),
            slot.status === "cancelado" ? "Cancelamento" : "Livre",
            slotMatches(data, slot.startsAt)
              .map((m) => `${m.patient.name} (${m.score}%)`)
              .join(", ") || "Ninguém compatível agora",
          ])}
        />
      );
  }
}

function Records({ head, rows }: { head: string[]; rows: string[][] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} data-label={head[j]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > SHOWN ? (
        <button type="button" className={styles.more} onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Mostrar todos os ${rows.length}`}
        </button>
      ) : null}
    </>
  );
}
