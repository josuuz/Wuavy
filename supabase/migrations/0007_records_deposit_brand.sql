-- Wuavy Pulse 0007: clinical records, the booking deposit, the product's brand. Run after 0006.
-- Additive and safe to run twice: nothing existing changes or is deleted.
--
--  1. products.brand: who makes it, for the stock's brand filter.
--  2. appointments.deposit_*: a deposit asked when booking. Only the amount,
--     the due date and when it was paid are kept; "overdue" is not stored,
--     it is read from the due date (pending and past it).
--  3. clinical_records: the patient's record (chief complaint and notes), seen
--     and written only by the clinic's owner and professionals, never by the
--     front desk. Records are not deleted from the app: a clinic keeps them.

-- ── 1. Brand ──────────────────────────────────────────────────
alter table products add column if not exists brand text check (brand is null or char_length(brand) <= 80);

-- ── 2. Deposit ────────────────────────────────────────────────
alter table appointments
  add column if not exists deposit_cents integer check (deposit_cents is null or deposit_cents > 0),
  add column if not exists deposit_due date,
  add column if not exists deposit_paid_at timestamptz;

-- ── 3. Clinical records ───────────────────────────────────────
create or replace function can_record(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members where organization_id = org and user_id = auth.uid() and role in ('owner', 'professional')
  );
$$;

create table if not exists clinical_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  patient_id uuid not null,
  recorded_at timestamptz not null default now(),
  chief_complaint text check (chief_complaint is null or char_length(chief_complaint) <= 500),
  notes text check (notes is null or char_length(notes) <= 8000),
  author_id uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete cascade
);

create index if not exists clinical_records_patient on clinical_records (organization_id, patient_id, recorded_at desc);

alter table clinical_records enable row level security;
drop policy if exists "clinicians read" on clinical_records;
drop policy if exists "clinicians write" on clinical_records;
drop policy if exists "clinicians update" on clinical_records;
create policy "clinicians read" on clinical_records for select using (can_record(organization_id));
create policy "clinicians write" on clinical_records for insert with check (can_record(organization_id));
create policy "clinicians update" on clinical_records for update
  using (can_record(organization_id)) with check (can_record(organization_id));
revoke all on clinical_records from anon;
revoke delete on clinical_records from authenticated;
