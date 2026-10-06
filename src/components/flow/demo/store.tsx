"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";

import type { Access } from "@/lib/flow/access";
import { permissionsFor, type Permissions } from "@/lib/flow/roles";
import { dayAt } from "@/lib/flow/format";
import { drawDown, moveStock, opportunities, procedureOf, restock, visitSummary } from "@/lib/flow/insights";
import type {
  Appointment,
  AppointmentStatus,
  FlowData,
  ID,
  LeadSource,
  LeadStage,
  Opportunity,
  OpportunityKind,
  OpportunityStatus,
} from "@/lib/flow/types";
import { ADJUST_REASONS, BASE } from "./copy";

/*
  The demo's state: the clinic's data plus what the visitor did to it (a
  contact moved, a patient booked, a visit finished, stock received). It
  lives in memory only; a reload starts the demo over. In the real Pulse
  (`live`) the data is the server's: screens write through Server Actions,
  the route refreshes and the new data arrives as `initial`. The shape of the
  screens stays the same.
*/

/** What one screen asks the next to open with: a record, a filter, a day. */
export type PatientFilter = "retorno" | "faltou" | "sem_horario" | "alto_valor" | "semana" | "todos";

export type Focus =
  | { to: "opportunity"; kind: OpportunityKind }
  | { to: "patient"; id: ID }
  | { to: "patients"; filter: PatientFilter }
  | { to: "sales"; filter: "novo" | "sem_resposta" | "parados" }
  | { to: "lead"; id: ID }
  | { to: "agenda"; day: number }
  /** A conversation to open (in the demo) or to start once WhatsApp is connected, with its first message ready. */
  | { to: "conversation"; id?: ID; name: string; draft: string; phone?: string; leadId?: ID; patientId?: ID };

/** A booking, as the booking form sends it. */
export interface Booking {
  procedureId: ID;
  startsAt: string;
  professionalId?: ID;
  /** A contact from Vendas: booking makes them a patient. */
  leadId?: ID;
  patientId?: ID;
  /** Someone new: a patient, and the contact that records how they arrived. */
  person?: { name: string; phone: string; source: LeadSource };
  waitlistId?: ID;
  /** The booking this one reschedules. */
  replaces?: ID;
  /** A deposit asked with the booking. */
  deposit?: { cents: number; due?: string; percent?: number };
}

interface State {
  data: FlowData;
  statuses: Partial<Record<OpportunityKind, OpportunityStatus>>;
  focus: Focus | null;
  seq: number;
}

type Action =
  | { type: "moveLead"; id: ID; stage: LeadStage }
  | { type: "contactLead"; id: ID }
  | { type: "updateLead"; id: ID; changes: { procedureId?: ID; potentialValue?: number; nextAction?: string } }
  | {
      type: "addLead";
      lead: { name: string; phone: string; source: LeadSource; procedureId: ID; potentialValue: number; stage: LeadStage; nextAction: string; patientId?: ID };
    }
  | { type: "book"; booking: Booking }
  | {
      type: "appointment";
      id: ID;
      status: AppointmentStatus;
      /** When finishing: what was charged and the products used, if they differ from the procedure's. */
      charged?: number;
      supplies?: { productId: ID; quantity: number }[];
    }
  | {
      type: "stockIn";
      productId?: ID;
      product?: { name: string; unit: string; unitCost: number; brand?: string; category?: string; supplier?: string };
      lot: { lotCode: string; quantity: number; expiresAt: string };
    }
  | { type: "adjustLot"; id: ID; quantity: number; reason: keyof typeof ADJUST_REASONS }
  | { type: "deposit"; id: ID; deposit: { cents: number; due?: string; percent?: number } | null }
  | { type: "depositPaid"; id: ID; paid: boolean }
  | { type: "record"; record: { id?: ID; patientId: ID; recordedAt: string; chiefComplaint: string; notes: string } }
  | { type: "note"; text: string }
  | { type: "status"; kind: OpportunityKind; status: OpportunityStatus; text?: string }
  | { type: "focus"; focus: Focus | null };

function log(state: State, text: string): State {
  const seq = state.seq + 1;
  const entry = { id: `act_demo_${seq}`, organizationId: state.data.organization.id, at: state.data.now, text };
  return { ...state, seq, data: { ...state.data, activities: [entry, ...state.data.activities] } };
}

