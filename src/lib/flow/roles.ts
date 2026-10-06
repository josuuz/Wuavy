/*
  Who does what at a clinic. Three roles, no custom permissions: the owner
  runs everything; the front desk (reception) runs the agenda, the patients,
  sales and conversations; a professional sees their own agenda and its
  patients and writes clinical records. The screens read `permissions` to
  show only what a person can use; the database enforces the same rules
  again (row-level security, migration 0009), whatever the browser sends.
*/

export const ROLES = ["owner", "reception", "professional"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Responsável",
  reception: "Recepção",
  professional: "Profissional",
};

/** invited: added, not in yet. active: works at the clinic. disabled: left; their records stay. */
export const MEMBER_STATUSES = ["invited", "active", "disabled"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "Convidado",
  active: "Ativo",
  disabled: "Desativado",
};

export interface Permissions {
  /** The clinic's profile, the plan, the automations. */
  admin: boolean;
  /** Invite, change roles, end access. */
  team: boolean;
  /** Costs, profit, margins, Indicadores. */
  finance: boolean;
  /** Vendas, Oportunidades and the activity log. */
  sales: boolean;
  conversations: boolean;
  /** Book, reschedule, cancel; the waiting list. */
  book: boolean;
  /** Register and edit patients. */
  patients: boolean;
  /** Delete a patient (their visits and records go with them). */
  deletePatients: boolean;
  /** Clinical records. */
  records: boolean;
  /** Create and price procedures. */
  procedures: boolean;
  /** Receive deliveries and adjust the stock. */
  stock: boolean;
}

const ALL: Permissions = {
  admin: true,
  team: true,
  finance: true,
  sales: true,
  conversations: true,
  book: true,
  patients: true,
  deletePatients: true,
  records: true,
  procedures: true,
  stock: true,
};

const NONE: Permissions = Object.fromEntries(Object.keys(ALL).map((key) => [key, false])) as unknown as Permissions;

const BY_ROLE: Record<Role, Permissions> = {
  owner: ALL,
  reception: { ...NONE, sales: true, conversations: true, book: true, patients: true, stock: true },
  professional: { ...NONE, records: true },
};

/** What a role may do. The demo's visitor ("demo") sees all of it, in memory. */
export function permissionsFor(role: string | undefined): Permissions {
  if (role === "demo") return ALL;
  return (ROLES as readonly string[]).includes(role ?? "") ? BY_ROLE[role as Role] : NONE;
}

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);
