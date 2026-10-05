"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { brl, dayAt, dayLabel, daysFrom, hour, relDay } from "@/lib/flow/format";
import {
  CONVERSATION_STATUSES,
  TEMPLATES,
  fillTemplate,
  firstName,
  personOf,
  procedureFor,
  signalFor,
  signalMessage,
  suggestReply,
  waitingOnClinic,
  withContact,
  type Conversation,
  type ConversationStatus,
  type Message,
} from "@/lib/flow/conversations";
import { hasUpcoming, procedureOf, staleQuote, upcomingFor } from "@/lib/flow/insights";
import { LEAD_STAGES, type FlowData, type ID } from "@/lib/flow/types";
import { SOURCE_LABEL, STAGE_LABEL } from "../copy";
import { FocusLink, Soon, reais } from "../forms";
import { useInbox, type InboxChange } from "../inbox";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import ui from "../ui.module.css";
import { BookingForm } from "./Schedule";
import styles from "./Conversations.module.css";

/*
  Conversas: the clinic's WhatsApp beside its CRM. Three columns on a wide
  screen (the list, the chat, the person), one at a time on a phone. Every
  conversation is tied to the contact or patient the rest of the Pulse
  knows, so the stage, the procedure, the value and the next action change
  here and everywhere at once, and booking uses the agenda's own form.

  Nothing is sent: there is no WhatsApp yet. The demo's threads are built
  from its fictitious clinic and live in memory; a real clinic has none
  until the integration exists (lib/flow/conversations.ts).
*/

const STATUS_LABEL: Record<ConversationStatus, string> = {
  aberta: "Aberta",
  aguardando_cliente: "Aguardando cliente",
  follow_up: "Follow-up",
  resolvida: "Resolvida",
};

