/*
  Wuavy Pulse's domain. Each entity mirrors a table (supabase/migrations/
  0001_flow.sql): camelCase here, snake_case there, and every row carries its
  organization, so one clinic never reads another's data. Money is in cents,
  times are ISO strings in the clinic's wall clock (see clock.ts).
*/

export type ID = string;

/* The clinic's profile, from onboarding (organizations, migration 0003). */
export const SEGMENTS = ["estetica", "odontologia", "dermatologia", "harmonizacao", "multidisciplinar", "outro"] as const;
/** About how many professionals see patients. */
export const TEAM_SIZES = ["1", "2-3", "4-6", "7+"] as const;
/** The logo's largest size: under the Server Actions' 1 MB body, with room for the rest of the form. */
export const LOGO_MAX = 800 * 1024;
/** What the logo's file picker offers. The server checks the file's own bytes again (logo.ts). */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface Organization {
  id: ID;
  name: string;
  /** The kind of clinic, chosen at onboarding. */
  segment: (typeof SEGMENTS)[number];
  city: string;
  /** Street, number, district and city, as the clinic writes it (migration 0006). */
  address?: string;
  logoUrl?: string;
  whatsapp?: string;
  teamSize?: (typeof TEAM_SIZES)[number];
  /** When the clinic sees patients ("08:00" to "19:00"; days 0 Sunday … 6 Saturday). Absent: the default grid, Monday to Saturday. */
  hours?: { opens: string; closes: string; days: number[] };
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

export const PROCEDURE_CATEGORIES = ["facial", "injetaveis", "corporal", "outro"] as const;

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
  /** At or below this, the Pulse says to buy (migration 0004). Absent: it judges by the sessions left. */
  minQuantity?: number;
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

export type OpportunityKind = "lead_followup" | "lead_idle" | "patient_return" | "no_show" | "stock_expiry" | "open_slot";
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
