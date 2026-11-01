# Cupons de Representantes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin apply a representative's coupon to a one-time Wuavy Cobranças charge, with the discount computed and validated server-side, and a per-representative results panel.

**Architecture:** Three new tables + two new columns on `billing_charges` (migration 0020, additive). A pure validation/discount module (`coupon-rules.ts`, no I/O) decides everything a coupon application can reject or compute; thin server-only modules (`representatives.ts`, `coupons.ts`, `coupon-audit.ts`) do the Supabase reads/writes and call into it. `lancamentos/actions.ts::addCharge` gains one optional field and calls the same pure resolver before inserting. A new `/cobrancas/representantes` admin page reuses the existing auth (`getAdmin`) and form patterns (`ClientForm.tsx`/`ServiceForm.tsx`).

**Tech Stack:** Next.js 16 Server Actions, Supabase (service role, RLS-locked), TypeScript, `node:test` (no DB in this environment — only pure functions get automated tests, same boundary the existing `billing_*` code already draws).

**Spec:** `docs/superpowers/specs/2026-10-27-billing-coupons-design.md`

**Correção pós-validação (2026-10-27):** Task 1 abaixo, como escrita e executada, criou `0020_billing_coupons.sql`. Uma checagem remota contra o projeto de teste (`supabase migration list --project-ref wazxofdzvzfgonmwsdhs`), feita antes de qualquer aplicação, achou `0020` e `0021` já de fato aplicadas lá por `fix/pulse-subscription-reconciliation` — sem relação com cupons. O arquivo foi renomeado para `0022_billing_coupons.sql` depois; o texto da tarefa abaixo fica como estava escrito, para registro.

## Global Constraints

- Every money column keeps the project's `_cents` suffix convention; `discount_percent` is a plain integer 1–100, never a fraction.
- Coupon `code` format: `^[A-Z0-9]{3,20}$`, unique, stored and looked up upper-cased.
- `billing_charges.amount_cents` keeps meaning the final frozen charged value; nothing about `createPreference`, the Cobranças webhook, or payment sync changes.
- Zero code path touches `maintenance_subscriptions`, `maintenance_clients`, or Pulse `subscriptions`/`access.ts` — coupons only ever read/write `billing_*` tables.
- Pending-reservation window for `max_uses`: 48 hours (`PENDING_RESERVATION_TTL_MS = 48 * 60 * 60 * 1000`).
- All discount computation and coupon validation happens in Server Actions; no form field carrying a discount or final amount is ever trusted — only `coupon_code` (a string) crosses the network from the client.
- Deactivating a representative cascades to deactivate their coupons (`UPDATE ... WHERE representative_id = ...`); reactivating a representative never reactivates a coupon.
- Creating or reactivating a coupon under an inactive representative is rejected.
- `tsc --noEmit`, `eslint`, and `next build` must pass in the worktree before any task is considered done. No `git commit`, push, merge, or deploy — per standing instruction, this plan has no commit steps; the user authorizes those separately once the branch is reviewed.
- No change to the Supabase migration is ever applied (`supabase db push`) and no production/Mercado Pago credential is touched by this plan.

## Review Focus

- A coupon code typed in lowercase or with stray spaces (`" bru10 "`) must still match the stored upper-case `BRU10` — Task 2.
- A coupon whose computed discount exactly equals the charge amount (e.g. a 100%-off coupon) is rejected, never silently turned into a free/zero-value charge — Task 2.
- A charge with no service chosen (custom description) can only accept a coupon that has zero rows in `billing_coupon_services`; a coupon restricted to specific services must be rejected for it — Task 2.
- A coupon that is otherwise valid but outside `valid_from`/`valid_until` at the exact boundary instant is rejected — Task 2.
- Reactivating a representative whose coupons were cascade-deactivated does not bring any coupon back to `active = true` — Task 5.

---

### Task 1: Migration — representatives, coupons, eligibility, audit

**Files:**
- Create: `supabase/migrations/0020_billing_coupons.sql`

**Interfaces:**
- Produces: tables `billing_representatives`, `billing_coupons`, `billing_coupon_services`, `billing_coupon_audit`; `billing_charges` gains `coupon_id`, `discount_cents`. Every later task's Supabase queries assume these exact names and columns.

- [ ] **Step 1: Write the migration**

