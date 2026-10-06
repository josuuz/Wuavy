import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { clinicNow } from "./clock";
import type { Conversation } from "./conversations";
import { permissionsFor, isRole, type MemberStatus } from "./roles";
import type { FlowSource } from "./source";
import { LEAD_STAGES, SEGMENTS, TEAM_SIZES } from "./types";
import type {
  ClinicalRecord,
  Activity,
  Appointment,
  AppointmentFinancial,
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
  client, so row-level security holds even if a filter were missing. What a
  role may not see simply does not come back (the front desk gets no
  clinical records, a professional no sales); what only the owner may see
  (costs, the visits' frozen money) is not even asked for by anyone else.
  Rows go from snake_case to the Pulse's types; times are normalised to the
  same ISO form the demo uses, because the schedule compares them as strings.
*/

type Db = SupabaseClient<Database>;

const iso = (value: string) => new Date(value).toISOString();
const isoOrUndefined = (value: string | null) => (value ? iso(value) : undefined);

/** A product's columns everyone may read: never its cost (migration 0010). */
const PRODUCT_COLUMNS = "id, organization_id, name, unit, min_quantity, brand, category, supplier";
/** The conversations the list shows: the most recent first. */
const CONVERSATIONS = 300;

export function supabaseSource(db: Db, role: string): FlowSource {
  const can = permissionsFor(role);
  return {
    async load(organizationId) {
      const id = organizationId;
      const none = Promise.resolve({ data: [], error: null });
      const [org, members, leads, patients, appointments, waitlist, procedures, products, lots, uses, rules, runs, activities] =
        await Promise.all([
          db.from("organizations").select("*").eq("id", id).single(),
          db.from("members").select("organization_id, user_id, name, role, status, email").eq("organization_id", id),
          db.from("leads").select("*").eq("organization_id", id).order("created_at", { ascending: false }),
          db.from("patients").select("*").eq("organization_id", id).order("name"),
          db.from("appointments").select("*").eq("organization_id", id).order("starts_at"),
          db.from("waitlist_entries").select("*").eq("organization_id", id).order("created_at"),
          db.from("procedures").select("*").eq("organization_id", id).order("name"),
          db.from("products").select(PRODUCT_COLUMNS).eq("organization_id", id).order("name"),
          db.from("inventory_lots").select("*").eq("organization_id", id).order("expires_at"),
          db.from("procedure_products").select("*").eq("organization_id", id),
          db.from("automation_rules").select("*").eq("organization_id", id),
          db.from("automation_runs").select("*").eq("organization_id", id).order("ran_at", { ascending: false }),
          db.from("activities").select("*").eq("organization_id", id).order("at", { ascending: false }).limit(50),
        ]);
      const failed = [org, members, leads, patients, appointments, waitlist, procedures, products, lots, uses, rules, runs, activities].find(
        (result) => result.error,
      );
      if (failed?.error) throw new Error(`Pulse: could not load the clinic (${failed.error.message})`);

      const [records, costs, financials, conversations] = await Promise.all([
        can.records
          ? db.from("clinical_records").select("*").eq("organization_id", id).order("recorded_at", { ascending: false })
          : none,
        can.finance ? db.rpc("pulse_product_costs", { org: id }) : none,
        can.finance ? db.from("appointment_financials").select("*").eq("organization_id", id) : none,
        can.conversations
          ? db
              .from("conversations")
              .select("*")
              .eq("organization_id", id)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(CONVERSATIONS)
          : none,
      ]);
      const extra = [records, costs, financials, conversations].find((result) => result.error);
      if (extra?.error) throw new Error(`Pulse: could not load the clinic (${extra.error.message})`);

      const o = org.data!;
      // Before migration 0003 the profile's columns are not there: no logo, no WhatsApp, the default hours.
      const organization: Organization = {
        id: o.id,
        name: o.name,
        segment: (SEGMENTS as readonly string[]).includes(o.segment) ? (o.segment as Organization["segment"]) : "estetica",
        city: o.city ?? "",
        // Before migration 0006 there is no address column: none.
        address: o.address?.trim() || undefined,
        logoUrl: o.logo_url ?? undefined,
        whatsapp: o.whatsapp ?? undefined,
        teamSize: (TEAM_SIZES as readonly string[]).includes(o.team_size ?? "") ? (o.team_size as Organization["teamSize"]) : undefined,
        hours:
          o.opening_time && o.closing_time && o.opening_time < o.closing_time
            ? { opens: o.opening_time, closes: o.closing_time, days: o.work_days?.length ? o.work_days : [1, 2, 3, 4, 5, 6] }
            : undefined,
      };

      const unitCost = new Map((costs.data ?? []).map((c) => [c.product_id, c.unit_cost]));
      const leadRows = leads.data!;
      const patientRows = patients.data!;
      const users = members.data!.map(
        (m): User => ({
          id: m.user_id,
          organizationId: m.organization_id,
          name: m.name,
          role: isRole(m.role) ? m.role : "reception",
          status: m.status as MemberStatus,
          email: m.email ?? undefined,
        }),
      );

      return {
        now: clinicNow(),
        organization,
        users,
        leads: leadRows.map(
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
            patientId: l.patient_id ?? undefined,
          }),
        ),
        patients: patientRows.map(
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
            deposit: a.deposit_cents
              ? {
                  cents: a.deposit_cents,
                  due: a.deposit_due ?? undefined,
                  paidAt: a.deposit_paid_at ? iso(a.deposit_paid_at) : undefined,
                  percent: a.deposit_percent ?? undefined,
                  provider: a.deposit_provider === "manual" ? "manual" : undefined,
                }
              : undefined,
            priceCharged: a.price_charged ?? undefined,
            discount: a.discount ?? undefined,
            createdBy: a.created_by ?? undefined,
            updatedBy: a.updated_by ?? undefined,
            completedBy: a.completed_by ?? undefined,
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
          (p): Product => ({
            id: p.id,
            organizationId: p.organization_id,
            name: p.name,
            unit: p.unit,
            unitCost: unitCost.get(p.id),
            brand: p.brand?.trim() || undefined,
            category: p.category?.trim() || undefined,
            supplier: p.supplier?.trim() || undefined,
            minQuantity: p.min_quantity == null ? undefined : Number(p.min_quantity),
          }),
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
            converted: Number(r.converted),
          }),
        ),
        activities: activities.data!.map(
          (a): Activity => ({
            id: a.id,
            organizationId: a.organization_id,
            at: iso(a.at),
            text: a.text,
            actorId: a.actor_id ?? undefined,
          }),
        ),
        records: (records.data ?? []).map(
          (r): ClinicalRecord => ({
            id: r.id,
            organizationId: r.organization_id,
            patientId: r.patient_id,
            recordedAt: iso(r.recorded_at),
            chiefComplaint: r.chief_complaint ?? "",
            notes: r.notes ?? "",
            authorId: r.author_id ?? undefined,
            updatedBy: r.updated_by ?? undefined,
          }),
        ),
        financials: (financials.data ?? []).map(
          (f): AppointmentFinancial => ({
            appointmentId: f.appointment_id,
            completedAt: iso(f.completed_at),
            listPrice: f.list_price,
            discount: f.discount,
            priceCharged: f.price_charged,
            totalCost: f.total_cost,
            grossProfit: f.gross_profit,
            grossMargin: f.gross_margin == null ? undefined : Number(f.gross_margin),
          }),
        ),
        conversations: (conversations.data ?? []).map((c): Conversation => {
          const lead = c.lead_id ? leadRows.find((l) => l.id === c.lead_id) : undefined;
          const patient = c.patient_id ? patientRows.find((p) => p.id === c.patient_id) : undefined;
          return {
            id: c.id,
            organizationId: c.organization_id,
            participant: {
              leadId: c.lead_id ?? undefined,
              patientId: c.patient_id ?? lead?.patient_id ?? undefined,
              name: patient?.name ?? lead?.name ?? "",
              phone: patient?.phone ?? lead?.phone ?? "",
            },
            status: c.status as Conversation["status"],
            assignedUserId: c.assigned_user_id ?? undefined,
            followUpAt: isoOrUndefined(c.follow_up_at),
            unread: 0,
            lastMessage:
              c.last_message_at && c.last_message_preview
                ? {
                    text: c.last_message_preview,
                    direction: (c.last_direction ?? "note") as "in" | "out" | "note",
                    at: iso(c.last_message_at),
                  }
                : undefined,
          };
        }),
      } satisfies FlowData;
    },
  };
}
