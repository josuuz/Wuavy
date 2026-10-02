/*
  Wuavy Pulse's domain. Each entity mirrors a table (supabase/migrations/
  0001_flow.sql): camelCase here, snake_case there, and every row carries its
  organization, so one clinic never reads another's data. Money is in cents,
  times are ISO strings in the clinic's wall clock (see clock.ts).
*/

export type ID = string;

export interface Organization {
  id: ID;
  name: string;
  segment: "estetica";
  city: string;
}

export interface User {
  id: ID;
  organizationId: ID;
  name: string;
  role: "owner" | "reception" | "professional";
}

/** The sales funnel, first contact to booked. Once booked, the person is a patient. */
export const LEAD_STAGES = ["novo", "contato", "avaliacao", "orcamento", "agendado"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_SOURCES = ["instagram", "google", "indicacao", "whatsapp", "site"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead {
  id: ID;
  organizationId: ID;
  name: string;
  phone: string;
  source: LeadSource;
  procedureId: ID;
  potentialValue: number;
  stage: LeadStage;
  createdAt: string;
  lastContactAt: string;
  /** Set when a quote was sent and not answered yet. */
  quoteSentAt?: string;
  nextAction: string;
  /** The patient this person became when they booked: the same person, never registered twice. */
  patientId?: ID;
}

export interface Patient {
  id: ID;
  organizationId: ID;
  name: string;
  phone: string;
  /** Empty until the first procedure is done. */
  firstVisitAt?: string;
  lastVisitAt?: string;
  nextReturnAt?: string;
  totalSpent: number;
  /** Commercial and operational notes only: never clinical records. */
  notes: string;
}

/** "agendado" is waiting for confirmation; "concluido" is done; "faltou" is a no-show. */
export const APPOINTMENT_STATUSES = ["agendado", "confirmado", "concluido", "faltou", "cancelado"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment {
  id: ID;
  organizationId: ID;
  patientId: ID;
  procedureId: ID;
  professionalId?: ID;
  startsAt: string;
  durationMin: number;
  status: AppointmentStatus;
}

export interface WaitlistEntry {
  id: ID;
  organizationId: ID;
  patientId: ID;
  procedureId: ID;
  period: "manha" | "tarde";
  createdAt: string;
}

export const PROCEDURE_CATEGORIES = ["facial", "injetaveis", "corporal"] as const;

export interface Procedure {
  id: ID;
  organizationId: ID;
  name: string;
  category: (typeof PROCEDURE_CATEGORIES)[number];
  price: number;
  durationMin: number;
  /** Typical interval before the next session. */
  returnDays: number;
}

export interface Product {
  id: ID;
  organizationId: ID;
  name: string;
  unit: string;
  unitCost: number;
}

export interface InventoryLot {
  id: ID;
  organizationId: ID;
  productId: ID;
  lotCode: string;
  quantity: number;
  expiresAt: string;
}

export interface ProcedureProduct {
  organizationId: ID;
  procedureId: ID;
  productId: ID;
  /** Approximate amount used per session, in the product's unit. */
  quantity: number;
}

export type OpportunityKind = "lead_followup" | "patient_return" | "stock_expiry" | "open_slot";
export type OpportunityStatus = "nova" | "em_andamento" | "resolvida";

/** What the Pulse found. Derived from the data today; stored and tracked once it is real. */
export interface Opportunity {
  id: ID;
  organizationId: ID;
  kind: OpportunityKind;
  count: number;
  value: number;
  refs: ID[];
  status: OpportunityStatus;
}

export interface AutomationRule {
  id: ID;
  organizationId: ID;
  kind: OpportunityKind | "post_visit" | "reminder";
  name: string;
  when: string;
  conditions: string[];
  actions: string[];
  active: boolean;
}

export interface AutomationRun {
  id: ID;
  organizationId: ID;
  ruleId: ID;
  ranAt: string;
  summary: string;
  /** Revenue the run helped bring back, when it did. */
  recovered: number;
  /** People or hours it brought back (quotes resumed, returns booked, slots filled). Unknown: one, if it recovered anything. */
  converted?: number;
}

export interface Activity {
  id: ID;
  organizationId: ID;
  at: string;
  text: string;
}

/** Everything the Pulse reads for one clinic. `now` is the moment the data describes. */
export interface FlowData {
  now: string;
  organization: Organization;
  users: User[];
  leads: Lead[];
  patients: Patient[];
  appointments: Appointment[];
  waitlist: WaitlistEntry[];
  procedures: Procedure[];
  products: Product[];
  lots: InventoryLot[];
  procedureProducts: ProcedureProduct[];
  automationRules: AutomationRule[];
  automationRuns: AutomationRun[];
  activities: Activity[];
}