const FILTERS = ["todos", "nao_lidos", "leads", "pacientes", "aguardando", "follow_up", "agendados"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = {
  todos: "Todos",
  nao_lidos: "Não lidos",
  leads: "Leads",
  pacientes: "Pacientes",
  aguardando: "Aguardando resposta",
  follow_up: "Follow-up",
  agendados: "Agendados",
};

type Pane = "list" | "chat" | "info";

const ddmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "14h05" today, "ontem", "há 3 dias". */
const when = (now: string, iso: string) => (daysFrom(now, iso) === 0 ? hour(iso) : relDay(now, iso));

const dayHeading = (now: string, iso: string) => {
  const d = daysFrom(now, iso);
  return d === 0 ? "Hoje" : d === -1 ? "Ontem" : dayLabel(iso);
};

/** What the list flags about a conversation, the most urgent first. */
function flagOf(data: FlowData, c: Conversation, thread: Message[]) {
  const { lead } = personOf(data, c);
  if (c.followUpAt && c.followUpAt < data.now && c.status !== "resolvida") return "Follow-up vencido";
  if (c.status !== "resolvida" && waitingOnClinic(thread)) return "Aguardando resposta";
  if (lead && staleQuote(data, lead)) return "Lead parado";
  return null;
}

/** The agenda's own booking form, opened on this person: the contact (who becomes a patient) or the patient. */
function bookingDraft(data: FlowData, c: Conversation) {
  const { lead, patient } = personOf(data, c);
  return lead ? { leadId: lead.id } : { patientId: patient?.id, procedureId: procedureFor(data, c)?.id };
}

export function Conversations() {
  const { data, access, account } = useFlow();
  const { inbox, update: send } = useInbox();
  const conversations = inbox.conversations.map((c) => withContact(data, c));
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<ID | null>(null);
  const [pane, setPane] = useState<Pane>("list");
  const [booking, setBooking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const threads = useMemo(() => {
    const by = new Map<ID, Message[]>();
    for (const m of [...inbox.messages].sort((a, b) => a.at.localeCompare(b.at))) {
      by.set(m.conversationId, [...(by.get(m.conversationId) ?? []), m]);
    }
    return by;
  }, [inbox.messages]);

  const lastAt = (c: Conversation) => threads.get(c.id)?.at(-1)?.at ?? "";
  const q = query.trim().toLowerCase();
  const list = conversations
    .filter((c) => {
      const { lead, patient } = personOf(data, c);
      const thread = threads.get(c.id) ?? [];
      if (q && !c.participant.name.toLowerCase().includes(q) && !c.participant.phone.includes(q)) return false;
      switch (filter) {
        case "nao_lidos":
          return c.unread > 0;
        case "leads":
          return Boolean(lead) && !patient;
        case "pacientes":
          return Boolean(patient);
        case "aguardando":
          return c.status !== "resolvida" && waitingOnClinic(thread);
        case "follow_up":
          return c.status === "follow_up" || Boolean(c.followUpAt);
        case "agendados":
          return lead?.stage === "agendado" || (patient ? hasUpcoming(data, patient.id) : false);
        default:
          return true;
      }
    })
    .sort((a, b) => lastAt(b).localeCompare(lastAt(a)));

  // On a wide screen a conversation is always open: the most recent, until another is chosen.
  const selected = conversations.find((c) => c.id === openId) ?? list[0] ?? null;

  const open = (id: ID) => {
    setOpenId(id);
    setNote(false);
    setPane("chat");
    send({ type: "read", id });
  };

  if (!conversations.length) {
    return (
      <div className={ui.page}>
        <header className={ui.head}>
          <h1 className={ui.title}>
            Conversas <Soon />
          </h1>
          <p className={ui.lead}>
            O atendimento pelo WhatsApp, ao lado do CRM: cada conversa com a etapa, o procedimento e a próxima ação da
            pessoa. Chega com a integração do WhatsApp; até lá, nenhuma mensagem passa pelo Pulse.
          </p>
        </header>
        {access.isDemoMode ? null : (
          <p className={ui.fine}>Enquanto isso, a demonstração mostra como vai funcionar com dados fictícios.</p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.inbox} data-pane={pane}>
      <section className={styles.listCol} aria-label="Conversas">
        <header className={styles.listHead}>
          <h1 className={styles.heading}>Conversas</h1>
          <input
            className={styles.search}
            type="search"
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar conversa"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.filters} role="group" aria-label="Filtrar conversas">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </header>
        {list.length ? (
          <ol className={styles.list}>
            {list.map((c) => {
              const thread = threads.get(c.id) ?? [];
              const last = thread.filter((m) => m.direction !== "note").at(-1);
              const { lead, patient } = personOf(data, c);
              const flag = flagOf(data, c, thread);
              const owner = data.users.find((u) => u.id === c.assignedUserId);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={selected?.id === c.id ? "true" : undefined}
                    onClick={() => open(c.id)}
                  >
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(c.participant.name)}
                    </span>
                    <span className={styles.itemMain}>
                      <span className={styles.itemTop}>
                        <strong>{c.participant.name}</strong>
                        <span className={styles.itemTime}>{last ? when(data.now, last.at) : ""}</span>
                      </span>
                      <span className={styles.preview}>
                        {last?.direction === "out" ? "Você: " : ""}
                        {last?.text}
                      </span>
                      <span className={styles.itemMeta}>
                        <span>{lead ? STAGE_LABEL[lead.stage] : patient ? "Paciente" : ""}</span>
                        {owner ? <span>· {firstName(owner.name)}</span> : null}
                        {flag ? <span className={styles.flag}>{flag}</span> : null}
                        {c.unread ? (
                          <span className={styles.unread} aria-label={`${c.unread} não lidas`}>
                            {c.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={`${ui.fine} ${styles.empty}`}>Nenhuma conversa neste filtro.</p>
        )}
      </section>

      {selected ? (
        <Chat
          key={selected.id}
          conversation={selected}
          thread={threads.get(selected.id) ?? []}
          send={send}
          onBack={() => setPane("list")}
          onInfo={() => setPane("info")}
          onBook={() => setBooking(true)}
          notice={notice}
          flash={setNotice}
          note={note}
          setNote={setNote}
          authorId={data.users.find((u) => u.name === account?.name)?.id ?? data.users[0]?.id}
        />
      ) : null}
      {selected ? (
        <Context
          conversation={selected}
          send={send}
          onBack={() => setPane("chat")}
          onBook={() => setBooking(true)}
          notice={notice}
          flash={setNotice}
          onNote={() => {
            setPane("chat");
            setNote(true);
          }}
        />
      ) : null}
      {selected ? (
        <Sheet open={booking} onClose={() => setBooking(false)} title="Agendar" kicker={selected.participant.name}>
          {booking ? (
            <BookingForm
              draft={bookingDraft(data, selected)}
              onDone={() => {
                setBooking(false);
                setNotice("Agendamento criado.");
              }}
            />
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

interface ChatProps {
  conversation: Conversation;
  thread: Message[];
  send: (c: InboxChange) => void;
  onBack: () => void;
  onInfo: () => void;
  onBook: () => void;
  notice: string | null;
  flash: (text: string) => void;
  /** The composer writes an internal note instead of a message. */
  note: boolean;
  setNote: (note: boolean) => void;
  authorId?: ID;
}

function Chat({ conversation: c, thread, send, onBack, onInfo, onBook, notice, flash, note, setNote, authorId }: ChatProps) {
  const { data, access, dispatch } = useFlow();
  const [text, setText] = useState("");
  const [suggested, setSuggested] = useState(false);
  const [tool, setTool] = useState<"templates" | "followup" | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const signal = signalFor(data, c);
  const procedure = procedureFor(data, c)?.name;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread.length]);
  useEffect(() => {
    if (note) field.current?.focus();
  }, [note]);

  const compose = (value: string, asNote = false) => {
    setText(value);
    setNote(asNote);
    setTool(null);
    field.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    send({ type: "write", id: c.id, text: value, note, now: data.now, authorId });
    // A message to a contact is a contact made: Vendas sees it (last contact, a quote no longer silent).
    const { lead } = personOf(data, c);
    if (!note && lead && lead.stage !== "agendado") dispatch({ type: "contactLead", id: lead.id });
    setText("");
    setSuggested(false);
    if (note) setNote(false);
  };

  const followUp = (days: number | string) => {
    const at =
      typeof days === "number" ? new Date(Date.parse(data.now) + days * 86_400_000).toISOString() : `${days}T09:00:00.000Z`;
    send({ type: "followUp", id: c.id, at });
    setTool(null);
    flash(`Follow-up marcado para ${ddmm(at)}.`);
  };

  // A day heading above the first message of each day.
  const rows = thread.map((m, i) => {
    const heading = dayHeading(data.now, m.at);
    return { m, heading: i === 0 || dayHeading(data.now, thread[i - 1].at) !== heading ? heading : null };
  });

  return (
    <section className={styles.chatCol} aria-label={`Conversa com ${c.participant.name}`}>
      <header className={styles.chatHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Voltar às conversas">
          ←
        </button>
        <span className={styles.avatar} aria-hidden="true">
          {initials(c.participant.name)}
        </span>
        <div className={styles.chatWho}>
          <strong>{c.participant.name}</strong>
          <span>{c.participant.phone}</span>
        </div>
        <label className={styles.statusPick}>
          <span className="sr-only">Status da conversa</span>
          <select
            className={ui.input}
            value={c.status}
            onChange={(e) => send({ type: "status", id: c.id, status: e.target.value as ConversationStatus })}
          >
            {CONVERSATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.infoButton} onClick={onInfo}>
          Detalhes
        </button>
      </header>

      {signal ? (
        <div className={styles.signal} role="note">
          <span className="pulse-dot" aria-hidden="true" />
          <p>{signal.text}</p>
          {signal.kind === "stock" ? (
            <FocusLink focus={{ to: "opportunity", kind: "stock_expiry" }} className={styles.signalAction}>
              {signal.action}
            </FocusLink>
          ) : (
            <button type="button" className={styles.signalAction} onClick={() => compose(signalMessage(data, c, signal))}>
              {signal.action}
            </button>
          )}
        </div>
      ) : null}

      <div className={styles.thread} aria-live="polite">
        {rows.map(({ m, heading }) => {
          return (
            <div key={m.id} className={styles.row} data-dir={m.direction}>
              {heading ? <p className={styles.day}>{heading}</p> : null}
              <div className={styles.bubble} data-dir={m.direction}>
                {m.direction === "note" ? <span className={styles.noteLabel}>Nota interna · só a equipe vê</span> : null}
                <p>{m.text}</p>
                <span className={styles.meta}>
                  {hour(m.at)}
                  {m.status ? ` · ${m.status}` : ""}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {notice ? (
        <p className={styles.toast} role="status">
          {notice}
        </p>
      ) : null}

      <form className={styles.composer} onSubmit={submit} data-note={note ? "" : undefined}>
        <div className={styles.modes} role="group" aria-label="Tipo de mensagem">
          <button type="button" aria-pressed={!note} onClick={() => setNote(false)}>
            Mensagem
          </button>
          <button type="button" aria-pressed={note} onClick={() => setNote(true)}>
            Nota interna
          </button>
        </div>
        <textarea
          ref={field}
          className={styles.field}
          rows={2}
          placeholder={note ? "Nota para a equipe (a pessoa não vê)…" : "Digite uma mensagem…"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSuggested(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {suggested ? <p className={styles.review}>Sugestão do Pulse: revise e ajuste antes de enviar.</p> : null}
        <div className={styles.tools}>
          <button type="button" onClick={() => flash("Anexos chegam com a integração do WhatsApp.")}>
            Anexar
          </button>
          <button type="button" aria-expanded={tool === "templates"} onClick={() => setTool(tool === "templates" ? null : "templates")}>
            Respostas rápidas
          </button>
          <button
            type="button"
            onClick={() => {
              compose(suggestReply(data, c, thread));
              setSuggested(true);
            }}
          >
            Sugerir resposta
          </button>
          <button type="button" onClick={onBook}>
            Agendar
          </button>
          <button type="button" aria-expanded={tool === "followup"} onClick={() => setTool(tool === "followup" ? null : "followup")}>
            Follow-up
          </button>
          <button type="button" onClick={() => compose("", true)}>
            Nota
          </button>
          <button type="submit" className={styles.sendButton} disabled={!text.trim()}>
            {note ? "Salvar nota" : "Enviar"}
          </button>
        </div>

        {tool === "templates" ? (
          <ul className={styles.menu}>
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => compose(fillTemplate(t.text, { name: c.participant.name, procedure }))}>
                  <strong>{t.name}</strong>
                  <span>{fillTemplate(t.text, { name: c.participant.name, procedure })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tool === "followup" ? <FollowUpPicker now={data.now} onPick={followUp} /> : null}
        {access.isDemoMode ? (
          <p className={ui.fine}>Demonstração: nada é enviado de verdade e nada fica salvo.</p>
        ) : null}
      </form>

    </section>
  );
}

function FollowUpPicker({ now, onPick }: { now: string; onPick: (days: number | string) => void }) {
  const [date, setDate] = useState("");
  return (
    <div className={styles.menu} role="group" aria-label="Criar follow-up">
      <div className={styles.followUps}>
        {(
          [
            ["Amanhã", 1],
            ["3 dias", 3],
            ["7 dias", 7],
          ] as const
        ).map(([label, days]) => (
          <button key={label} type="button" className={ui.chipButton} onClick={() => onPick(days)}>
            {label}
          </button>
        ))}
        <label className={styles.pickDate}>
          <span className="sr-only">Escolher data</span>
          <input
            className={ui.input}
            type="date"
            min={now.slice(0, 10)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button type="button" className={ui.chipButton} disabled={!date} onClick={() => onPick(date)}>
          Escolher data
        </button>
      </div>
    </div>
  );
}

interface ContextProps {
  conversation: Conversation;
  send: (c: InboxChange) => void;
  onBack: () => void;
  onBook: () => void;
  onNote: () => void;
  notice: string | null;
  flash: (text: string) => void;
}

function Context({ conversation: c, send, onBack, onBook, onNote, notice, flash: setSaved }: ContextProps) {
  const { data, dispatch } = useFlow();
  const { lead, patient } = personOf(data, c);
  const procedure = procedureFor(data, c);
  const lastVisit = patient?.lastVisitAt;
  const next = patient ? upcomingFor(data, patient.id)[0] : undefined;
  const nextStage = lead ? LEAD_STAGES[LEAD_STAGES.indexOf(lead.stage) + 1] : undefined;

  const updateLead = (changes: { procedureId?: ID; potentialValue?: number; nextAction?: string }, what: string) => {
    if (!lead) return;
    dispatch({ type: "updateLead", id: lead.id, changes });
    setSaved(what);
  };

  return (
    <aside className={styles.infoCol} aria-label={`Sobre ${c.participant.name}`}>
      <button type="button" className={styles.back} onClick={onBack} aria-label="Voltar à conversa">
        ←
      </button>
      <header className={styles.infoHead}>
        <span className={`${styles.avatar} ${styles.avatarLarge}`} aria-hidden="true">
          {initials(c.participant.name)}
        </span>
        <strong>{c.participant.name}</strong>
        <span className={ui.fine}>{c.participant.phone}</span>
        <span className={styles.kind}>{patient ? (lead ? "Lead e paciente" : "Paciente") : "Lead"}</span>
      </header>

      <dl className={styles.facts}>
        {lead ? (
          <div>
            <dt>Origem</dt>
            <dd>{SOURCE_LABEL[lead.source]}</dd>
          </div>
        ) : null}
        {lead ? (
          <div>
            <dt>Etapa do funil</dt>
            <dd>
              <select
                className={ui.input}
                value={lead.stage}
                onChange={(e) => {
                  dispatch({ type: "moveLead", id: lead.id, stage: e.target.value as (typeof LEAD_STAGES)[number] });
                  setSaved("Etapa atualizada.");
                }}
              >
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{lead ? "Procedimento de interesse" : "Último procedimento"}</dt>
          <dd>
            {lead ? (
              <select
                className={ui.input}
                value={lead.procedureId}
                onChange={(e) => updateLead({ procedureId: e.target.value }, "Procedimento atualizado.")}
              >
                {data.procedures.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              (procedure?.name ?? "—")
            )}
          </dd>
        </div>
        {patient ? (
          <div>
            <dt>Última visita</dt>
            <dd>{lastVisit ? relDay(data.now, lastVisit) : "Ainda não veio"}</dd>
          </div>
        ) : null}
        {next ? (
          <div>
            <dt>Próximo agendamento</dt>
            <dd>
              {dayAt(data.now, next.startsAt)} · {procedureOf(data, next.procedureId)?.name ?? "procedimento"}
            </dd>
          </div>
        ) : null}
        {patient?.nextReturnAt ? (
          <div>
            <dt>Próximo retorno</dt>
            <dd>{ddmm(patient.nextReturnAt)}</dd>
          </div>
        ) : null}
        {lead ? (
          <div>
            <dt>Valor potencial</dt>
            <dd>
              <MoneyField
                key={lead.potentialValue}
                cents={lead.potentialValue}
                onSave={(cents) => updateLead({ potentialValue: cents }, "Valor atualizado.")}
              />
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Responsável</dt>
          <dd>
            <select
              className={ui.input}
              value={c.assignedUserId ?? ""}
              onChange={(e) => {
                send({ type: "assign", id: c.id, userId: e.target.value });
                setSaved("Responsável atualizado.");
              }}
            >
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </dd>
        </div>
        {lead ? (
          <div>
            <dt>Último contato</dt>
            <dd>{relDay(data.now, lead.lastContactAt)}</dd>
          </div>
        ) : null}
        {lead ? (
          <div>
            <dt>Próxima ação</dt>
            <dd>
              <TextField
                key={lead.nextAction}
                value={lead.nextAction}
                placeholder="Ex.: confirmar a avaliação"
                onSave={(nextAction) => updateLead({ nextAction }, "Próxima ação atualizada.")}
              />
            </dd>
          </div>
        ) : null}
        {c.followUpAt ? (
          <div>
            <dt>Follow-up</dt>
            <dd className={c.followUpAt < data.now ? styles.overdue : undefined}>Follow-up: {ddmm(c.followUpAt)}</dd>
          </div>
        ) : null}
        {patient && !lead ? (
          <div>
            <dt>Total investido</dt>
            <dd>{brl(patient.totalSpent)}</dd>
          </div>
        ) : null}
      </dl>

      {notice ? (
        <p className={styles.saved} role="status">
          {notice}
        </p>
      ) : null}

      <div className={styles.infoActions}>
        <button type="button" className={ui.primary} onClick={onBook}>
          Agendar
        </button>
        <button
          type="button"
          className={ui.secondary}
          onClick={() => {
            send({ type: "followUp", id: c.id, at: new Date(Date.parse(data.now) + 3 * 86_400_000).toISOString() });
            setSaved("Follow-up criado para daqui a 3 dias.");
          }}
        >
          Criar follow-up
        </button>
        {lead && nextStage ? (
          <button
            type="button"
            className={ui.secondary}
            onClick={() => {
              dispatch({ type: "moveLead", id: lead.id, stage: nextStage });
              setSaved(`${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[nextStage]}.`);
            }}
          >
            Mover para {STAGE_LABEL[nextStage]}
          </button>
        ) : null}
        {patient ? (
          <FocusLink focus={{ to: "patient", id: patient.id }} className={ui.secondary}>
            Ver paciente
          </FocusLink>
        ) : lead ? (
          <FocusLink focus={{ to: "lead", id: lead.id }} className={ui.secondary}>
            Ver em Vendas
          </FocusLink>
        ) : null}
        <button
          type="button"
          className={ui.quiet}
          onClick={onNote}
        >
          Adicionar nota
        </button>
      </div>

    </aside>
  );
}

function MoneyField({ cents, onSave }: { cents: number; onSave: (cents: number) => void }) {
  const [value, setValue] = useState(reais(cents));
  const commit = () => {
    const parsed = Math.round(Number(value.replace(/\./g, "").replace(",", ".")) * 100);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== cents) onSave(parsed);
    else setValue(reais(cents));
  };
  return (
    <span className={styles.money}>
      R$
      <input
        className={ui.input}
        inputMode="decimal"
        aria-label="Valor potencial em reais"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </span>
  );
}

function TextField({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (value: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      className={ui.input}
      value={text}
      placeholder={placeholder}
      aria-label="Próxima ação"
      maxLength={200}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