/** A patient's visits, spend and next return, from their completed appointments. */
function summary(data: FlowData, appointments: Appointment[], patientId: ID) {
  return visitSummary(
    appointments
      .filter((a) => a.patientId === patientId && a.status === "concluido")
      .map((a) => {
        const procedure = procedureOf(data, a.procedureId);
        return { startsAt: a.startsAt, price: a.priceCharged ?? procedure?.price ?? 0, returnDays: procedure?.returnDays ?? 0 };
      }),
  );
}

const DONE_TEXT: Partial<Record<AppointmentStatus, (name: string, procedure: string) => string>> = {
  confirmado: (name) => `${name} confirmou presença.`,
  concluido: (name, procedure) => `${name}: ${procedure} finalizado. Estoque baixado e próximo retorno calculado.`,
  faltou: (name, procedure) => `${name} faltou ao atendimento de ${procedure}.`,
  cancelado: () => "Um cancelamento abriu um horário na agenda.",
};

function reducer(state: State, action: Action): State {
  const { data } = state;
  const org = data.organization.id;
  switch (action.type) {
    case "moveLead":
    case "contactLead": {
      const leads = data.leads.map((l) => {
        if (l.id !== action.id) return l;
        // Any contact answers the silence; a contact moved into "Orçamento" has just had their quote sent.
        const stage = action.type === "moveLead" ? action.stage : l.stage;
        const nextAction = action.type === "moveLead" ? "" : l.nextAction;
        return { ...l, stage, nextAction, lastContactAt: data.now, quoteSentAt: stage === "orcamento" ? data.now : undefined };
      });
      const lead = data.leads.find((l) => l.id === action.id);
      return log(
        { ...state, data: { ...data, leads } },
        action.type === "moveLead" ? `${lead?.name} passou para a etapa seguinte em Vendas.` : `Contato registrado com ${lead?.name}.`,
      );
    }
    case "updateLead": {
      const lead = data.leads.find((l) => l.id === action.id);
      if (!lead) return state;
      const leads = data.leads.map((l) => (l.id === action.id ? { ...l, ...action.changes } : l));
      return log({ ...state, data: { ...data, leads } }, `${lead.name}: dados atualizados pela conversa.`);
    }
    case "addLead": {
      const seq = state.seq + 1;
      const { lead } = action;
      const added = {
        id: `lead_demo_${seq}`,
        organizationId: org,
        ...lead,
        createdAt: data.now,
        lastContactAt: data.now,
        quoteSentAt: lead.stage === "orcamento" ? data.now : undefined,
      };
      return log({ ...state, seq, data: { ...data, leads: [added, ...data.leads] } }, `${lead.name} entrou em Vendas.`);
    }
    case "book": {
      const seq = state.seq + 1;
      const b = action.booking;
      const procedure = procedureOf(data, b.procedureId);
      if (!procedure) return state;
      let { leads, patients } = data;
      let patientId = b.patientId;
      let name = patients.find((p) => p.id === patientId)?.name ?? "";
      let becomes = false;
      const newPatient = (person: { name: string; phone: string }) => {
        const id = `pat_demo_${seq}`;
        patients = [...patients, { id, organizationId: org, name: person.name, phone: person.phone, totalSpent: 0, notes: "" }];
        becomes = true;
        return id;
      };
      if (b.leadId) {
        const lead = leads.find((l) => l.id === b.leadId);
        if (!lead) return state;
        name = lead.name;
        patientId = lead.patientId ?? newPatient(lead);
        leads = leads.map((l) =>
          l.id === b.leadId
            ? { ...l, patientId, stage: "agendado" as const, lastContactAt: data.now, quoteSentAt: undefined, nextAction: "" }
            : l,
        );
      } else if (!patientId && b.person) {
        name = b.person.name;
        patientId = newPatient(b.person);
        leads = [
          {
            id: `lead_demo_${seq}`,
            organizationId: org,
            name: b.person.name,
            phone: b.person.phone,
            source: b.person.source,
            procedureId: b.procedureId,
            potentialValue: procedure.price,
            stage: "agendado",
            createdAt: data.now,
            lastContactAt: data.now,
            nextAction: "",
            patientId,
          },
          ...leads,
        ];
      }
      if (!patientId) return state;
      const appointments: Appointment[] = [
        ...data.appointments.map((a) =>
          a.id === b.replaces && (a.status === "agendado" || a.status === "confirmado") ? { ...a, status: "cancelado" as const } : a,
        ),
        {
          id: `apt_demo_${seq}`,
          organizationId: org,
          patientId,
          procedureId: b.procedureId,
          professionalId: b.professionalId,
          startsAt: b.startsAt,
          durationMin: procedure.durationMin,
          status: "agendado",
          deposit: b.deposit ? { ...b.deposit, provider: "manual" as const } : undefined,
        },
      ];
      const waitlist = data.waitlist.filter((w) => w.id !== b.waitlistId);
      return log(
        { ...state, seq, data: { ...data, leads, patients, appointments, waitlist } },
        `${name} agendou ${procedure.name} para ${dayAt(data.now, b.startsAt)}${becomes ? " e agora é paciente" : ""}.`,
      );
    }
    case "appointment": {
      const before = data.appointments.find((a) => a.id === action.id);
      if (!before || before.status === action.status) return state;
      // Finishing a visit takes its products from the stock and freezes its money; undoing it gives both back.
      const uses = action.supplies ?? data.procedureProducts.filter((pp) => pp.procedureId === before.procedureId);
      let lots = data.lots;
      let financials = data.financials.filter((f) => f.appointmentId !== before.id);
      const price = procedureOf(data, before.procedureId)?.price ?? 0;
      const charged = action.status === "concluido" ? (action.charged ?? price) : undefined;
      if (action.status === "concluido") {
        lots = moveStock(lots, drawDown(lots, uses, data.now), -1);
        const cost = Math.round(uses.reduce((s, u) => s + u.quantity * (data.products.find((p) => p.id === u.productId)?.unitCost ?? 0), 0));
        financials = [
          ...financials,
          {
            appointmentId: before.id,
            completedAt: data.now,
            listPrice: price,
            discount: Math.max(0, price - charged!),
            priceCharged: charged!,
            totalCost: cost,
            grossProfit: charged! - cost,
            grossMargin: charged! > 0 ? Math.round(((charged! - cost) / charged!) * 10000) / 100 : undefined,
          },
        ];
      } else if (before.status === "concluido") {
        lots = moveStock(lots, restock(lots, data.procedureProducts.filter((pp) => pp.procedureId === before.procedureId), data.now), 1);
      }
      const appointments = data.appointments.map((a) =>
        a.id === action.id
          ? { ...a, status: action.status, priceCharged: charged, discount: charged === undefined ? undefined : Math.max(0, price - charged) }
          : a,
      );
      const patients = data.patients.map((p) =>
        p.id === before.patientId ? { ...p, ...summary(data, appointments, p.id) } : p,
      );
      const next = { ...state, data: { ...data, appointments, patients, lots, financials } };
      const say = DONE_TEXT[action.status];
      const name = data.patients.find((p) => p.id === before.patientId)?.name ?? "Paciente";
      return say ? log(next, say(name, procedureOf(data, before.procedureId)?.name ?? "procedimento")) : next;
    }
    case "stockIn": {
      const seq = state.seq + 1;
      let products = data.products;
      let productId = action.productId;
      if (!productId && action.product) {
        productId = `prod_demo_${seq}`;
        products = [...products, { id: productId, organizationId: org, ...action.product }];
      }
      const product = products.find((p) => p.id === productId);
      if (!product) return state;
      const lots = [...data.lots, { id: `lot_demo_${seq}`, organizationId: org, productId: product.id, ...action.lot }];
      return log(
        { ...state, seq, data: { ...data, products, lots } },
        `Entrada no estoque: ${product.name}, lote ${action.lot.lotCode}.`,
      );
    }
    case "adjustLot": {
      const lot = data.lots.find((l) => l.id === action.id);
      if (!lot) return state;
      const lots = data.lots.map((l) => (l.id === action.id ? { ...l, quantity: action.quantity } : l));
      const product = data.products.find((p) => p.id === lot.productId);
      return log(
        { ...state, data: { ...data, lots } },
        `Estoque ajustado (${ADJUST_REASONS[action.reason]}): ${product?.name ?? "produto"}, lote ${lot.lotCode}.`,
      );
    }
    case "deposit":
    case "depositPaid": {
      const appointments = data.appointments.map((a) => {
        if (a.id !== action.id) return a;
        if (action.type === "deposit") return { ...a, deposit: action.deposit ? { ...action.deposit, provider: "manual" as const } : undefined };
        return a.deposit ? { ...a, deposit: { ...a.deposit, paidAt: action.paid ? data.now : undefined } } : a;
      });
      return { ...state, data: { ...data, appointments } };
    }
    case "record": {
      const { record } = action;
      if (record.id) {
        const records = data.records.map((r) => (r.id === record.id ? { ...r, ...record, id: r.id } : r));
        return { ...state, data: { ...data, records } };
      }
      const seq = state.seq + 1;
      const added = { ...record, id: `rec_demo_${seq}`, organizationId: org };
      return { ...state, seq, data: { ...data, records: [added, ...data.records] } };
    }
    case "note":
      return log(state, action.text);
    case "status": {
      const next = { ...state, statuses: { ...state.statuses, [action.kind]: action.status } };
      return action.text ? log(next, action.text) : next;
    }
    case "focus":
      return { ...state, focus: action.focus };
  }
}

