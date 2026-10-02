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
export type Focus =
  | { to: "opportunity"; kind: OpportunityKind }
  | { to: "patient"; id: ID }
  | { to: "patients"; filter: "retorno" | "faltou" }
  | { to: "sales"; filter: "novo" | "sem_resposta" }
  | { to: "lead"; id: ID }
  | { to: "agenda"; day: number };

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
  | {
      type: "addLead";
      lead: { name: string; phone: string; source: LeadSource; procedureId: ID; potentialValue: number; stage: LeadStage; nextAction: string; patientId?: ID };
    }
  | { type: "book"; booking: Booking }
  | { type: "appointment"; id: ID; status: AppointmentStatus }
  | {
      type: "stockIn";
      productId?: ID;
      product?: { name: string; unit: string; unitCost: number };
      lot: { lotCode: string; quantity: number; expiresAt: string };
    }
  | { type: "adjustLot"; id: ID; quantity: number; reason: keyof typeof ADJUST_REASONS }
  | { type: "note"; text: string }
  | { type: "status"; kind: OpportunityKind; status: OpportunityStatus; text?: string }
  | { type: "toggleRule"; id: ID }
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
        return { startsAt: a.startsAt, price: procedure?.price ?? 0, returnDays: procedure?.returnDays ?? 0 };
      }),
  );
}

const DONE_TEXT: Partial<Record<AppointmentStatus, (name: string, procedure: string) => string>> = {
  confirmado: (name) => `${name} confirmou presença.`,
  concluido: (name, procedure) => `${name}: ${procedure} finalizado. Estoque e próximo retorno atualizados.`,
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
      // Finishing a visit takes its products from the stock; undoing it gives them back.
      const uses = data.procedureProducts.filter((pp) => pp.procedureId === before.procedureId);
      let lots = data.lots;
      if (action.status === "concluido") lots = moveStock(lots, drawDown(lots, uses, data.now), -1);
      else if (before.status === "concluido") lots = moveStock(lots, restock(lots, uses, data.now), 1);
      const appointments = data.appointments.map((a) => (a.id === action.id ? { ...a, status: action.status } : a));
      const patients = data.patients.map((p) =>
        p.id === before.patientId ? { ...p, ...summary(data, appointments, p.id) } : p,
      );
      const next = { ...state, data: { ...data, appointments, patients, lots } };
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
    case "note":
      return log(state, action.text);
    case "status": {
      const next = { ...state, statuses: { ...state.statuses, [action.kind]: action.status } };
      return action.text ? log(next, action.text) : next;
    }
    case "toggleRule": {
      const automationRules = data.automationRules.map((r) => (r.id === action.id ? { ...r, active: !r.active } : r));
      return { ...state, data: { ...data, automationRules } };
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
  /** What this clinic may do now: demo, trial, read-only (lib/flow/access.ts). */
  access: Access;
  /** Records can be created, edited and deleted in the database: a real clinic that isn't read-only. */
  editable: boolean;
}

const Context = createContext<FlowContext | null>(null);

interface ProviderProps {
  initial: FlowData;
  base?: string;
  access: Access;
  children: ReactNode;
}

export function FlowProvider({ initial, base = BASE, access, children }: ProviderProps) {
  const [state, send] = useReducer(reducer, { data: initial, statuses: {}, focus: null, seq: 0 });
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
  const value = useMemo(
    () => ({
      data,
      ops: opportunities(data, state.statuses),
      focus: state.focus,
      dispatch,
      base,
      live,
      access,
      editable: live && canEdit,
    }),
    [data, state.statuses, state.focus, dispatch, base, live, access, canEdit],
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