```sql
-- Wuavy 0020: cupons de representantes (Wuavy Cobranças). Aditiva: três
-- tabelas novas + duas colunas em billing_charges. Não toca billing_clients,
-- billing_services, maintenance_* nem subscriptions (Pulse). Não aplicada
-- ainda: revisar antes de rodar.

create table billing_representatives (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  whatsapp text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table billing_coupons (
  id uuid primary key default gen_random_uuid(),
  representative_id uuid not null references billing_representatives (id),
  code text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_percent smallint check (discount_percent between 1 and 100),
  discount_fixed_cents integer check (discount_fixed_cents between 100 and 100000000),
  check (
    (discount_type = 'percent' and discount_percent is not null and discount_fixed_cents is null) or
    (discount_type = 'fixed' and discount_fixed_cents is not null and discount_percent is null)
  ),
  first_payment_only boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_coupons_representative on billing_coupons (representative_id);

create table billing_coupon_services (
  coupon_id uuid not null references billing_coupons (id) on delete cascade,
  service_id uuid not null references billing_services (id) on delete cascade,
  primary key (coupon_id, service_id)
);

create table billing_coupon_audit (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  representative_id uuid references billing_representatives (id) on delete set null,
  coupon_id uuid references billing_coupons (id) on delete set null,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

alter table billing_charges
  add column coupon_id uuid references billing_coupons (id) on delete set null,
  add column discount_cents integer not null default 0 check (discount_cents >= 0);

alter table billing_representatives enable row level security;
alter table billing_coupons enable row level security;
alter table billing_coupon_services enable row level security;
alter table billing_coupon_audit enable row level security;
```

- [ ] **Step 2: Review by reading the file back**

Confirm every table/column named in the design doc's "Modelo de dados" section is present with the same name and type. No automated test — this project has no local Postgres (no Docker/psql here); migrations 0013/0018/0019 are reviewed the same way, by eye, before being applied by separate authorization.

---

### Task 2: Pure coupon validation and discount math

**Files:**
- Create: `src/lib/billing/coupon-rules.ts`
- Test: `tests/billing-coupon-rules.test.mjs`

**Interfaces:**
- Consumes: `ChargeBucket` from `src/lib/billing/charge-status.ts` (`"pending" | "approved" | "rejected" | "cancelled" | "refunded"`).
- Produces: `normalizeCode`, `isServiceEligible`, `discountCentsFor`, `effectiveUses`, `PENDING_RESERVATION_TTL_MS`, `CouponRejectReason`, `COUPON_REJECT_MESSAGE`, `CouponRow`, `resolveCoupon` — Tasks 6 and 9 call `resolveCoupon` directly; nothing else in this task's file is called from outside Task 3.

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCode, isServiceEligible, discountCentsFor, effectiveUses,
  PENDING_RESERVATION_TTL_MS, resolveCoupon,
} from "../src/lib/billing/coupon-rules.ts";

test("normalizeCode caixa-alta e sem espaço nas pontas", () => {
  assert.equal(normalizeCode(" bru10 "), "BRU10");
});

test("isServiceEligible: lista vazia vale para qualquer serviço, inclusive sem serviço", () => {
  assert.equal(isServiceEligible([], "svc-1"), true);
  assert.equal(isServiceEligible([], null), true);
});

test("isServiceEligible: lista restrita recusa serviço fora dela e recusa cobrança sem serviço", () => {
  assert.equal(isServiceEligible(["svc-1"], "svc-2"), false);
  assert.equal(isServiceEligible(["svc-1"], null), false);
  assert.equal(isServiceEligible(["svc-1"], "svc-1"), true);
});

test("discountCentsFor: percentual arredonda, fixo é o próprio valor", () => {
  assert.equal(discountCentsFor({ discount_type: "percent", discount_percent: 10, discount_fixed_cents: null }, 15_000), 1_500);
  assert.equal(discountCentsFor({ discount_type: "fixed", discount_percent: null, discount_fixed_cents: 2_000 }, 15_000), 2_000);
});

test("effectiveUses: aprovada e reembolsada sempre contam, pendente só dentro da janela, rejeitada/cancelada nunca", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const hour = 60 * 60 * 1000;
  const rows = [
    { status: "approved", created_at: "2026-01-01T00:00:00Z" },
    { status: "refunded", created_at: "2026-01-01T00:00:00Z" },
    { status: "pending", created_at: new Date(now - 1 * hour).toISOString() },
    { status: "pending", created_at: new Date(now - 49 * hour).toISOString() },
    { status: "rejected", created_at: new Date(now - 1 * hour).toISOString() },
    { status: "cancelled", created_at: new Date(now - 1 * hour).toISOString() },
  ];
  assert.equal(effectiveUses(rows, now, PENDING_RESERVATION_TTL_MS), 3);
});

