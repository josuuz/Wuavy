-- Wuavy Pulse 0017: a legacy clinic's transition onto real billing. Mirrors
-- src/lib/flow/access.ts (clinicAccess, Standing), src/lib/flow/billing.ts
-- (syncStanding) and src/app/(app)/pulse/assinar/actions.ts (subscribe).
--
-- Five clinics today have no row in `subscriptions` at all and run on
-- clinicAccess's "no row" exception, from before this table existed
-- (migration 0003). The moment one of them starts a real checkout, a
-- `pending` row is inserted for their organization before Mercado Pago ever
-- answers — and clinicAccess, reading a real status for the first time,
-- would make them read-only mid-attempt. These columns let that one row say,
-- explicitly, that it is a legacy transition still in progress, so
-- clinicAccess can keep full access until there is real evidence of payment.
--
-- Additive: adds five columns, all nullable or defaulted, to an existing
-- table. No row is touched, no existing column changes meaning. Safe to run
-- twice. Not applied yet: review before running, on the isolated test
-- project first.

alter table subscriptions
  -- Set once, at insert, only when the clinic already has a member but its
  -- search for a subscription found none (src/lib/flow/access.ts
  -- isLegacyTransition). Never set for a brand-new sign-up, which has no
  -- clinic yet. Default false: every subscription that exists before this
  -- migration, and every ordinary new one after it, is unaffected.
  add column if not exists legacy_access_transition boolean not null default false,
  -- Set once, by syncStanding, the first time /authorized_payments/search
  -- shows a charge on this row whose own `payment.status` is "approved" —
  -- never from the subscription's `status` (pending/authorized/active),
  -- which only says Mercado Pago accepted the card to charge later, not
  -- that it has. Null until then; never cleared once set.
  add column if not exists first_payment_confirmed_at timestamptz,
  -- An administrative decision to end the transition's protection without a
  -- confirmed charge (e.g. the clinic settled another way), made directly
  -- against the database and never through the app in this phase. Kept
  -- apart from first_payment_confirmed_at so a real charge and a human's
  -- call are never the same fact.
  add column if not exists legacy_transition_cleared_at timestamptz,
  add column if not exists legacy_transition_cleared_by uuid,
  add column if not exists legacy_transition_cleared_reason text
    check (legacy_transition_cleared_reason is null or char_length(legacy_transition_cleared_reason) <= 500);

comment on column subscriptions.legacy_access_transition is
  'True only for the one row created when an already-running clinic with no prior subscription starts paying; false for every other row, old or new.';
comment on column subscriptions.first_payment_confirmed_at is
  'Set once by syncStanding on real evidence of an approved charge (payment.status = approved) for a legacy_access_transition row. Never read from status/authorized/active/started_at.';
comment on column subscriptions.legacy_transition_cleared_at is
  'An explicit, auditable administrative decision to end the transition without a confirmed charge. Set by hand against the database, never by the app.';