interface FlowContext {
  data: FlowData;
  ops: Opportunity[];
  focus: Focus | null;
  dispatch: Dispatch<Action>;
  /** Where the screens live: the demo's or the real Pulse's address. */
  base: string;
  /** A real clinic's data (not the demo's): records live in the database. */
  live: boolean;
  /** What this clinic may do now: demo, subscription, read-only (lib/flow/access.ts). */
  access: Access;
  /** The signed-in person, in the real Pulse. */
  account?: Account;
  /** Records can be created, edited and deleted in the database: a real clinic that isn't read-only. */
  editable: boolean;
  /**
   * What the signed-in person's role allows (lib/flow/roles.ts): the screens
   * show only what they can use. The demo's visitor sees everything. The
   * server and the database check it again.
   */
  can: Permissions;
  /** The signed-in member's id, in the real Pulse. */
  me?: ID;
  /** "Pergunte ao Pulse" from any screen: open it, with a question already asked if one is given. */
  ask: (question?: string) => void;
  /** Whether it is open, and the question it was opened with: each new question starts a new conversation (`session`). */
  asking: { open: boolean; question: string; session: number };
  closeAsk: () => void;
}

const Context = createContext<FlowContext | null>(null);

/** The signed-in person: their id, name at the clinic, e-mail and role. */
export interface Account {
  id?: ID;
  name: string;
  email: string;
  role: string;
}