test("resolveCoupon: sem código, não aplica nada e não recusa", () => {
  const result = resolveCoupon({
    couponCode: null, coupon: null, eligibleServiceIds: [], chargeHistory: [],
    nowMs: Date.now(), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.deepEqual(result, { applied: false });
});

test("resolveCoupon: cupom inexistente recusa com mensagem", () => {
  const result = resolveCoupon({
    couponCode: "BRU10", coupon: null, eligibleServiceIds: [], chargeHistory: [],
    nowMs: Date.now(), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
  assert.ok("error" in result);
});

test("resolveCoupon: desconto de 100% é recusado, nunca uma cobrança de R$ 0", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "percent", discount_percent: 100, discount_fixed_cents: null,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
  assert.ok("error" in result);
});

test("resolveCoupon: serviço recorrente recusa mesmo com cupom válido", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: "svc-1", serviceKind: "recurring",
  });
  assert.equal(result.applied, false);
});

test("resolveCoupon: fora da validade recusa", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: "2026-02-01T00:00:00Z", max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    nowMs: Date.parse("2026-03-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
});

test("resolveCoupon: limite de uso atingido recusa", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: 1,
  };
  const history = [{ status: "approved", created_at: "2026-01-02T00:00:00Z" }];
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: history,
    nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
});

