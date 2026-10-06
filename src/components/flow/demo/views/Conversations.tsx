"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { whatsappHref } from "@/lib/contact";
import { READ_ONLY_MESSAGE } from "@/lib/flow/access";
import { addEntry, loadThread, startConversation, updateConversation } from "@/lib/flow/conversation-actions";
import { brl, dayAt, dayLabel, daysFrom, hour, relDay } from "@/lib/flow/format";
import { createClient } from "@/lib/supabase/client";
import { retryWhatsApp, sendWhatsApp } from "@/lib/whatsapp/actions";
import {
  CHANNEL_LABEL,
  CONVERSATION_STATUSES,
  DELIVERY_LABEL,
  MANUAL_CHANNELS,
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
  type Channel,
  type Conversation,
  type ConversationStatus,
  type Message,
  type MessageDirection,
  type Thread,
} from "@/lib/flow/conversations";
import { hasUpcoming, procedureOf, staleQuote, upcomingFor } from "@/lib/flow/insights";
import { LEAD_SOURCES, LEAD_STAGES, type FlowData, type ID } from "@/lib/flow/types";
import { SOURCE_LABEL, STAGE_LABEL } from "../copy";
import { Field, FocusLink, Prepared, Soon, reais, useWrite, FormError, waNumber } from "../forms";
import { useInbox, type InboxChange } from "../inbox";
import { Sheet } from "../Sheet";
import { useFlow, useFocus, type Focus } from "../store";
import { contactLead } from "@/lib/flow/actions";
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
  from its fictitious clinic and live in memory. A real clinic keeps its
  own history in the database (lib/flow/conversation-actions.ts): the team
  registers what happened (what the person said, what the clinic said, a
  call, a note), with the time and who registered it, and it stays.
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

/**
 * The demo's conversations live in memory; a real clinic's in the database,
 * registered by hand until WhatsApp is connected (LiveConversations, below).
 */
export function Conversations() {
  return useFlow().live ? <LiveConversations /> : <DemoConversations />;
}

function DemoConversations() {
  const { data, access, account } = useFlow();
  const { inbox, update: send } = useInbox();
  const conversations = inbox.conversations.map((c) => withContact(data, c));
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  // "Iniciar contato" from another screen: that conversation, open, with its first message ready.
  const asked = useFocus("conversation");
  const [openId, setOpenId] = useState<ID | null>(asked?.id ?? null);
  const [pane, setPane] = useState<Pane>(asked?.id ? "chat" : "list");
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
            O atendimento pelo WhatsApp, ao lado de Vendas: cada conversa com a etapa, o procedimento e a próxima ação da
            pessoa. Chega com a integração do WhatsApp; até lá, nenhuma mensagem passa pelo Pulse.
          </p>
        </header>
        {asked ? <ContactToStart asked={asked} /> : null}
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
          draft={asked?.id === selected.id ? asked.draft : undefined}
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
  /** A first message brought from another screen, to review before sending. */
  draft?: string;
  authorId?: ID;
}

