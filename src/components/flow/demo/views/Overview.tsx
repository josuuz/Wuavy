"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { PRICE } from "@/lib/flow/access";
import { brl, capital, dayLabel, daysFrom, hour, plural, relDay } from "@/lib/flow/format";
import {
  averageTicket,
  awaiting,
  daySlots,
  dueReturns,
  expiryOpportunities,
  finance,
  lowStock,
  missed,
  openLeads,
  openSlots,
  overdueReturns,
  potentialOf,
  procedureOf,
  recovered,
  returnsThisWeek,
  returnValue,
  stuckLeads,
  unrecorded,
  valueDelivered,
} from "@/lib/flow/insights";
import { APPOINTMENT_LABEL, KIND, RECOVERED_FRONTS, STATUS_LABEL, viewHref } from "../copy";
import { FocusLink, Soon } from "../forms";
import { useFlow, type Focus } from "../store";
import styles from "../ui.module.css";
import { Indicators } from "./Indicators";
import { selection } from "./Opportunities";

/*
  The first screen answers one question: what needs attention now? The
  clinic's numbers that ask for action, each opening where it is acted on;
  the queue of things to do today, each with the action that settles it;
  where the money is waiting. Revenue the Pulse recovered is not tracked yet:
  it says so, and the demo shows it only as a preview. No chart without an
  action next to it.
*/

const noSubscribe = () => () => {};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

/** Questions the overview hands straight to "Pergunte ao Pulse". */
const QUICK = ["O que preciso fazer hoje?", "Onde estou perdendo dinheiro?", "Quanto tenho de receita potencial?"];