test("resolveCoupon: tudo certo aplica e devolve o final já descontado", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "percent", discount_percent: 10, discount_fixed_cents: null,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "bru10", coupon, eligibleServiceIds: [], chargeHistory: [],
    nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.deepEqual(result, { applied: true, discountCents: 1_500, finalCents: 13_500 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/billing-coupon-rules.test.mjs`
Expected: FAIL — module `coupon-rules.ts` does not exist.

- [ ] **Step 3: Implement `src/lib/billing/coupon-rules.ts`**

```ts
import type { ChargeBucket } from "./charge-status";

export type DiscountType = "percent" | "fixed";

export interface CouponRow {
  id: string;
  active: boolean;
  discount_type: DiscountType;
  discount_percent: number | null;
  discount_fixed_cents: number | null;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
}

export function normalizeCode(input: string): string;
export function isServiceEligible(eligibleServiceIds: string[], serviceId: string | null): boolean;
export function discountCentsFor(coupon: Pick<CouponRow, "discount_type" | "discount_percent" | "discount_fixed_cents">, amountCents: number): number;

export const PENDING_RESERVATION_TTL_MS = 48 * 60 * 60 * 1000;
export function effectiveUses(charges: { status: ChargeBucket; created_at: string }[], nowMs: number, pendingTtlMs: number): number;

export type CouponRejectReason =
  | "not-found" | "inactive" | "not-yet-valid" | "expired"
  | "service-not-eligible" | "service-recurring"
  | "discount-exceeds-amount" | "max-uses-reached";

export const COUPON_REJECT_MESSAGE: Record<CouponRejectReason, string>; // uma frase em pt-BR por motivo, para o erro que o formulário mostra

export type ResolveCouponResult =
  | { applied: false }
  | { applied: false; error: string }
  | { applied: true; discountCents: number; finalCents: number };

export function resolveCoupon(input: {
  couponCode: string | null;
  coupon: CouponRow | null;
  eligibleServiceIds: string[];
  chargeHistory: { status: ChargeBucket; created_at: string }[];
  nowMs: number;
  amountCents: number;
  serviceId: string | null;
  serviceKind: "once" | "recurring" | null;
}): ResolveCouponResult;
```

Notes on the body (the signature and tests above decide everything else):
- `effectiveUses` counts a row when `status === "approved"`, `status === "refunded"`, or (`status === "pending"` and `nowMs - Date.parse(created_at) < pendingTtlMs`).
- `resolveCoupon`, when `couponCode` is null, returns `{ applied: false }` immediately. Otherwise, in order: not found (`coupon === null`) → `inactive` → `valid_from`/`valid_until` against `nowMs` → `service-recurring` (when `serviceKind === "recurring"`) → `service-not-eligible` (via `isServiceEligible`) → `max_uses` (via `effectiveUses(chargeHistory, nowMs, PENDING_RESERVATION_TTL_MS)` against `coupon.max_uses`, skipped when `max_uses` is null) → compute `discountCentsFor`, reject `discount-exceeds-amount` when the discount is `>= amountCents`, else return `{ applied: true, discountCents, finalCents: amountCents - discountCents }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/billing-coupon-rules.test.mjs`
Expected: PASS, all cases above.

---

### Task 3: Representative stats and share message (pure)

**Files:**
- Modify: `src/lib/billing/coupon-rules.ts` (add exports, same file Task 2 created)
- Test: `tests/billing-coupon-rules.test.mjs` (add cases, same file Task 2 created)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RepresentativeChargeRow`, `RepresentativeStats`, `representativeStats`, `shareMessage` — Task 6 (`chargesForRepresentative`) produces rows of the first shape; Task 8's page calls `representativeStats` and `shareMessage`.

- [ ] **Step 1: Write the failing tests**

```js
import { representativeStats, shareMessage } from "../src/lib/billing/coupon-rules.ts";

test("representativeStats separa pendentes, aprovadas e não repete cliente convertido", () => {
  const rows = [
    { client_id: "a", status: "approved", amount_cents: 10_000, discount_cents: 1_000 },
    { client_id: "a", status: "approved", amount_cents: 20_000, discount_cents: 2_000 },
    { client_id: "b", status: "pending", amount_cents: 5_000, discount_cents: 500 },
    { client_id: "c", status: "refunded", amount_cents: 7_000, discount_cents: 700 },
    { client_id: "d", status: "rejected", amount_cents: 3_000, discount_cents: 300 },
  ];
  assert.deepEqual(representativeStats(rows), {
    registeredReferrals: 5,
    pendingCharges: 1,
    confirmedSales: 2,
    convertedClients: 1,
    attributedRevenueCents: 30_000,
    grantedDiscountCents: 3_000,
  });
});

test("representativeStats: sem nenhuma cobrança, tudo zero", () => {
  assert.deepEqual(representativeStats([]), {
    registeredReferrals: 0, pendingCharges: 0, confirmedSales: 0,
    convertedClients: 0, attributedRevenueCents: 0, grantedDiscountCents: 0,
  });
});

test("shareMessage leva o nome do representante e o código em maiúsculas", () => {
  const message = shareMessage("Bruna", "bru10");
  assert.match(message, /Bruna/);
  assert.match(message, /BRU10/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/billing-coupon-rules.test.mjs`
Expected: FAIL — `representativeStats`/`shareMessage` not exported yet.

- [ ] **Step 3: Implement in `src/lib/billing/coupon-rules.ts`**

```ts
export interface RepresentativeChargeRow {
  client_id: string;
  status: ChargeBucket;
  amount_cents: number;
  discount_cents: number;
}

export interface RepresentativeStats {
  registeredReferrals: number;
  pendingCharges: number;
  confirmedSales: number;
  convertedClients: number;
  attributedRevenueCents: number;
  grantedDiscountCents: number;
}

export function representativeStats(charges: RepresentativeChargeRow[]): RepresentativeStats;
export function shareMessage(representativeName: string, couponCode: string): string;
```

`representativeStats`: `registeredReferrals` is `charges.length`; `pendingCharges`/`confirmedSales` filter by status; `convertedClients` is `new Set(charges.filter(c => c.status === "approved").map(c => c.client_id)).size`; `attributedRevenueCents`/`grantedDiscountCents` sum `amount_cents`/`discount_cents` over `status === "approved"` only (`refunded` is excluded from these two sums, per the design doc, even though it still occupied a `max_uses` slot in Task 2's `effectiveUses`). `shareMessage` calls `normalizeCode` on the code and interpolates it with the representative's name into one pt-BR sentence inviting a WhatsApp referral.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/billing-coupon-rules.test.mjs`
Expected: PASS, all cases from Tasks 2 and 3.

---

### Task 4: Coupon audit logging

**Files:**
- Create: `src/lib/billing/coupon-audit.ts`

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `CouponAuditAction`, `recordCouponAudit` — Tasks 5 and 6 call this after every representative/coupon create, edit, activate, or deactivate.

- [ ] **Step 1: Implement `src/lib/billing/coupon-audit.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CouponAuditAction =
  | "create_representative" | "update_representative"
  | "activate_representative" | "deactivate_representative"
  | "create_coupon" | "update_coupon" | "activate_coupon" | "deactivate_coupon";

export async function recordCouponAudit(input: {
  adminEmail: string;
  representativeId?: string | null;
  couponId?: string | null;
  action: CouponAuditAction;
  detail: string;
}): Promise<void>;
```

Body: insert one row into `billing_coupon_audit` with `admin_email: input.adminEmail`, `representative_id: input.representativeId ?? null`, `coupon_id: input.couponId ?? null`, `action: input.action`, `detail: input.detail`. On error, `console.warn("cobranças: auditoria de cupom", error.message)` and return — never throw, same best-effort pattern as `writePayments` in `src/lib/maintenance/billing.ts`. A failed audit write never blocks the representative/coupon write that triggered it.

- [ ] **Step 2: Verify**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npx tsc --noEmit`
Expected: no new type errors from this file (no Supabase connection exists in this environment, so this is a type-check, not an integration test — the same boundary `clients.ts`/`services.ts` already have today).

---

### Task 5: Representatives CRUD with cascading deactivation

**Files:**
- Create: `src/lib/billing/representatives.ts`

**Interfaces:**
- Consumes: `createAdminClient`; `recordCouponAudit` (Task 4).
- Produces: `Representative`, `RepresentativeInput`, `listRepresentatives`, `getRepresentative`, `createRepresentative`, `updateRepresentative`, `setRepresentativeActive` — Task 8's page/actions call all five; Task 6's `createCoupon`/`setCouponActive` call `getRepresentative` to check `active` before allowing a coupon to go live.

- [ ] **Step 1: Implement `src/lib/billing/representatives.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCouponAudit } from "./coupon-audit";

export interface Representative {
  id: string; name: string; whatsapp: string | null; notes: string | null;
  active: boolean; created_at: string;
}

export async function listRepresentatives(): Promise<Representative[]>;
export async function getRepresentative(id: string): Promise<Representative | null>;

export interface RepresentativeInput { name: string; whatsapp: string | null; notes: string | null; }
export type SaveRepresentativeResult =
  | { outcome: "saved"; representative: Representative }
  | { outcome: "error"; message: string };

export async function createRepresentative(adminEmail: string, input: RepresentativeInput): Promise<SaveRepresentativeResult>;
export async function updateRepresentative(adminEmail: string, id: string, input: RepresentativeInput): Promise<SaveRepresentativeResult>;
export async function setRepresentativeActive(adminEmail: string, id: string, active: boolean): Promise<{ outcome: "updated" } | { outcome: "error"; message: string }>;
```

Body:
- `listRepresentatives`/`getRepresentative`: plain select, newest first, same style as `listClients`/`getClient` in `clients.ts`.
- `createRepresentative`/`updateRepresentative`: insert/update, call `recordCouponAudit` with action `create_representative`/`update_representative` and a one-line `detail` naming what changed; on a Postgres error return `{ outcome: "error", message: "Não foi possível salvar." }` (no duplicate check needed — unlike `billing_clients`, nothing here is looked up by name/email).
- `setRepresentativeActive(adminEmail, id, active)`: update `billing_representatives.active`. When `active === false`: additionally `update billing_coupons set active = false where representative_id = id and active = true`, `select id`, and call `recordCouponAudit` once for the representative (`deactivate_representative`) and once per coupon id returned (`deactivate_coupon`, detail noting it was cascaded). **When `active === true`: update only the representative row and audit `activate_representative` — never touch `billing_coupons`,** so a coupon the admin had deliberately turned off stays off (Review Focus item 5).

- [ ] **Step 2: Verify**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npx tsc --noEmit`
Expected: no new type errors.

---

### Task 6: Coupons CRUD, eligibility, and lookup

**Files:**
- Create: `src/lib/billing/coupons.ts`

**Interfaces:**
- Consumes: `createAdminClient`; `recordCouponAudit` (Task 4); `getRepresentative`, `Representative` (Task 5); `CouponRow`, `RepresentativeChargeRow`, `normalizeCode` (Tasks 2–3).
- Produces: `Coupon`, `CouponInput`, `listCouponsByRepresentative`, `createCoupon`, `updateCoupon`, `setCouponActive`, `CouponLookup`, `lookupCouponByCode`, `couponChargeHistory`, `chargesForRepresentative` — Task 8's page calls the list/create/update/activate functions; Task 9's `addCharge` calls `lookupCouponByCode` and `couponChargeHistory`.

- [ ] **Step 1: Implement `src/lib/billing/coupons.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCouponAudit } from "./coupon-audit";
import { getRepresentative, type Representative } from "./representatives";
import { normalizeCode, type CouponRow, type DiscountType, type RepresentativeChargeRow } from "./coupon-rules";
import type { ChargeBucket } from "./charge-status";

export interface Coupon extends CouponRow {
  representative_id: string;
  code: string;
  first_payment_only: boolean;
  created_at: string;
  updated_at: string;
}

export async function listCouponsByRepresentative(representativeId: string): Promise<Coupon[]>;

export interface CouponInput {
  code: string;
  discount_type: DiscountType;
  discount_percent: number | null;
  discount_fixed_cents: number | null;
  first_payment_only: boolean;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
  serviceIds: string[];
}
export type SaveCouponResult = { outcome: "saved"; coupon: Coupon } | { outcome: "error"; message: string };

export async function createCoupon(adminEmail: string, representativeId: string, input: CouponInput): Promise<SaveCouponResult>;
export async function updateCoupon(adminEmail: string, id: string, input: CouponInput): Promise<SaveCouponResult>;
export async function setCouponActive(adminEmail: string, id: string, active: boolean): Promise<{ outcome: "updated" } | { outcome: "error"; message: string }>;

export interface CouponLookup { coupon: Coupon; representative: Representative; eligibleServiceIds: string[]; }
export async function lookupCouponByCode(code: string): Promise<CouponLookup | null>;

export async function couponChargeHistory(couponId: string): Promise<{ status: ChargeBucket; created_at: string }[]>;
export async function chargesForRepresentative(representativeId: string): Promise<RepresentativeChargeRow[]>;
```

Body:
- `code` is passed through `normalizeCode` (Task 2) before every insert/update and before the `lookupCouponByCode` query — so a code is always compared upper-cased.
- `createCoupon`/`setCouponActive(..., true)`: call `getRepresentative(representativeId)` first (for `setCouponActive`, read the coupon's own `representative_id` first); if the representative is null or `active === false`, return `{ outcome: "error", message: "Representante está desativado — reative o representante primeiro." }` without writing anything.
- `createCoupon`/`updateCoupon`: write the coupon row, then replace its `billing_coupon_services` rows wholesale (delete where `coupon_id = id`, insert one row per `input.serviceIds`) in the same call; `recordCouponAudit` with `create_coupon`/`update_coupon` and a one-line detail (code, discount, representative). On the unique-code Postgres error (`23505`), return `{ outcome: "error", message: "Já existe um cupom com esse código." }`.
- `lookupCouponByCode`: select the coupon by normalized code, its representative, and its `billing_coupon_services.service_id` list; return `null` when the coupon does not exist.
- `couponChargeHistory`: select `status, created_at` from `billing_charges` where `coupon_id = couponId`.
- `chargesForRepresentative`: select `client_id, status, amount_cents, discount_cents` from `billing_charges` where `coupon_id in (select id from billing_coupons where representative_id = representativeId)`.

- [ ] **Step 2: Verify**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npx tsc --noEmit`
Expected: no new type errors.

---

### Task 7: Representative and coupon forms

**Files:**
- Create: `src/components/billing/RepresentativeForm.tsx`
- Create: `src/components/billing/CouponForm.tsx`

**Interfaces:**
- Consumes: `Representative` (Task 5), `Coupon` (Task 6), `BillingService` (existing `services.ts`), `brl`/`reais`/`parsePrice` (existing `lib/billing/money.ts`).
- Produces: `RepresentativeFormProps`, `CouponFormProps` — Task 8's page renders both.

- [ ] **Step 1: Implement `RepresentativeForm.tsx`**

Client component, `useActionState`, same shape as `ClientForm.tsx` (fields: `name`, `whatsapp`, `notes`; hidden `id` when editing an existing representative). Props: `{ action: (state: string | null, form: FormData) => Promise<string | null>; submitLabel: string; representative?: Representative }`.

- [ ] **Step 2: Implement `CouponForm.tsx`**

Client component, same `useActionState` shape. Fields: `code`; a `discount_type` select (`percent` / `fixed`) that shows either a plain 1–100 number input (`discount_percent`) or a reais-formatted text input parsed like every other price field in this codebase (`discount_fixed_cents`, via `parsePrice`/`reais` from `lib/billing/money.ts`) depending on the selected type; `first_payment_only` checkbox (default checked); `valid_from`/`valid_until` date inputs; `max_uses` number input (empty = unlimited); one checkbox per service for eligibility (empty selection = all services). Props: `{ action: (state: string | null, form: FormData) => Promise<string | null>; submitLabel: string; services: { id: string; name: string }[]; coupon?: Coupon; selectedServiceIds?: string[] }`.

- [ ] **Step 3: Verify**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npx tsc --noEmit && npx eslint src/components/billing/RepresentativeForm.tsx src/components/billing/CouponForm.tsx`
Expected: no errors.

---

### Task 8: `/cobrancas/representantes` page, actions, and nav links

**Files:**
- Create: `src/app/(care)/cobrancas/representantes/page.tsx`
- Create: `src/app/(care)/cobrancas/representantes/actions.ts`
- Create: `src/lib/billing/whatsapp.ts`
- Modify: `src/app/(care)/cobrancas/clientes/page.tsx` (nav)
- Modify: `src/app/(care)/cobrancas/servicos/page.tsx` (nav)
- Modify: `src/app/(care)/cobrancas/lancamentos/page.tsx` (nav)

**Interfaces:**
- Consumes: everything from Tasks 5–7; `listServices` (existing `services.ts`); `getAdmin`, `enter`/`leave` (existing `maintenance/admin.ts` and `clientes/actions.ts`, re-exported exactly as `servicos/page.tsx` and `lancamentos/page.tsx` already do).
- Produces: `waLink(whatsapp: string | null, text: string): string` in the new `whatsapp.ts` — Task 9 switches `ChargeForm.tsx` to import this instead of its local copy.

- [ ] **Step 1: Extract `src/lib/billing/whatsapp.ts`**

```ts
export function waLink(whatsapp: string | null, text: string): string;
```

Body: move the existing local `waLink` function out of `ChargeForm.tsx` verbatim (digits-only, prefix `55` when the number isn't already 12+ digits, build the `https://wa.me/<to>?text=<encoded>` URL) — no behavior change, just a new home so `representantes/page.tsx` can use it too.

- [ ] **Step 2: Implement `src/app/(care)/cobrancas/representantes/actions.ts`**

```ts
"use server";
export { enter, leave } from "../clientes/actions";
export async function addRepresentative(_state: string | null, form: FormData): Promise<string | null>;
export async function saveRepresentative(_state: string | null, form: FormData): Promise<string | null>;
export async function setRepresentativeStatus(form: FormData): Promise<void>;
export async function addCoupon(_state: string | null, form: FormData): Promise<string | null>;
export async function saveCoupon(_state: string | null, form: FormData): Promise<string | null>;
export async function setCouponStatus(form: FormData): Promise<void>;
```

Same `guard()`/`text()`/`uuid()` helpers as `clientes/actions.ts` and `servicos/actions.ts` (copy the pattern, not the code — each file already does this locally). Each action reads the admin's email from `getAdmin()` and passes it as `adminEmail` into Tasks 5/6's functions; `setRepresentativeStatus`/`setCouponStatus` read `id` and `active` (`"yes"`/`"no"`) from the form, same shape as `clientes/actions.ts::archive`. `revalidatePath("/cobrancas/representantes")` after every write.

- [ ] **Step 3: Implement `src/app/(care)/cobrancas/representantes/page.tsx`**

Same shell as `servicos/page.tsx` (`getAdmin`/`SignIn` gate, `Wordmark`, nav, sign-out form). For each representative: `RepresentativeForm` (edit, collapsed behind a `<details>` like `clientes/page.tsx` does), its coupons (`listCouponsByRepresentative`), a `CouponForm` to add a new one, and — for each coupon — the stats row from `representativeStats(chargesForRepresentative(representative.id))` (computed once per representative, reused for every coupon's "cupons ativos" count via a simple `.filter(c => c.active).length` over the already-fetched list) plus the share block: `shareMessage(representative.name, coupon.code)` rendered with `<CopyLink>` (existing component) and a `waLink` anchor, mirroring exactly how `ChargeForm.tsx` shows its own result panel today. A "Novo representante" section at the bottom, same position as `clientes/page.tsx`'s "Novo cliente".

- [ ] **Step 4: Add the nav link to the three existing pages**

In `clientes/page.tsx`, `servicos/page.tsx`, and `lancamentos/page.tsx`, add one `<Link href="/cobrancas/representantes" className={styles.ghost}>Representantes</Link>` inside the existing `<nav aria-label="Wuavy Cobranças">` block in each file (same duplicated-nav pattern those three files already use for each other).

- [ ] **Step 5: Verify**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npx tsc --noEmit && npx eslint`
Expected: no errors.

---

### Task 9: Coupon field on `addCharge` and `ChargeForm`

**Files:**
- Modify: `src/app/(care)/cobrancas/lancamentos/actions.ts`
- Modify: `src/components/billing/ChargeForm.tsx`

**Interfaces:**
- Consumes: `resolveCoupon`, `COUPON_REJECT_MESSAGE` (Task 2); `lookupCouponByCode`, `couponChargeHistory` (Task 6); `waLink` (Task 8's new `whatsapp.ts`).
- Produces: `ChargeState` grows two fields (`discountCents`, `originalAmountCents`) that this task's own `ChargeForm.tsx` edit consumes — no other task depends on this one.

- [ ] **Step 1: Extend `ChargeState` and `addCharge` in `lancamentos/actions.ts`**

```ts
export type ChargeState =
  | { ok: true; url: string; description: string; amountCents: number; discountCents: number; originalAmountCents: number; clientWhatsapp: string | null }
  | { ok: false; error: string }
  | null;
```

In `addCharge`, extend the existing service select (where `serviceId` is looked up) to also read `kind`, and after `amountCents` is parsed but before the `billing_charges` insert:

```ts
const couponCode = text(form, "coupon_code", 20);
const coupon = couponCode ? await lookupCouponByCode(couponCode) : null;
if (couponCode && !coupon) return { ok: false, error: COUPON_REJECT_MESSAGE["not-found"] };
const history = coupon ? await couponChargeHistory(coupon.coupon.id) : [];
const resolution = resolveCoupon({
  couponCode: couponCode ?? null,
  coupon: coupon?.coupon ?? null,
  eligibleServiceIds: coupon?.eligibleServiceIds ?? [],
  chargeHistory: history,
  nowMs: Date.now(),
  amountCents,
  serviceId,
  serviceKind: service?.kind ?? null,
});
if (!resolution.applied && "error" in resolution) return { ok: false, error: resolution.error };
const finalAmountCents = resolution.applied ? resolution.finalCents : amountCents;
const discountCents = resolution.applied ? resolution.discountCents : 0;
const couponId = resolution.applied ? coupon!.coupon.id : null;
```

`finalAmountCents` replaces the bare `amountCents` used in the `billing_charges` insert and in `createPreference`'s `amountCents` argument; the insert also gains `coupon_id: couponId, discount_cents: discountCents`. The success return gains `discountCents` and `originalAmountCents: finalAmountCents + discountCents`.

- [ ] **Step 2: Add the field and breakdown to `ChargeForm.tsx`**

Add one optional input after "Valor (R$)": `<input name="coupon_code" className={styles.input} maxLength={20} placeholder="BRU10" />` under a label "Cupom (opcional)". Replace the local `waLink` definition with `import { waLink } from "@/lib/billing/whatsapp"`. In the `state?.ok` result panel, when `state.discountCents > 0`, show the three numbers (`brl(state.originalAmountCents)` → `-${brl(state.discountCents)}` → `brl(state.amountCents)`) instead of just the single amount it shows today; when `state.discountCents === 0`, keep today's single-line display unchanged.

- [ ] **Step 3: Verify**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npx tsc --noEmit && npx eslint`
Expected: no errors.

---

### Task 10: Whole-worktree verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && node --test tests/*.test.mjs`
Expected: PASS — the 227 tests from the clean baseline, plus every case added in Tasks 2 and 3.

- [ ] **Step 2: Run the full check**

Run: `cd "C:/Users/User/wuavy-billing-coupons" && npm run check`
Expected: `tsc --noEmit`, `eslint`, and `next build` all pass with no errors.

- [ ] **Step 3: Report, do not commit**

Summarize what changed and confirm the migration (Task 1) was not applied to any Supabase project and no Mercado Pago credential was touched. Stop and wait for explicit authorization before any `git add`/`commit`/`push`.

---

## Self-Review

**Spec coverage:** every section of the design doc maps to a task — data model → Task 1; server-side-only calculation and all five rejection points → Task 2; `max_uses` concurrency rule → Task 2 (`effectiveUses`); recurrence separation guard → Task 2 (`service-recurring`); dashboard numbers with no double-counting → Task 3; cascading deactivation asymmetry → Task 5; per-coupon sharing → Tasks 3 (message) and 8 (link, UI); file-by-file list → Tasks 1–9 cover every row.

**Type consistency:** `CouponRow`/`Coupon`/`RepresentativeChargeRow`/`ChargeBucket`/`Representative` are defined once (Tasks 2, 3, 5, 6) and only ever imported by later tasks, never redefined; `resolveCoupon`'s return shape (`ResolveCouponResult`) is the same shape Task 9 destructures.

**Review Focus:** all five items above are covered by Task 2's tests directly, except the fifth (reactivation not reactivating coupons), which is a Task 5 behavior with no DB to test against locally — it is pinned instead as an explicit, literal line in Task 5's Step 1 body description, the same way every other Supabase-touching behavior in this plan is specified without a runnable test.

**Proportion:** this plan is longer than the design doc because it carries exact signatures and test bodies the doc only described in prose — each code block is either a test (asserts the doc's own examples) or a signature with no implied body beyond what Task 2/3's "Notes on the body" paragraph states.