interface ProviderProps {
  initial: FlowData;
  base?: string;
  access: Access;
  account?: Account;
  children: ReactNode;
}

export function FlowProvider({ initial, base = BASE, access, account, children }: ProviderProps) {
  const [state, send] = useReducer(reducer, { data: initial, statuses: {}, focus: null, seq: 0 });
  const [asking, setAsking] = useState({ open: false, question: "", session: 0 });
  const ask = useCallback(
    (question?: string) =>
      setAsking((s) => (question ? { open: true, question, session: s.session + 1 } : { ...s, open: true })),
    [],
  );
  const closeAsk = useCallback(() => setAsking((s) => ({ ...s, open: false })), []);
  const live = !access.isDemoMode;
  const data = live ? initial : state.data;
  // Read-only changes nothing, not even in memory: only moving between screens passes.
  const { canEdit } = access;
  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      if (canEdit || action.type === "focus") send(action);
    },
    [canEdit],
  );
  const can = useMemo(() => permissionsFor(live ? account?.role : "demo"), [live, account?.role]);
  const value = useMemo(
    () => ({
      data,
      ops: opportunities(data, state.statuses),
      focus: state.focus,
      dispatch,
      base,
      live,
      access,
      account,
      editable: live && canEdit,
      can,
      me: account?.id,
      ask,
      asking,
      closeAsk,
    }),
    [data, state.statuses, state.focus, dispatch, base, live, access, account, canEdit, can, ask, asking, closeAsk],
  );
  return <Context value={value}>{children}</Context>;
}

export function useFlow() {
  const value = useContext(Context);
  if (!value) throw new Error("useFlow outside FlowProvider");
  return value;
}

/** The focus another screen left for this one, read once on arrival, then spent. */
export function useFocus<T extends Focus["to"]>(to: T): Extract<Focus, { to: T }> | null {
  const { focus, dispatch } = useFlow();
  const [taken] = useState(() => (focus?.to === to ? (focus as Extract<Focus, { to: T }>) : null));
  useEffect(() => {
    if (focus?.to === to) dispatch({ type: "focus", focus: null });
  }, [focus, to, dispatch]);
  return taken;
}
