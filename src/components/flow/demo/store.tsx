"use client";

import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

import { opportunities } from "@/lib/flow/insights";
import type { FlowData, ID, LeadStage, Opportunity, OpportunityKind, OpportunityStatus } from "@/lib/flow/types";
import { BASE } from "./copy";

/*
  The demo's state: the clinic's data plus what the visitor did to it (a lead
  moved, a slot cancelled, an opportunity prepared). It lives in memory only;
  a reload starts the demo over. In the real Flow (`live`) the data is the
  server's: screens write through Server Actions, the route refreshes and the
  new data arrives as `initial`. The shape of the screens stays the same.
*/

interface State {
  data: FlowData;
  statuses: Partial<Record<OpportunityKind, OpportunityStatus>>;
  /** An opportunity another screen asked to open. */
  focus: OpportunityKind | null;
  seq: number;
}

type Action =
  | { type: "moveLead"; id: ID; stage: LeadStage }
  | { type: "contactLead"; id: ID }
  | { type: "cancel"; id: ID }
  | { type: "note"; text: string }
  | { type: "status"; kind: OpportunityKind; status: OpportunityStatus; text?: string }
  | { type: "toggleRule"; id: ID }
  | { type: "focus"; kind: OpportunityKind | null };

function log(state: State, text: string): State {
  const seq = state.seq + 1;
  const entry = { id: `act_demo_${seq}`, organizationId: state.data.organization.id, at: state.data.now, text };
  return { ...state, seq, data: { ...state.data, activities: [entry, ...state.data.activities] } };
}

function reducer(state: State, action: Action): State {
  const { data } = state;
  switch (action.type) {
    case "moveLead":
    case "contactLead": {
      const leads = data.leads.map((l) => {
        if (l.id !== action.id) return l;
        // Any contact answers the silence; a lead moved into "Orçamento" has just had its quote sent.
        const stage = action.type === "moveLead" ? action.stage : l.stage;
        return { ...l, stage, lastContactAt: data.now, quoteSentAt: stage === "orcamento" ? data.now : undefined };
      });
      const lead = data.leads.find((l) => l.id === action.id);
      return log(
        { ...state, data: { ...data, leads } },
        action.type === "moveLead" ? `${lead?.name} avançou no funil.` : `Contato registrado com ${lead?.name}.`,
      );
    }
    case "cancel": {
      const appointments = data.appointments.map((a) => (a.id === action.id ? { ...a, status: "cancelado" as const } : a));
      return log({ ...state, data: { ...data, appointments } }, "Um cancelamento abriu um horário amanhã.");
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
      return { ...state, focus: action.kind };
  }
}

interface FlowContext {
  data: FlowData;
  ops: Opportunity[];
  focus: OpportunityKind | null;
  dispatch: Dispatch<Action>;
  /** Where the screens live: the demo's or the real Flow's address. */
  base: string;
  /** A real clinic: records can be created, edited and deleted. */
  live: boolean;
}

const Context = createContext<FlowContext | null>(null);

interface ProviderProps {
  initial: FlowData;
  base?: string;
  live?: boolean;
  children: ReactNode;
}

export function FlowProvider({ initial, base = BASE, live = false, children }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, { data: initial, statuses: {}, focus: null, seq: 0 });
  const data = live ? initial : state.data;
  const value = useMemo(
    () => ({ data, ops: opportunities(data, state.statuses), focus: state.focus, dispatch, base, live }),
    [data, state.statuses, state.focus, base, live],
  );
  return <Context value={value}>{children}</Context>;
}

export function useFlow() {
  const value = useContext(Context);
  if (!value) throw new Error("useFlow outside FlowProvider");
  return value;
}
