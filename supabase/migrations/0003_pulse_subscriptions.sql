-- Wuavy Pulse 0003: subscriptions (Mercado Pago), the clinic's profile from
-- onboarding, and the opportunity engine's two new fronts. Mirrors
-- src/lib/flow/access.ts and src/lib/flow/billing.ts. Additive: no row is
-- deleted. It replaces this file's earlier draft (a 30-day trial), which was
-- never applied. Not applied yet: review before running.

-- ── Subscriptions ─────────────────────────────────────────────
-- A subscription belongs to the person who pays (user_id) and, once onboarding
-- creates the clinic, to that clinic (organization_id): the payment comes
-- before the clinic exists. One person may later pay for several clinics, and
-- a clinic may have many members; neither is limited here.
--
-- Only the server writes these rows, with the service role: the checkout
-- creates one as 'pending', and the Mercado Pago webhook (and the checkout's
-- own check) sets the status from what Mercado Pago reports. Nothing the
-- browser sends can change it. Members read their own and their clinic's.
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid references organizations on delete set null,
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  -- The Mercado Pago preapproval id; unique, so a repeated webhook finds the same row.
  provider_subscription_id text unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled')),
  started_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user on subscriptions (user_id, created_at desc);

-- A clinic has at most one subscription that is not cancelled.
create unique index subscriptions_one_live_per_clinic on subscriptions (organization_id)
  where organization_id is not null and status <> 'cancelled';

alter table subscriptions enable row level security;
create policy "own or own clinic's" on subscriptions for select
  using (user_id = auth.uid() or (organization_id is not null and is_member(organization_id)));

-- ── The clinic's profile, from onboarding ─────────────────────
-- segment already holds the kind of clinic; it now takes the onboarding's list.
alter table organizations
  add column whatsapp text,
  add column team_size text check (team_size in ('1', '2-3', '4-6', '7+')),
  add column opening_time text check (opening_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  add column closing_time text check (closing_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  -- 0 Sunday … 6 Saturday
  add column work_days smallint[] not null default '{1,2,3,4,5}',
  add column logo_url text,
  add constraint organizations_segment_check
    check (segment in ('estetica', 'odontologia', 'dermatologia', 'harmonizacao', 'multidisciplinar', 'outro'));

-- Clinic logos: public to read (they appear in the app), written only by the server.
insert into storage.buckets (id, name, public)
values ('clinic-logos', 'clinic-logos', true)
on conflict (id) do nothing;

-- ── Results and opportunities ─────────────────────────────────
-- How many people or hours an automation run brought back (insights.valueDelivered).
alter table automation_runs add column converted integer not null default 0 check (converted >= 0);

-- Two more fronts the opportunity engine reads (types.ts OpportunityKind): leads
-- stalled before a quote, and no-shows not rebooked.
alter table opportunities drop constraint if exists opportunities_kind_check;
alter table opportunities add constraint opportunities_kind_check
  check (kind in ('lead_followup', 'lead_idle', 'patient_return', 'no_show', 'stock_expiry', 'open_slot'));
