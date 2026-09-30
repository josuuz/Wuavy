"use client";

import Link from "next/link";
import { useState } from "react";

import { brl, capital, daysFrom, hour, plural, relDay, units } from "@/lib/flow/format";
import {
  dueReturns,
  expiringLots,
  history,
  lotValue,
  openSlots,
  patientsFor,
  procedureOf,
  proceduresUsing,
  returnValue,
  slotCandidates,
  stuckLeads,
} from "@/lib/flow/insights";
import type { FlowData, OpportunityKind } from "@/lib/flow/types";
import { KIND, SOURCE_LABEL, STATUS_LABEL, VIEWS, viewHref } from "../copy";
import { useFlow, useFocus } from "../store";
import styles from "../ui.module.css";

/*
  How the Flow found each opportunity the overview shows: the records behind
  it and one suggested action. Opened from the overview, not from the menu.
*/

const SHOWN = 8;

export function Opportunities() {
  const { data, ops, dispatch, base } = useFlow();
  // Opened from another screen: start on that one.
  const focus = useFocus("opportunity");
  const [opened, setOpened] = useState<OpportunityKind | null>(focus?.kind ?? null);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Oportunidades</h1>
        <p className={styles.lead}>
          O que o Flow encontrou cruzando vendas, pacientes, agenda e estoque, e o que sugere fazer.{" "}
          <Link href={viewHref("", base)}>Voltar à visão geral</Link>
        </p>
      </header>

      <ol className={styles.opps}>
        {ops.map((o) => {
          const copy = KIND[o.kind];
          const isOpen = opened === o.kind;
          return (
            <li key={o.kind} className={styles.opp} data-status={o.status}>
              <div className={styles.oppHead}>
                <span className={styles.tag}>{copy.tag}</span>
                <p className={styles.oppSentence}>{copy.sentence(o)}</p>
                <p className={styles.oppValue}>
                  {brl(o.value)} <span>{copy.valueLabel}</span>
                </p>
                <span className={styles.status} data-status={o.status}>
                  {STATUS_LABEL[o.status]}
                </span>
                <button
                  type="button"
                  className={isOpen ? styles.secondary : styles.primary}
                  aria-expanded={isOpen}
                  aria-controls={`opp-${o.kind}`}
                  onClick={() => setOpened(isOpen ? null : o.kind)}
                  disabled={o.count === 0}
                >
                  {isOpen ? "Fechar" : "Ver detalhes"}
                </button>
              </div>

              {isOpen ? (
                <div id={`opp-${o.kind}`} className={styles.oppBody}>
                  <Detail kind={o.kind} data={data} />
                  <div className={styles.suggestion}>
                    <p className={styles.label}>Sugestão do Flow</p>
                    <p>{copy.suggestion}</p>
                    {o.status === "nova" ? (
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => dispatch({ type: "status", kind: o.kind, status: "em_andamento", text: copy.prepared(o) })}
                      >
                        {copy.prepare}
                      </button>
                    ) : (
                      <>
                        <p className={styles.done}>{copy.prepared(o)}</p>
                        {o.status === "em_andamento" ? (
                          <button
                            type="button"
                            className={styles.secondary}
                            onClick={() => dispatch({ type: "status", kind: o.kind, status: "resolvida" })}
                          >
                            Marcar como resolvida
                          </button>
                        ) : null}
                      </>
                    )}
                    <Link href={viewHref(copy.view, base)} className={styles.textAction}>
                      Abrir {VIEWS.find((v) => v.slug === copy.view)?.label} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Detail({ kind, data }: { kind: OpportunityKind; data: FlowData }) {
  switch (kind) {
    case "lead_followup": {
      const leads = stuckLeads(data);
      return (
        <Records
          head={["Contato", "Interesse", "Orçamento", "Sem resposta"]}
          rows={leads.map((l) => [
            `${l.name} · ${SOURCE_LABEL[l.source]}`,
            procedureOf(data, l.procedureId)?.name ?? "",
            brl(l.potentialValue),
            `${-daysFrom(data.now, l.lastContactAt)} dias`,
          ])}
        />
      );
    }
    case "patient_return": {
      const due = dueReturns(data);
      return (
        <Records
          head={["Paciente", "Último procedimento", "Retorno recomendado", "Valor provável"]}
          rows={due.map((p) => [
            p.name,
            procedureOf(data, history(data, p.id)[0]?.procedureId ?? "")?.name ?? "",
            capital(relDay(data.now, p.nextReturnAt!)),
            brl(returnValue(data, p)),
          ])}
        />
      );
    }
    case "stock_expiry": {
      return (
        <div className={styles.lots}>
          {expiringLots(data).map((lot) => {
            const product = data.products.find((p) => p.id === lot.productId)!;
            const used = proceduresUsing(data, lot.productId).map((u) => u.procedure);
            const people = patientsFor(data, used.map((p) => p.id));
            return (
              <ol key={lot.id} className={styles.chain}>
                <li>
                  <span className={styles.label}>Problema</span>
                  <strong>{product.name}</strong>
                  <span>
                    {units(lot.quantity, product.unit)} · vence em {daysFrom(data.now, lot.expiresAt)} dias · {brl(lotValue(data, lot))}
                  </span>
                </li>
                <li>
                  <span className={styles.label}>Flow identifica</span>
                  <strong>{used.map((p) => p.name).join(", ")}</strong>
                </li>
                <li>
                  <span className={styles.label}>Flow cruza</span>
                  <strong>{plural(people.length, "paciente compatível", "pacientes compatíveis")}</strong>
                  <span>{people.slice(0, 3).map((p) => p.name).join(", ")}</span>
                </li>
                <li>
                  <span className={styles.label}>Ação</span>
                  <strong>Campanha antes do vencimento</strong>
                </li>
              </ol>
            );
          })}
        </div>
      );
    }
    case "open_slot": {
      return (
        <Records
          head={["Horário", "Situação", "Quem pode ocupar"]}
          rows={openSlots(data).map((slot) => [
            `Amanhã, ${hour(slot.startsAt)}`,
            slot.status === "cancelado" ? "Cancelamento" : "Livre",
            slotCandidates(data, slot.startsAt)
              .map((c) => `${c.patient.name} (${c.procedure.name})`)
              .join(", ") || "Pacientes com retorno próximo",
          ])}
        />
      );
    }
  }
}

function Records({ head, rows }: { head: string[]; rows: string[][] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div className={styles.records}>
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
    </div>
  );
}