function Chat({ conversation: c, thread, send, onBack, onInfo, onBook, notice, flash, note, setNote, draft, authorId }: ChatProps) {
  const { data, access, dispatch } = useFlow();
  const [text, setText] = useState(draft ?? "");
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

/**
 * A real clinic, before WhatsApp is connected: the person "Iniciar contato"
 * brought here, the message to review, a way to send it from the clinic's own
 * WhatsApp, and the contact recorded in Vendas. Nothing is sent by the Pulse.
 */
function ContactToStart({ asked }: { asked: Extract<Focus, { to: "conversation" }> }) {
  const { data } = useFlow();
  const { pending, error, write } = useWrite();
  const [recorded, setRecorded] = useState(false);
  const lead = asked.leadId ? data.leads.find((l) => l.id === asked.leadId) : undefined;
  return (
    <section className={ui.panel} aria-labelledby="contato-a-iniciar">
      <h2 id="contato-a-iniciar" className={ui.label}>
        Contato a iniciar · {asked.name}
      </h2>
      <Prepared text={asked.draft} phone={asked.phone}>
        {lead && lead.stage !== "agendado" ? (
          <button
            type="button"
            className={ui.secondary}
            disabled={pending || recorded}
            onClick={() => write(() => contactLead(lead.id), () => setRecorded(true))}
          >
            {recorded ? "Contato registrado" : "Registrar contato"}
          </button>
        ) : null}
      </Prepared>
      <FormError error={error} />
      <div className={ui.actions}>
        {asked.patientId ? (
          <FocusLink focus={{ to: "patient", id: asked.patientId }}>
            Ver a ficha <span aria-hidden="true">→</span>
          </FocusLink>
        ) : lead ? (
          <FocusLink focus={{ to: "lead", id: lead.id }}>
            Ver em Vendas <span aria-hidden="true">→</span>
          </FocusLink>
        ) : null}
      </div>
      <p className={ui.fine}>Quando o WhatsApp estiver conectado ao Pulse, esta conversa passa a acontecer aqui.</p>
    </section>
  );
}

/* ── A real clinic's conversations ─────────────────────────── */

const LIVE_FILTERS = ["todos", "aguardando", "follow_up", "leads", "pacientes", "resolvidas"] as const;
type LiveFilter = (typeof LIVE_FILTERS)[number];
const LIVE_FILTER_LABEL: Record<LiveFilter, string> = {
  todos: "Todos",
  aguardando: "Aguardando resposta",
  follow_up: "Follow-up",
  leads: "Leads",
  pacientes: "Pacientes",
  resolvidas: "Resolvidas",
};

/** "06/10 10:32", in the clinic's clock as stored. */
const stamp = (iso: string) => `${ddmm(iso)} ${iso.slice(11, 16)}`;

/** Someone brought here from another screen ("Iniciar contato") who has no conversation yet. */
interface PendingPerson {
  leadId?: ID;
  patientId?: ID;
  name: string;
  phone: string;
}

/**
 * Conversas for a real clinic: the history the team keeps with each person,
 * saved in the database. Each entry says who spoke (the person, the clinic,
 * or an internal note), how (WhatsApp, a call, in person), when, and who
 * registered it. The list shows the latest entry of each conversation; a
 * thread loads when it is opened, a page at a time. Nothing is sent or
 * received by the Pulse: messages go from the clinic's own WhatsApp, and
 * what happened is registered here.
 */
function LiveConversations() {
  const { data } = useFlow();
  const conversations = data.conversations.map((c) => withContact(data, c));
  const asked = useFocus("conversation");
  // The person "Iniciar contato" brought: their conversation if they have one, otherwise a new one on the first entry.
  const [initial] = useState(() => {
    if (!asked) return { id: null as ID | null, pending: null as PendingPerson | null };
    const lead = asked.leadId ? data.leads.find((l) => l.id === asked.leadId) : undefined;
    const patientId = asked.patientId ?? lead?.patientId;
    const found = conversations.find(
      (c) => (patientId && c.participant.patientId === patientId) || (asked.leadId && c.participant.leadId === asked.leadId),
    );
    return found
      ? { id: found.id, pending: null }
      : { id: null, pending: { leadId: asked.leadId, patientId, name: asked.name, phone: asked.phone ?? "" } };
  });
  const [openId, setOpenId] = useState<ID | null>(initial.id);
  const [pending, setPending] = useState<PendingPerson | null>(initial.pending);
  const [pane, setPane] = useState<Pane>(asked ? "chat" : "list");
  const [filter, setFilter] = useState<LiveFilter>("todos");
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const [booking, setBooking] = useState(false);
  const tick = useLiveMessages();

  const q = query.trim().toLowerCase();
  const list = conversations.filter((c) => {
    const { lead, patient } = personOf(data, c);
    if (q && !c.participant.name.toLowerCase().includes(q) && !c.participant.phone.includes(q)) return false;
    switch (filter) {
      case "aguardando":
        return c.status !== "resolvida" && c.lastMessage?.direction === "in";
      case "follow_up":
        return c.status === "follow_up" || Boolean(c.followUpAt);
      case "leads":
        return Boolean(lead) && !patient;
      case "pacientes":
        return Boolean(patient);
      case "resolvidas":
        return c.status === "resolvida";
      default:
        return true;
    }
  });
  const chosen = conversations.find((c) => c.id === openId);
  // A conversation just created shows once the refreshed list has it; until then, the person stays open.
  const selected = chosen ?? (pending ? null : (list[0] ?? null));
  const draft = asked?.draft;

  const open = (id: ID) => {
    setOpenId(id);
    setPending(null);
    setPane("chat");
  };

  const booked = selected?.participant ?? pending;

  return (
    <div className={styles.inbox} data-pane={pane}>
      <section className={styles.listCol} aria-label="Conversas">
        <header className={styles.listHead}>
          <h1 className={styles.heading}>Conversas</h1>
          <button type="button" className={ui.primary} onClick={() => setStarting(true)}>
            Nova conversa
          </button>
          <input
            className={styles.search}
            type="search"
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar conversa"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.filters} role="group" aria-label="Filtrar conversas">
            {LIVE_FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {LIVE_FILTER_LABEL[f]}
              </button>
            ))}
          </div>
        </header>
        {list.length ? (
          <ol className={styles.list}>
            {list.map((c) => {
              const { lead, patient } = personOf(data, c);
              const owner = data.users.find((u) => u.id === c.assignedUserId);
              const last = c.lastMessage;
              const flag =
                c.followUpAt && c.followUpAt < data.now && c.status !== "resolvida"
                  ? "Follow-up vencido"
                  : c.status !== "resolvida" && last?.direction === "in"
                    ? "Aguardando resposta"
                    : null;
              const who = last?.direction === "out" ? "Clínica: " : last?.direction === "note" ? "Nota: " : "";
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
                      <span className={styles.preview}>{last ? `${who}${last.text}` : "Sem registros ainda"}</span>
                      <span className={styles.itemMeta}>
                        <span>{lead && !patient ? STAGE_LABEL[lead.stage] : patient ? "Paciente" : ""}</span>
                        {owner ? <span>· {firstName(owner.name)}</span> : null}
                        {flag ? <span className={styles.flag}>{flag}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={`${ui.fine} ${styles.empty}`}>
            {conversations.length
              ? "Nenhuma conversa neste filtro."
              : "Nenhuma conversa ainda. Use Nova conversa para registrar o primeiro contato com alguém: o histórico fica salvo aqui."}
          </p>
        )}
      </section>

      {selected || pending ? (
        <LiveThread
          key={selected?.id ?? "nova"}
          conversation={selected ?? undefined}
          person={selected ? undefined : (pending ?? undefined)}
          draft={draft && (!selected || selected.id === initial.id) ? draft : undefined}
          onBack={() => setPane("list")}
          onInfo={() => setPane("info")}
          onBook={() => setBooking(true)}
          onCreated={(id) => setOpenId(id)}
          tick={tick}
        />
      ) : (
        <section className={styles.chatCol} aria-label="Conversa">
          <p className={`${ui.fine} ${styles.empty}`}>Escolha uma conversa ou comece uma nova.</p>
        </section>
      )}
      {selected ? <LivePerson conversation={selected} onBack={() => setPane("chat")} onBook={() => setBooking(true)} /> : null}

      <Sheet open={starting} onClose={() => setStarting(false)} title="Nova conversa" kicker="Conversas">
        {starting ? (
          <StartConversation
            onDone={(id) => {
              setStarting(false);
              open(id);
            }}
          />
        ) : null}
      </Sheet>
      {booked ? (
        <Sheet open={booking} onClose={() => setBooking(false)} title="Agendar" kicker={booked.name}>
          {booking ? (
            <BookingForm
              draft={booked.patientId ? { patientId: booked.patientId } : { leadId: booked.leadId }}
              onDone={() => setBooking(false)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * With WhatsApp connected, what arrives (a message, a delivery status) shows
 * without reloading: Supabase Realtime tells the screen something changed in
 * this clinic's history (row-level security decides who hears it), and the
 * screen reads it again from the server. Returns a counter that moves on each
 * change, for the open thread to reload.
 */
function useLiveMessages() {
  const { data } = useFlow();
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const listening = Boolean(data.whatsapp?.connection);
  const org = data.organization.id;
  useEffect(() => {
    if (!listening) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        router.refresh();
        setTick((t) => t + 1);
      }, 400);
    };
    const channel = supabase
      .channel(`conversas-${org}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_messages", filter: `organization_id=eq.${org}` }, changed)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [listening, org, router]);
  return tick;
}

/** "Enviar pelo WhatsApp" (the integration sends it), or registering what happened elsewhere. */
type Mode = MessageDirection | "send";

const WINDOW_NOTICE = "Para retomar esta conversa pelo WhatsApp é necessário usar uma mensagem aprovada.";

interface LiveThreadProps {
  tick: number;
  conversation?: Conversation;
  person?: PendingPerson;
  draft?: string;
  onBack: () => void;
  onInfo: () => void;
  onBook: () => void;
  onCreated: (id: ID) => void;
}

/** One conversation's history, oldest at the top, and the form that registers what happened next. */
function LiveThread({ conversation: c, person, draft, onBack, onInfo, onBook, onCreated, tick }: LiveThreadProps) {
  const { data, access, can } = useFlow();
  const [thread, setThread] = useState<Thread | null>(c ? null : { messages: [], more: false });
  const [older, setOlder] = useState(false);
  const whatsapp = data.whatsapp?.connection;
  const sending = Boolean(c) && whatsapp?.status === "connected";
  const [who, setWho] = useState<Mode>(sending ? "send" : draft ? "out" : "in");
  const [channel, setChannel] = useState<Channel>("whatsapp_manual");
  const [text, setText] = useState(draft ?? "");
  const [tool, setTool] = useState<"templates" | "followup" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const participant = c?.participant ?? { leadId: person?.leadId, patientId: person?.patientId, name: person?.name ?? "", phone: person?.phone ?? "" };
  // The conversation as the suggestions read it, before it exists too.
  const conv: Conversation = c ?? { id: "nova", organizationId: data.organization.id, participant, status: "aberta", unread: 0 };
  const procedure = procedureFor(data, conv)?.name;
  const number = waNumber(participant.phone);
  const messages = thread?.messages ?? [];
  const conversationId = c?.id;
  const latest = c?.lastMessage?.at;

  // The thread from the database: on opening, and again when the list's latest entry moved (someone else added to it).
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    loadThread(conversationId).then((t) => {
      if (alive) setThread(t);
    });
    return () => {
      alive = false;
    };
  }, [conversationId, latest, tick]);

  // Meta's window: free-form replies within 24 hours of the person's last WhatsApp message.
  const replyOpen = Boolean(thread?.replyUntil && thread.replyUntil > data.now);
  const put = (m: Message) =>
    setThread((t) => {
      const list = t?.messages ?? [];
      const at = list.findIndex((x) => x.id === m.id);
      const messages = at >= 0 ? list.map((x, i) => (i === at ? m : x)) : [...list, m];
      return { ...t, messages, more: t?.more ?? false };
    });

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const compose = (value: string) => {
    setText(value);
    setWho(sending ? "send" : "out");
    setChannel("whatsapp_manual");
    setTool(null);
    field.current?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || saving) return;
    if (!access.canEdit) return setError(READ_ONLY_MESSAGE);
    if (who === "send") {
      if (!c) return;
      setSaving(true);
      setError(null);
      const result = await sendWhatsApp(c.id, body);
      setSaving(false);
      if (result.message) {
        put(result.message);
        setText("");
      }
      if (result.error) setError(result.error);
      return;
    }
    const form = new FormData();
    form.set("direction", who);
    form.set("channel", channel);
    form.set("body", body);
    setSaving(true);
    setError(null);
    const result = await addEntry(c?.id ?? null, c ? null : { leadId: person?.leadId, patientId: person?.patientId }, form);
    setSaving(false);
    if (result.error) return setError(result.error);
    setText("");
    if (!c && result.conversationId) return onCreated(result.conversationId);
    const added = result.message;
    if (added) put(added);
  };

  const retry = async (m: Message) => {
    setError(null);
    const result = await retryWhatsApp(m.id);
    if (result.message) put(result.message);
    if (result.error) setError(result.error);
  };

  const loadOlder = async () => {
    if (!c || !messages.length) return;
    setOlder(true);
    const page = await loadThread(c.id, messages[0].at);
    setOlder(false);
    setThread((t) => ({ ...t, messages: [...page.messages, ...messages], more: page.more }));
  };

  const change = async (patch: Parameters<typeof updateConversation>[1], said: string) => {
    if (!c) return;
    if (!access.canEdit) return setError(READ_ONLY_MESSAGE);
    const result = await updateConversation(c.id, patch);
    if (result.error) setError(result.error);
    else setNotice(said);
  };

  const followUp = (days: number | string) => {
    const at =
      typeof days === "number" ? new Date(Date.parse(data.now) + days * 86_400_000).toISOString() : `${days}T09:00:00.000Z`;
    setTool(null);
    change({ followUpAt: at }, `Follow-up marcado para ${ddmm(at)}.`);
  };

  const rows = messages.map((m, i) => {
    const heading = dayHeading(data.now, m.at);
    return { m, heading: i === 0 || dayHeading(data.now, messages[i - 1].at) !== heading ? heading : null };
  });

  return (
    <section className={styles.chatCol} aria-label={`Conversa com ${participant.name}`}>
      <header className={styles.chatHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Voltar às conversas">
          ←
        </button>
        <span className={styles.avatar} aria-hidden="true">
          {initials(participant.name)}
        </span>
        <div className={styles.chatWho}>
          <strong>{participant.name}</strong>
          <span>{participant.phone}</span>
        </div>
        {c ? (
          <label className={styles.statusPick}>
            <span className="sr-only">Status da conversa</span>
            <select
              className={ui.input}
              value={c.status}
              disabled={!access.canEdit}
              onChange={(e) => change({ status: e.target.value }, "Status atualizado.")}
            >
              {CONVERSATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {c ? (
          <button type="button" className={styles.infoButton} onClick={onInfo}>
            Detalhes
          </button>
        ) : null}
      </header>

      <div className={styles.thread} aria-live="polite">
        {thread === null ? <p className={ui.fine}>Carregando o histórico…</p> : null}
        {thread?.more ? (
          <button type="button" className={styles.older} disabled={older} onClick={loadOlder}>
            {older ? "Carregando…" : "Ver registros anteriores"}
          </button>
        ) : null}
        {thread && !messages.length ? (
          <p className={ui.fine}>Nada registrado ainda. Registre abaixo o primeiro contato com {firstName(participant.name)}.</p>
        ) : null}
        {rows.map(({ m, heading }) => {
          const author = data.users.find((u) => u.id === m.authorId)?.name;
          const viaWhatsApp = m.channel === "whatsapp";
          const delivery = viaWhatsApp && m.direction === "out" && m.delivery && m.delivery !== "received" ? m.delivery : null;
          return (
            <div key={m.id} className={styles.row} data-dir={m.direction}>
              {heading ? <p className={styles.day}>{heading}</p> : null}
              <div className={styles.bubble} data-dir={m.direction}>
                {m.direction === "note" ? (
                  <span className={styles.noteLabel}>Nota interna · só a equipe vê</span>
                ) : (
                  <span className={styles.entryLabel}>
                    {m.direction === "in" ? "Cliente" : "Clínica"} · {CHANNEL_LABEL[m.channel ?? "manual"]}
                  </span>
                )}
                <p>{m.text}</p>
                <span className={styles.meta}>
                  {stamp(m.at)}
                  {viaWhatsApp
                    ? m.direction === "out"
                      ? author
                        ? ` · Enviado por ${author}`
                        : " · Pelo celular"
                      : ""
                    : author
                      ? ` · Registrado por ${author}`
                      : ""}
                  {delivery ? ` · ${DELIVERY_LABEL[delivery]}` : ""}
                </span>
                {delivery === "failed" ? (
                  <span className={styles.meta}>
                    Não foi possível enviar a mensagem.{" "}
                    {access.canEdit && sending ? (
                      <button type="button" className={ui.textAction} onClick={() => retry(m)}>
                        Tentar novamente
                      </button>
                    ) : null}
                  </span>
                ) : null}
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

      {access.canEdit ? (
        <form className={styles.composer} onSubmit={submit} data-note={who === "note" ? "" : undefined}>
          <div className={styles.composerRow}>
            <div className={styles.modes} role="group" aria-label="O que fazer">
              {sending ? (
                <button type="button" aria-pressed={who === "send"} onClick={() => setWho("send")}>
                  Enviar pelo WhatsApp
                </button>
              ) : null}
              <button type="button" aria-pressed={who === "in"} onClick={() => setWho("in")}>
                Cliente disse
              </button>
              <button type="button" aria-pressed={who === "out"} onClick={() => setWho("out")}>
                Clínica disse
              </button>
              <button type="button" aria-pressed={who === "note"} onClick={() => setWho("note")}>
                Nota interna
              </button>
            </div>
            {who === "note" || who === "send" ? null : (
              <label>
                <span className="sr-only">Canal</span>
                <select className={ui.input} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                  {MANUAL_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABEL[ch]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <textarea
            ref={field}
            className={styles.field}
            rows={2}
            maxLength={4000}
            aria-label={who === "send" ? "Mensagem" : "O que aconteceu"}
            placeholder={
              who === "send"
                ? `Mensagem para ${firstName(participant.name)} pelo WhatsApp…`
                : who === "note"
                ? "Nota para a equipe (a pessoa não vê)…"
                : who === "in"
                  ? "O que a pessoa disse ou pediu…"
                  : "O que a clínica disse ou enviou…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className={styles.tools}>
            <button type="button" aria-expanded={tool === "templates"} onClick={() => setTool(tool === "templates" ? null : "templates")}>
              Respostas rápidas
            </button>
            <button type="button" onClick={() => compose(suggestReply(data, conv, messages))}>
              Sugerir resposta
            </button>
            {who === "out" && !sending && number && text.trim() && access.canReachOut ? (
              <a href={whatsappHref(number, text.trim())} target="_blank" rel="noopener noreferrer">
                Abrir no WhatsApp
              </a>
            ) : null}
            {can.book ? (
              <button type="button" onClick={onBook}>
                Agendar
              </button>
            ) : null}
            {c ? (
              <button type="button" aria-expanded={tool === "followup"} onClick={() => setTool(tool === "followup" ? null : "followup")}>
                Follow-up
              </button>
            ) : null}
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!text.trim() || saving || (who === "send" && !replyOpen)}
            >
              {who === "send" ? (saving ? "Enviando…" : "Enviar") : saving ? "Salvando…" : who === "note" ? "Salvar nota" : "Registrar"}
            </button>
          </div>
          {tool === "templates" ? (
            <ul className={styles.menu}>
              {TEMPLATES.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => compose(fillTemplate(t.text, { name: participant.name, procedure }))}>
                    <strong>{t.name}</strong>
                    <span>{fillTemplate(t.text, { name: participant.name, procedure })}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {tool === "followup" ? <FollowUpPicker now={data.now} onPick={followUp} /> : null}
          {who === "send" && thread && !replyOpen && !error ? <p className={ui.fine}>{WINDOW_NOTICE}</p> : null}
          <FormError error={error} />
          <p className={ui.fine}>
            {sending
              ? "Enviar pelo WhatsApp entrega a mensagem pelo WhatsApp da clínica. Registrar só anota o que aconteceu fora do Pulse."
              : whatsapp?.status === "error"
                ? "O WhatsApp da clínica precisa ser reconectado em Configurações. Enquanto isso, registre aqui o que aconteceu."
                : whatsapp
                  ? "As mensagens recebidas pelo WhatsApp da clínica aparecem aqui. Registre também o que aconteceu fora dele."
                  : "O Pulse ainda não envia nem recebe pelo WhatsApp: as mensagens saem do WhatsApp da clínica, e aqui fica registrado o que aconteceu."}
          </p>
        </form>
      ) : (
        <p className={`${ui.fine} ${styles.empty}`}>{READ_ONLY_MESSAGE}</p>
      )}
    </section>
  );
}

/** Who the conversation is with, as the rest of the Pulse knows them, and what to do next. */
function LivePerson({ conversation: c, onBack, onBook }: { conversation: Conversation; onBack: () => void; onBook: () => void }) {
  const { data, access, can } = useFlow();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { lead, patient } = personOf(data, c);
  const procedure = procedureFor(data, c);
  const next = patient ? upcomingFor(data, patient.id)[0] : undefined;
  // Who answers conversations: the front office, active.
  const team = data.users.filter((u) => (u.status ?? "active") === "active" && u.role !== "professional");

  const change = async (patch: Parameters<typeof updateConversation>[1], said: string) => {
    if (!access.canEdit) return setError(READ_ONLY_MESSAGE);
    const result = await updateConversation(c.id, patch);
    setError(result.error ?? null);
    if (!result.error) setNotice(said);
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
        {lead && !patient ? (
          <div>
            <dt>Etapa em Vendas</dt>
            <dd>{STAGE_LABEL[lead.stage]}</dd>
          </div>
        ) : null}
        <div>
          <dt>{lead && !patient ? "Procedimento de interesse" : "Último procedimento"}</dt>
          <dd>{procedure?.name ?? "—"}</dd>
        </div>
        {patient ? (
          <div>
            <dt>Última visita</dt>
            <dd>{patient.lastVisitAt ? relDay(data.now, patient.lastVisitAt) : "Ainda não veio"}</dd>
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
        {lead && !patient && lead.potentialValue ? (
          <div>
            <dt>Valor potencial</dt>
            <dd>{brl(lead.potentialValue)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Responsável</dt>
          <dd>
            <select
              className={ui.input}
              value={c.assignedUserId ?? ""}
              disabled={!access.canEdit}
              onChange={(e) => change({ assignedUserId: e.target.value || null }, "Responsável atualizado.")}
            >
              <option value="">Ninguém</option>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </dd>
        </div>
        {c.followUpAt ? (
          <div>
            <dt>Follow-up</dt>
            <dd className={c.followUpAt < data.now ? styles.overdue : undefined}>{ddmm(c.followUpAt)}</dd>
          </div>
        ) : null}
      </dl>

      {notice ? (
        <p className={styles.saved} role="status">
          {notice}
        </p>
      ) : null}
      <FormError error={error} />

      <div className={styles.infoActions}>
        {can.book ? (
          <button type="button" className={ui.primary} onClick={onBook}>
            Agendar
          </button>
        ) : null}
        {c.status !== "resolvida" && access.canEdit ? (
          <button type="button" className={ui.secondary} onClick={() => change({ status: "resolvida" }, "Conversa resolvida.")}>
            Marcar como resolvida
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
      </div>
    </aside>
  );
}

/**
 * Starts a conversation: with someone already in the Pulse, or someone new.
 * A new person with a phone already registered is recognized, so nobody is
 * registered twice; otherwise they enter Vendas as a new contact.
 */
function StartConversation({ onDone }: { onDone: (id: ID) => void }) {
  const { data, access } = useFlow();
  const [person, setPerson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withConversation = new Set(data.conversations.flatMap((c) => [c.participant.patientId, c.participant.leadId]).filter(Boolean));
  const patients = [...data.patients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const leads = data.leads.filter((l) => !l.patientId).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!access.canEdit) return setError(READ_ONLY_MESSAGE);
    setSaving(true);
    setError(null);
    const result = await startConversation(new FormData(event.currentTarget));
    setSaving(false);
    if (result.error || !result.conversationId) return setError(result.error ?? "Não foi possível abrir a conversa.");
    onDone(result.conversationId);
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <Field label="Com quem">
        <select className={ui.input} name="person" required value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="" disabled>
            Escolha a pessoa
          </option>
          <option value="novo">+ Pessoa nova</option>
          {patients.length ? (
            <optgroup label="Pacientes">
              {patients.map((p) => (
                <option key={p.id} value={`patient:${p.id}`}>
                  {p.name}
                  {withConversation.has(p.id) ? " · já tem conversa" : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
          {leads.length ? (
            <optgroup label="Contatos em Vendas">
              {leads.map((l) => (
                <option key={l.id} value={`lead:${l.id}`}>
                  {l.name}
                  {withConversation.has(l.id) ? " · já tem conversa" : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </Field>
      {person === "novo" ? (
        <>
          <Field label="Nome">
            <input className={ui.input} name="name" required maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Telefone">
            <input className={ui.input} name="phone" type="tel" maxLength={40} />
          </Field>
          <Field label="Como conheceu a clínica">
            <select className={ui.input} name="source" defaultValue="whatsapp">
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABEL[source]}
                </option>
              ))}
            </select>
          </Field>
          <p className={ui.fine}>
            Se o telefone já estiver no Pulse, a conversa abre com essa pessoa: ninguém é cadastrado duas vezes. Quem é novo
            entra em Vendas como contato.
          </p>
        </>
      ) : null}
      <FormError error={error} />
      <div className={ui.actions}>
        <button type="submit" className={ui.primary} disabled={saving || !person}>
          {saving ? "Abrindo…" : "Abrir conversa"}
        </button>
      </div>
    </form>
  );
}
