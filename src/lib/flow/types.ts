/*
  Wuavy Pulse's domain. Each entity mirrors a table (supabase/migrations/
  0001_flow.sql): camelCase here, snake_case there, and every row carries its
  organization, so one clinic never reads another's data. Money is in cents,
  times are ISO strings in the clinic's wall clock (see clock.ts).
*/

import type { WhatsAppState } from "@/lib/whatsapp/types";
import type { Conversation } from "./conversations";
import type { MemberStatus, Role } from "./roles";

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

/** A member of the clinic's team (migration 0009). Disabled members stay: their name signs what they did. */
export interface User {
  id: ID;
  organizationId: ID;
  name: string;
  role: Role;
  /** Absent in the demo: everyone there is active. */
  status?: MemberStatus;
  email?: string;
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
  /** A deposit asked when booking (migration 0007). Overdue is read from `due`, never stored. */
  deposit?: {
    cents: number;
    due?: string;
    paidAt?: string;
    /** When it was asked as a share of the price. */
    percent?: number;
    /** Who handles the payment: "manual" (marked paid by hand) until a provider exists (migration 0008). */
    provider?: "manual";
  };
  /** What the patient paid, set when the visit was finished (migration 0009). Absent before it: the procedure's price stands in. */
  priceCharged?: number;
  discount?: number;
  /** Who booked it and who changed it last (members' ids). */
  createdBy?: ID;
  updatedBy?: ID;
  completedBy?: ID;
}

/**
 * A finished visit's money, frozen the moment it was finished (migration
 * 0009): what was charged and what its products cost that day. A later change
 * in a product's cost never touches it. Only the owner receives these rows.
 */
export interface AppointmentFinancial {
  appointmentId: ID;
  completedAt: string;
  listPrice: number;
  discount: number;
  priceCharged: number;
  totalCost: number;
  grossProfit: number;
  /** Percent of the price charged; absent when nothing was charged. */
  grossMargin?: number;
}

/** One product a finished visit used, at its cost that day. */
export interface AppointmentSupply {
  productId?: ID;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
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
  /** The purchase price of one unit, today. Absent for whoever may not see costs (only the owner does). */
  unitCost?: number;
  brand?: string;
  category?: string;
  supplier?: string;
  /** At or below this, the Pulse says to buy (migration 0004). Absent: it judges by the sessions left. */
  minQuantity?: number;
}

/**
 * A clinical record (migration 0007): what the patient came for and what was
 * done. Only the clinic's owner and professionals read or write it (the
 * database enforces it); the front desk never receives these rows.
 */
export interface ClinicalRecord {
  id: ID;
  organizationId: ID;
  patientId: ID;
  recordedAt: string;
  chiefComplaint: string;
  notes: string;
  authorId?: ID;
  /** Who edited it last, when someone did. */
  updatedBy?: ID;
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

export type OpportunityKind =
  | "lead_followup"
  | "lead_idle"
  | "patient_return"
  | "patient_lapsed"
  | "no_show"
  | "stock_expiry"
  | "open_slot";
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
  /** Who did it (migration 0009). */
  actorId?: ID;
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
  /** Empty for whoever may not see clinical records. */
  records: ClinicalRecord[];
  /** Finished visits' frozen money. Empty for whoever may not see costs (only the owner does). */
  financials: AppointmentFinancial[];
  /**
   * A real clinic's conversations, most recent first, without their messages
   * (a thread loads when it is opened). The demo keeps its own in memory (inbox.tsx).
   */
  conversations: Conversation[];
  /** The clinic's WhatsApp channel (migration 0012), for the front office; absent in the demo and for professionals. */
  whatsapp?: WhatsAppState;
}
