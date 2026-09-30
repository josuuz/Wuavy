"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { brl, dayLabel, daysFrom, hour, plural, relDay } from "@/lib/flow/format";
import { awaiting, daySlots, lowStock, missed, procedureOf, recovered, unrecorded } from "@/lib/flow/insights";
import { APPOINTMENT_LABEL, KIND, STATUS_LABEL, viewHref } from "../copy";
import { FocusLink } from "../forms";
import { useFlow, type Focus } from "../store";
import styles from "../ui.module.css";

/*
  The first screen: not a dashboard of charts, the answer to "what do I do
  now?". Today's agenda, what needs attention, and the opportunities the
  Flow found, each with the action that settles it.
*/

const noSubscribe = () => () => {};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

const RECOVERED_LABEL: Record<string, string> = {
  lead_followup: "Orçamentos retomados",
  patient_return: "Retornos",
  open_slot: "Horários preenchidos",
  stock_expiry: "Estoque usado antes de vencer",
};

interface Todo {
  count: number;
  text: string;
  detail: string;
  action: string;
  focus?: Focus;
  view?: string;
}

const names = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(", ")} e mais ${list.length - 3}` : list.join(", "));

export function Overview() {
  const { data, ops, base, live } = useFlow();
  const hello = useSyncExternalStore(noSubscribe, greeting, () => "Bom dia");
  const today = daySlots(data, 0);
  const booked = today.filter((s) => s.status === "ocupado").map((s) => s.appointment!);
  const patientName = (id: string) => data.patients.find((p) => p.id === id)?.name ?? "";

  // A new clinic: the few steps that make the Flow useful, until they are done.
  const setup = [
    {
      done: data.procedures.length > 0,
      text: "Cadastre os procedimentos",
      why: "Preço, duração e retorno de cada um alimentam a agenda e as automações.",
      view: "procedimentos",
    },
    {
      done: data.leads.length > 0 || data.patients.length > 0,
      text: "Registre quem está conversando com a clínica",
      why: "Cada contato fica em Vendas até agendar.",
      view: "vendas",
    },
    {
      done: data.appointments.length > 0,
      text: "Agende o primeiro atendimento",
      why: "Quem agenda vira paciente, com histórico e próximo retorno.",
      view: "agenda",
    },
    {
      done: data.products.length > 0,
      text: "Registre os produtos em estoque",
      why: "Opcional: o Flow avisa o que está acabando e o que vence.",
      view: "estoque",
    },
  ];
  const starting = live && setup.slice(0, 3).some((s) => !s.done);

  const confirmToday = awaiting(data, 0);
  const confirmTomorrow = awaiting(data, 1);
  const late = unrecorded(data);
  const noShows = missed(data);
  const fresh = data.leads.filter((l) => l.stage === "novo");
  const low = lowStock(data);
  const todos: Todo[] = [];
  if (confirmToday.length + confirmTomorrow.length) {
    const n = confirmToday.length + confirmTomorrow.length;
    todos.push({
      count: n,
      text: n === 1 ? "atendimento aguarda confirmação" : "atendimentos aguardam confirmação",
      detail: [confirmToday.length && `${confirmToday.length} hoje`, confirmTomorrow.length && `${confirmTomorrow.length} amanhã`]
        .filter(Boolean)
        .join(", "),
      action: "Confirmar",
      focus: { to: "agenda", day: confirmToday.length ? 0 : 1 },
    });
  }
  if (late.length) {
    todos.push({
      count: late.length,
      text: late.length === 1 ? "atendimento passou sem registro" : "atendimentos passaram sem registro",
      detail: "Marque como finalizado ou falta: é isso que atualiza a ficha e o estoque.",
      action: "Registrar",
      focus: { to: "agenda", day: daysFrom(data.now, late[0].startsAt) },
    });
  }
  if (noShows.length) {
    todos.push({
      count: noShows.length,
      text: noShows.length === 1 ? "paciente faltou e não remarcou" : "pacientes faltaram e não remarcaram",
      detail: names(noShows.map((x) => x.patient.name)),
      action: "Remarcar",
      focus: noShows.length === 1 ? { to: "patient", id: noShows[0].patient.id } : { to: "patients", filter: "faltou" },
    });
  }
  if (fresh.length) {
    todos.push({
      count: fresh.length,
      text: fresh.length === 1 ? "novo contato esperando resposta" : "novos contatos esperando resposta",
      detail: names(fresh.map((l) => l.name)),
      action: "Responder",
      focus: { to: "sales", filter: "novo" },
    });
  }
  if (low.length) {
    todos.push({
      count: low.length,
      text: low.length === 1 ? "produto acabando" : "produtos acabando",
      detail: names(low.map((s) => s.product.name)),
      action: "Ver estoque",
      view: "estoque",
    });
  }

  const found = ops.filter((o) => o.count > 0);
  const back = recovered(data);
  const feed = [...data.activities].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return (
    <div className={styles.page}>
      <h1 className={styles.greet}>
        {hello}. <span>{starting ? "Vamos deixar a clínica pronta no Flow." : "Aqui está o que fazer agora."}</span>
      </h1>

      {starting ? (
        <section className={styles.panel} aria-labelledby="comece">
          <h2 id="comece" className={styles.label}>
            Comece por aqui
          </h2>
          <ol className={styles.setup}>
            {setup.map((step, i) => (
              <li key={step.view} data-done={step.done ? "" : undefined}>
                <span className={styles.setupMark} aria-hidden="true">
                  {step.done ? "✓" : i + 1}
                </span>
                <p>
                  <strong>{step.text}</strong>
                  <span>{step.why}</span>
                </p>
                {step.done ? (
                  <span className={styles.when}>Feito</span>
                ) : (
                  <Link href={viewHref(step.view, base)} className={styles.textAction}>
                    Abrir <span aria-hidden="true">→</span>
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className={styles.duo}>
        <section className={styles.panel} aria-labelledby="hoje">
          <h2 id="hoje" className={styles.label}>
            Hoje <span>{dayLabel(data.now)}</span>
          </h2>
          <p className={styles.todayLine}>
            {booked.length ? plural(booked.length, "atendimento", "atendimentos") : "Nenhum atendimento marcado"}
            {booked.length ? (
              <span>
                {" · "}
                {plural(booked.filter((a) => a.status === "confirmado").length, "confirmado", "confirmados")}
                {confirmToday.length ? ` · ${confirmToday.length} aguardando` : ""}
              </span>
            ) : null}
          </p>
          <ol className={styles.miniDay}>
            {today.map((slot) => {
              const a = slot.status === "ocupado" ? slot.appointment! : undefined;
              const past = slot.startsAt < data.now;
              if (!a && past) return null;
              return (
                <li key={slot.startsAt} data-status={a ? a.status : "livre"}>
                  <span className={styles.time}>{hour(slot.startsAt)}</span>
                  <span>
                    {a ? (
                      <>
                        {patientName(a.patientId)} <span className={styles.miniMeta}>{procedureOf(data, a.procedureId)?.name}</span>
                      </>
                    ) : slot.status === "cancelado" ? (
                      "Livre · houve um cancelamento"
                    ) : (
                      "Livre"
                    )}
                  </span>
                  {a ? <span className={styles.miniStatus}>{APPOINTMENT_LABEL[a.status]}</span> : null}
                </li>
              );
            })}
          </ol>
          <FocusLink focus={{ to: "agenda", day: 0 }}>
            Abrir a agenda <span aria-hidden="true">→</span>
          </FocusLink>
        </section>

        <section className={styles.panel} aria-labelledby="atencao">
          <h2 id="atencao" className={styles.label}>
            Precisa da sua atenção
          </h2>
          {todos.length ? (
            <ol className={styles.todo}>
              {todos.map((item) => (
                <li key={item.text}>
                  <span className={styles.todoCount}>{item.count}</span>
                  <p>
                    <strong>{item.text}</strong>
                    <span>{item.detail}</span>
                  </p>
                  {item.focus ? (
                    <FocusLink focus={item.focus} className={styles.secondary}>
                      {item.action}
                    </FocusLink>
                  ) : (
                    <Link href={viewHref(item.view ?? "", base)} className={styles.secondary}>
                      {item.action}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.done}>Nada pendente. A operação está em dia.</p>
          )}
        </section>
      </div>

      <section className={styles.foundBlock} aria-labelledby="encontradas">
        <h2 id="encontradas" className={styles.label}>
          Oportunidades encontradas pelo Flow
        </h2>
        {found.length ? (
          <ol className={styles.found}>
            {found.map((o) => {
              const copy = KIND[o.kind];
              return (
                <li key={o.kind} className={styles.foundItem} data-done={o.status === "resolvida" ? "" : undefined}>
                  <span className={styles.tag}>{copy.tag}</span>
                  <p className={styles.foundTitle}>{copy.headline(o)}</p>
                  <p className={styles.fine}>
                    {o.kind === "stock_expiry"
                      ? `${plural(o.count, "lote vence", "lotes vencem")} em até 45 dias`
                      : `${brl(o.value)} ${copy.valueLabel}`}
                  </p>
                  {o.status !== "nova" ? (
                    <span className={styles.status} data-status={o.status}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  ) : null}
                  <FocusLink focus={copy.focus} className={styles.primary}>
                    {copy.action}
                  </FocusLink>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={styles.fine}>
            {live && data.patients.length === 0
              ? "Conforme a clínica usa o Flow, aparecem aqui os retornos, orçamentos parados, horários vagos e produtos perto da validade."
              : "Nenhuma oportunidade aberta agora."}
          </p>
        )}
        {found.length ? (
          <Link href={viewHref("oportunidades", base)} className={styles.textAction}>
            Ver como o Flow encontrou cada uma <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </section>

      <div className={styles.duo}>
        {live && !back.total ? null : (
          <section className={styles.panel} aria-labelledby="recuperada">
            <h2 id="recuperada" className={styles.label}>
              Receita recuperada pelo Flow <span>últimos 30 dias</span>
            </h2>
            <p className={styles.big}>{brl(back.total)}</p>
            <ul className={styles.rows}>
              {Object.entries(RECOVERED_LABEL).map(([kind, label]) => (
                <li key={kind}>
                  <span>{label}</span>
                  <strong>{brl(back.byKind.get(kind) ?? 0)}</strong>
                </li>
              ))}
            </ul>
            {live ? null : (
              <p className={styles.fine}>Métrica conceitual: soma do que as automações ajudaram a trazer de volta, sobre dados ilustrativos.</p>
            )}
          </section>
        )}

        <section className={styles.feedBlock} aria-labelledby="atividade">
          <h2 id="atividade" className={styles.label}>
            Atividade recente
          </h2>
          {feed.length ? (
            <ol className={styles.feed}>
              {feed.map((a) => (
                <li key={a.id}>
                  <span className={styles.when}>{relDay(data.now, a.at)}</span>
                  <span>{a.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.fine}>O que acontecer na clínica aparece aqui: agendamentos, confirmações, entradas no estoque.</p>
          )}
        </section>
      </div>
    </div>
  );
}
