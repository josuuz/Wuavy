import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { clinicNow } from "./clock";
import type { FlowSource } from "./source";
import { LEAD_STAGES } from "./types";
import type {
  Activity,
  Appointment,
  AutomationRule,
  AutomationRun,
  FlowData,
  InventoryLot,
  Lead,
  Organization,
  Patient,
  Procedure,
  ProcedureProduct,
  Product,
  User,
  WaitlistEntry,
} from "./types";

/*
  The real FlowSource: one select per table, through the signed-in user's
  client, so row-level security holds even if a filter were missing. Rows go
  from snake_case to the Flow's types; times are normalised to the same ISO
  form the demo uses, because the schedule compares them as strings.
*/

type Db = SupabaseClient<Database>;

const iso = (value: string) => new Date(value).toISOString();
const isoOrUndefined = (value: string | null) => (value ? iso(value) : undefined);

export function supabaseSource(db: Db): FlowSource {
  return {
    async load(organizationId) {
      const id = organizationId;
      const [org, members, leads, patients, appointments, waitlist, procedures, products, lots, uses, rules, runs, activities] =
        await Promise.all([
          db.from("organizations").select("*").eq("id", id).single(),
          db.from("members").select("*").eq("organization_id", id),
          db.from("leads").select("*").eq("organization_id", id).order("created_at", { ascending: false }),
          db.from("patients").select("*").eq("organization_id", id).order("name"),
          db.from("appointments").select("*").eq("organization_id", id).order("starts_at"),
          db.from("waitlist_entries").select("*").eq("organization_id", id).order("created_at"),
          db.from("procedures").select("*").eq("organization_id", id).order("name"),
          db.from("products").select("*").eq("organization_id", id).order("name"),
          db.from("inventory_lots").select("*").eq("organization_id", id).order("expires_at"),
          db.from("procedure_products").select("*").eq("organization_id", id),
          db.from("automation_rules").select("*").eq("organization_id", id),
          db.from("automation_runs").select("*").eq("organization_id", id).order("ran_at", { ascending: false }),
          db.from("activities").select("*").eq("organization_id", id).order("at", { ascending: false }).limit(50),
        ]);

      const failed = [org, members, leads, patients, appointments, waitlist, procedures, products, lots, uses, rules, runs, activities].find(
        (result) => result.error,
      );
      if (failed?.error) throw new Error(`Flow: could not load the clinic (${failed.error.message})`);

      const o = org.data!;
      const organization: Organization = { id: o.id, name: o.name, segment: "estetica", city: o.city ?? "" };

      return {
        now: clinicNow(),
        organization,
        users: members.data!.map(
          (m): User => ({ id: m.user_id, organizationId: m.organization_id, name: m.name, role: m.role as User["role"] }),
        ),
        leads: leads.data!.map(
          (l): Lead => ({
            id: l.id,
            organizationId: l.organization_id,
            name: l.name,
            phone: l.phone ?? "",
            source: l.source as Lead["source"],
            procedureId: l.procedure_id ?? "",
            potentialValue: l.potential_value,
            // A stage from before the funnel ended at "agendado" reads as booked.
            stage: (LEAD_STAGES as readonly string[]).includes(l.stage) ? (l.stage as Lead["stage"]) : "agendado",
            createdAt: iso(l.created_at),
            lastContactAt: iso(l.last_contact_at),
            quoteSentAt: isoOrUndefined(l.quote_sent_at),
            nextAction: l.next_action ?? "",
            // Absent until migration 0002 adds the column.
            patientId: l.patient_id ?? undefined,
          }),
        ),
        patients: patients.data!.map(
          (p): Patient => ({
            id: p.id,
            organizationId: p.organization_id,
            name: p.name,
            phone: p.phone ?? "",
            firstVisitAt: isoOrUndefined(p.first_visit_at),
            lastVisitAt: isoOrUndefined(p.last_visit_at),
            nextReturnAt: isoOrUndefined(p.next_return_at),
            totalSpent: p.total_spent,
            notes: p.notes ?? "",
          }),
        ),
        appointments: appointments.data!.map(
          (a): Appointment => ({
            id: a.id,
            organizationId: a.organization_id,
            patientId: a.patient_id,
            procedureId: a.procedure_id,
            professionalId: a.professional_id ?? undefined,
            startsAt: iso(a.starts_at),
            durationMin: a.duration_min,
            status: a.status as Appointment["status"],
          }),
        ),
        waitlist: waitlist.data!.map(
          (w): WaitlistEntry => ({
            id: w.id,
            organizationId: w.organization_id,
            patientId: w.patient_id,
            procedureId: w.procedure_id,
            period: w.period as WaitlistEntry["period"],
            createdAt: iso(w.created_at),
          }),
        ),
        procedures: procedures.data!.map(
          (p): Procedure => ({
            id: p.id,
            organizationId: p.organization_id,
            name: p.name,
            category: p.category as Procedure["category"],
            price: p.price,
            durationMin: p.duration_min,
            returnDays: p.return_days,
          }),
        ),
        products: products.data!.map(
          (p): Product => ({ id: p.id, organizationId: p.organization_id, name: p.name, unit: p.unit, unitCost: p.unit_cost }),
        ),
        lots: lots.data!.map(
          (l): InventoryLot => ({
            id: l.id,
            organizationId: l.organization_id,
            productId: l.product_id,
            lotCode: l.lot_code,
            quantity: Number(l.quantity),
            expiresAt: iso(l.expires_at),
          }),
        ),
        procedureProducts: uses.data!.map(
          (u): ProcedureProduct => ({
            organizationId: u.organization_id,
            procedureId: u.procedure_id,
            productId: u.product_id,
            quantity: Number(u.quantity),
          }),
        ),
        automationRules: rules.data!.map(
          (r): AutomationRule => ({
            id: r.id,
            organizationId: r.organization_id,
            kind: r.kind as AutomationRule["kind"],
            name: r.name,
            when: r.when,
            conditions: r.conditions,
            actions: r.actions,
            active: r.active,
          }),
        ),
        automationRuns: runs.data!.map(
          (r): AutomationRun => ({
            id: r.id,
            organizationId: r.organization_id,
            ruleId: r.rule_id,
            ranAt: iso(r.ran_at),
            summary: r.summary,
            recovered: r.recovered,
          }),
        ),
        activities: activities.data!.map(
          (a): Activity => ({ id: a.id, organizationId: a.organization_id, at: iso(a.at), text: a.text }),
        ),
      } satisfies FlowData;
    },
  };
}