/** Coming, and part of the plan: listed under the first steps, never as one of them. */
const COMING = [
  { name: "Automações inteligentes", text: "o Pulse prepara cada contato na hora certa, sozinho" },
  { name: "Pulse AI", text: "perguntas livres sobre a clínica" },
];

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
  const { data, ops, base, live, ask } = useFlow();
  const hello = useSyncExternalStore(noSubscribe, greeting, () => "Bom dia");
  const [tab, setTab] = useState<"agora" | "indicadores">("agora");
  const today = daySlots(data, 0);
  const booked = today.filter((s) => s.status === "ocupado").map((s) => s.appointment!);
  const patientName = (id: string) => data.patients.find((p) => p.id === id)?.name ?? "";

  // A real clinic's first steps, checked off as they happen. Until there is real data, they are the screen.
  const setup = [
    { done: true, text: "Clínica criada", why: "A conta, a assinatura e o perfil da clínica estão prontos.", view: "" },
    {
      done: data.patients.length > 0,
      text: "Adicionar o primeiro paciente",
      why: "Com o último atendimento de cada um, o Pulse já calcula quem precisa retornar.",
      view: "pacientes",
    },
    {
      done: data.procedures.length > 0,
      text: "Criar os procedimentos",
      why: "Preço, duração e retorno de cada um alimentam a agenda e as oportunidades.",
      view: "procedimentos",
    },
    {
      done: data.appointments.length > 0,
      text: "Configurar a agenda",
      why: "Marque o primeiro atendimento: é dele que vêm os retornos e os horários a preencher.",
      view: "agenda",
    },
    {
      done: data.products.length > 0,
      text: "Cadastrar o estoque",
      why: "O Pulse avisa o que está acabando e o que vence, e dá baixa a cada atendimento finalizado.",
      view: "estoque",
    },
  ];
  const preparing = live && setup.some((s) => !s.done);
  // Nothing real to read yet: no empty dashboards, only the checklist.
  const starting = live && !data.patients.length && !data.leads.length && !data.appointments.length;

  // What to do now, in the order a front desk would do it: today's agenda first, then the money left waiting.
  const confirmToday = awaiting(data, 0);
  const confirmTomorrow = awaiting(data, 1);
  const late = unrecorded(data);
  const slots = openSlots(data);
  const fresh = data.leads.filter((l) => l.stage === "novo");
  const stuck = stuckLeads(data);
  const noShows = missed(data);
  const overdue = overdueReturns(data);
  const week = returnsThisWeek(data);
  const expiring = expiryOpportunities(data);
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
  if (slots.length) {
    const byDay = [0, 1]
      .map((day) => {
        const own = slots.filter((s) => daysFrom(data.now, s.startsAt) === day);
        const cancelled = own.some((s) => s.status === "cancelado");
        return own.length
          ? `${capital(relDay(data.now, own[0].startsAt))} ${own.map((s) => hour(s.startsAt)).join(", ")}${cancelled ? " (cancelamento)" : ""}`
          : "";
      })
      .filter(Boolean);
    todos.push({
      count: slots.length,
      text: slots.length === 1 ? "horário vazio até amanhã" : "horários vazios até amanhã",
      detail: `${byDay.join(" · ")} · cerca de ${brl(slots.length * averageTicket(data))}`,
      action: "Preencher",
      focus: { to: "agenda", day: daysFrom(data.now, slots[0].startsAt) },
    });
  }
  if (fresh.length) {
    todos.push({
      count: fresh.length,
      text: fresh.length === 1 ? "lead esperando resposta" : "leads esperando resposta",
      detail: names(fresh.map((l) => l.name)),
      action: "Responder",
      focus: { to: "sales", filter: "novo" },
    });
  }
  if (stuck.length) {
    todos.push({
      count: stuck.length,
      text: stuck.length === 1 ? "orçamento sem resposta" : "orçamentos sem resposta",
      detail: `${brl(stuck.reduce((s, l) => s + l.potentialValue, 0))} em aberto · ${names(stuck.map((l) => l.name))}`,
      action: "Fazer follow-up",
      focus: { to: "opportunity", kind: "lead_followup" },
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
  if (overdue.length) {
    todos.push({
      count: overdue.length,
      text: overdue.length === 1 ? "paciente com retorno atrasado" : "pacientes com retorno atrasado",
      detail: `${brl(overdue.reduce((s, p) => s + returnValue(data, p), 0))} em retornos prováveis, sem nada marcado`,
      action: "Ver pacientes",
      focus: { to: "patients", filter: "retorno" },
    });
  }
  if (week.length) {
    todos.push({
      count: week.length,
      text: week.length === 1 ? "paciente deveria retornar esta semana" : "pacientes deveriam retornar esta semana",
      detail: names(week.map((p) => p.name)),
      action: "Ver pacientes",
      focus: { to: "patients", filter: "semana" },
    });
  }
  if (expiring.length) {
    const people = new Set(expiring.flatMap((x) => x.patients.map((p) => p.id))).size;
    todos.push({
      count: expiring.length,
      text: expiring.length === 1 ? "lote vence em até 45 dias" : "lotes vencem em até 45 dias",
      detail: `${names(expiring.map((x) => x.product?.name ?? "produto"))} · ${plural(people, "paciente compatível", "pacientes compatíveis")}`,
      action: "Ver oportunidade",
      focus: { to: "opportunity", kind: "stock_expiry" },
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

  const found = ops.filter((o) => o.count > 0).sort((a, b) => b.value - a.value);
  const potential = potentialOf(ops);
  const back = recovered(data);
  const value = valueDelivered(data, ops);
  const money = finance(data);
  const multiple = Math.floor(value.revenue / PRICE);
  const feed = [...data.activities].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const alerts = low.length + expiring.length;

  // The numbers of now, each one a door to where it is acted on.
  const stats: { value: string; label: string; focus?: Focus; view?: string; main?: boolean }[] = [
    { value: brl(potential), label: "Receita potencial em oportunidades", view: "oportunidades", main: true },
    { value: String(dueReturns(data).length), label: "Pacientes para retornar", focus: { to: "patients", filter: "retorno" } },
    { value: String(slots.length), label: "Horários vagos até amanhã", focus: { to: "agenda", day: 0 } },
    { value: String(openLeads(data).length), label: "Leads em aberto", view: "vendas" },
    { value: String(stuck.length), label: "Orçamentos sem resposta", focus: { to: "sales", filter: "sem_resposta" } },
    { value: String(alerts), label: alerts === 1 ? "Alerta de estoque" : "Alertas de estoque", view: "estoque" },
  ];

  const checklist = (
    <section className={styles.panel} aria-labelledby="prepare">
      <h2 id="prepare" className={styles.label}>
        Prepare seu Pulse <span>{setup.filter((s) => s.done).length} de {setup.length}</span>
      </h2>
      <ol className={styles.setup}>
        {setup.map((step) => (
          <li key={step.text} data-done={step.done ? "" : undefined}>
            <span className={styles.setupMark} aria-hidden="true">
              {step.done ? "✓" : ""}
            </span>
            <p>
              <strong>{step.text}</strong>
              <span>{step.why}</span>
            </p>
            {step.done ? (
              <span className={styles.when}>Feito</span>
            ) : (
              <Link href={viewHref(step.view, base)} className={styles.textAction}>
                Fazer agora <span aria-hidden="true">→</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
      <ul className={styles.soonList} aria-label="Em breve no Pulse">
        {COMING.map((item) => (
          <li key={item.name}>
            <Soon />
            <strong>{item.name}</strong> · {item.text}
          </li>
        ))}
      </ul>
    </section>
  );

  if (starting) {
    return (
      <div className={styles.page}>
        <h1 className={styles.greet}>
          {hello}. <span>Seu Pulse está ativo. Vamos prepará-lo para a clínica.</span>
        </h1>
        {checklist}
        <p className={styles.fine}>
          Conforme a clínica usa o Pulse, esta tela passa a mostrar o que precisa de atenção, as oportunidades e quanto cada
          uma vale.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.greet}>
        {hello}. <span>{tab === "agora" ? "O que precisa da sua atenção agora?" : "Como a clínica está indo?"}</span>
      </h1>

      <div className={`${styles.segmented} ${styles.tabs}`} role="group" aria-label="Visão geral">
        <button type="button" aria-pressed={tab === "agora"} onClick={() => setTab("agora")}>
          Agora
        </button>
        <button type="button" aria-pressed={tab === "indicadores"} onClick={() => setTab("indicadores")}>
          Indicadores
        </button>
      </div>

      {tab === "indicadores" ? (
        <Indicators />
      ) : (
        <>

      <div className={styles.askStrip}>
        <p className={styles.askStripLabel}>
          <span className="pulse-dot" aria-hidden="true" />
          Pergunte ao Pulse
        </p>
        {QUICK.map((q) => (
          <button key={q} type="button" className={styles.chipButton} onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>

      {preparing ? checklist : null}

      <ul className={styles.stats} aria-label="Números de agora">
        {stats.map((stat) => {
          const body = (
            <>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </>
          );
          return (
            <li key={stat.label} data-main={stat.main ? "" : undefined}>
              {stat.focus ? (
                <FocusLink focus={stat.focus} className="">
                  {body}
                </FocusLink>
              ) : (
                <Link href={viewHref(stat.view ?? "", base)}>{body}</Link>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.duo}>
        <section className={styles.panel} aria-labelledby="atencao">
          <h2 id="atencao" className={styles.label}>
            Precisa da sua atenção <span>{todos.length ? plural(todos.length, "item", "itens") : ""}</span>
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
      </div>

      <section className={styles.foundBlock} aria-labelledby="encontradas">
        <h2 id="encontradas" className={styles.label}>
          Oportunidades encontradas pelo Pulse {potential ? <span>{brl(potential)} em potencial</span> : null}
        </h2>
        {found.length ? (
          <ol className={styles.found}>
            {found.map((o) => {
              const copy = KIND[o.kind];
              return (
                <li key={o.kind} className={styles.foundItem} data-done={o.status === "resolvida" ? "" : undefined}>
                  <span className={styles.tag}>{copy.tag}</span>
                  <p className={styles.foundTitle}>{copy.headline(o)}</p>
                  <p className={styles.foundValue}>
                    <span>Potencial</span> {brl(o.value)}
                  </p>
                  <p className={styles.fine}>{copy.picked(selection(data, o.kind).length)}</p>
                  {o.status !== "nova" ? (
                    <span className={styles.status} data-status={o.status}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  ) : null}
                  <FocusLink focus={{ to: "opportunity", kind: o.kind }} className={styles.primary}>
                    {copy.action}
                  </FocusLink>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={styles.fine}>
            {live && data.patients.length === 0
              ? "Conforme a clínica usa o Pulse, aparecem aqui os retornos, orçamentos parados, horários vagos e produtos perto da validade."
              : "Nenhuma oportunidade aberta agora."}
          </p>
        )}
      </section>

      <section id="valor" className={styles.value} aria-labelledby="valor-titulo">
        <h2 id="valor-titulo" className={styles.valueTitle}>
          <span className="pulse-dot" aria-hidden="true" />
          Receita recuperada pelo Pulse <Soon />
        </h2>
        {live ? (
          <p className={styles.lead}>
            O rastreamento de receita recuperada está em desenvolvimento: ele vai mostrar quanto voltou de cada oportunidade
            trabalhada. Até lá, o Pulse mostra só a receita potencial, o que está ao alcance:{" "}
            <strong>{brl(potential)}</strong> nas oportunidades abertas agora.
          </p>
        ) : (
          <>
            <dl className={styles.valueGrid}>
              <div data-main="">
                <dt>Últimos 30 dias</dt>
                <dd>{brl(value.revenue)}</dd>
              </div>
              <div>
                <dt>Oportunidades encontradas</dt>
                <dd>{value.found}</dd>
              </div>
              <div>
                <dt>Orçamentos recuperados</dt>
                <dd>{value.quotes}</dd>
              </div>
              <div>
                <dt>Leads convertidos</dt>
                <dd>{value.leads}</dd>
              </div>
              <div>
                <dt>Pacientes reativados</dt>
                <dd>{value.patients}</dd>
              </div>
              <div>
                <dt>Horários preenchidos</dt>
                <dd>{value.slots}</dd>
              </div>
            </dl>
            {value.revenue ? (
              <p className={styles.roi}>
                O Pulse custa {brl(PRICE)} por mês e, neste exemplo, ajudou a recuperar {brl(value.revenue)}
                {multiple >= 1 ? (
                  <>
                    : <strong>{multiple}× o valor da mensalidade</strong>.
                  </>
                ) : (
                  "."
                )}
              </p>
            ) : null}
            <p className={styles.fine}>
              Prévia com dados fictícios: é assim que o Pulse vai mostrar a receita recuperada quando o rastreamento estiver
              disponível.
            </p>
          </>
        )}
      </section>

      <div className={styles.duo}>
        {live ? null : (
          <section className={styles.panel} aria-labelledby="recuperada">
            <h2 id="recuperada" className={styles.label}>
              De onde veio <span>prévia · últimos 30 dias</span>
            </h2>
            <ul className={styles.rows}>
              {RECOVERED_FRONTS.map((front) => (
                <li key={front.label}>
                  <span>{front.label}</span>
                  <strong>{brl(front.kinds.reduce((s, kind) => s + (back.byKind.get(kind) ?? 0), 0))}</strong>
                </li>
              ))}
            </ul>
            <p className={styles.fine}>Ilustrativo, sobre os dados fictícios da demo.</p>
          </section>
        )}

        <section className={styles.panel} aria-labelledby="resultado">
          <h2 id="resultado" className={styles.label}>
            Resultado da clínica
          </h2>
          <ul className={styles.rows}>
            <li>
              <span>
                Receita realizada <span className={styles.miniMeta}>últimos 30 dias · {plural(money.visits, "atendimento", "atendimentos")}</span>
              </span>
              <strong>{brl(money.realized)}</strong>
            </li>
            <li>
              <span>
                Receita prevista <span className={styles.miniMeta}>agenda dos próximos 30 dias · {money.booked} marcados</span>
              </span>
              <strong>{brl(money.forecast)}</strong>
            </li>
            <li>
              <span>Ticket médio</span>
              <strong>{brl(money.ticket)}</strong>
            </li>
            <li>
              <span>
                Receita potencial <span className={styles.miniMeta}>oportunidades abertas</span>
              </span>
              <strong className={styles.accentNumber}>{brl(potential)}</strong>
            </li>
          </ul>
          <p className={styles.fine}>
            Calculado pela agenda e pelo preço de cada procedimento. Contas a receber e inadimplência entram quando os
            pagamentos forem registrados no Pulse.
          </p>
        </section>
      </div>

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
        </>
      )}
    </div>
  );
}
