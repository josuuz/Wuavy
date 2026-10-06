-- Wuavy Pulse 0009: the team, the conversation history and the visit's money. Run after 0008.
-- Additive and safe to run twice: no row is deleted, every existing member stays the owner
-- they are, and the app as deployed before this migration keeps working (0010 tightens
-- what only the new app respects; run it after deploying).
--
--  1. Members get a status (invited, active, disabled) and an e-mail. Only active members
--     reach a clinic's data: disabling someone ends their access at once and keeps every
--     record they wrote. A person belongs to one clinic at a time.
--  2. Row-level security by role. Owner: everything. Front desk (reception): agenda,
--     patients, sales, conversations, stock; never clinical records, costs or the team.
--     Professional: their own agenda and its patients, procedures, clinical records;
--     never sales, conversations, costs or the team.
--  3. Who did what: created_by / updated_by, stamped by the database from the signed-in
--     person (never from the request) on bookings, patients, contacts, stock, records
--     and the activity log.
--  4. Conversations: the clinic's own history with each person (manual entries, calls,
--     notes, and later WhatsApp), one conversation per person, kept when a contact
--     becomes a patient.
--  5. The visit's money, frozen when it is finished: price charged, discount, the cost
--     of each product at that moment, gross profit and margin. A later change in a
--     product's cost never rewrites the past. Finishing, undoing and deleting a visit
--     run in one transaction each (stock, snapshot, patient summary, log), in the
--     functions below.
--
-- Times follow the Pulse's convention (lib/flow/clock.ts): domain times (a visit, a
-- message, the activity log) are the clinic's wall clock written as UTC; audit times
-- (created_at, updated_at, completed_at) are real UTC.

-- ── 0. The clinic's clock ─────────────────────────────────────
create or replace function pulse_now() returns timestamptz
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo') at time zone 'UTC';
$$;

create or replace function pulse_today() returns date
language sql stable set search_path = public as $$
  select (pulse_now() at time zone 'UTC')::date;
$$;

-- ── 1. Members ────────────────────────────────────────────────
alter table members
  add column if not exists status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  add column if not exists email text check (email is null or char_length(email) <= 320),
  add column if not exists invited_by uuid,
  add column if not exists invited_at timestamptz,
  add column if not exists joined_at timestamptz,
  add column if not exists disabled_at timestamptz;
alter table members add column if not exists created_at timestamptz;
alter table members alter column created_at set default now();

-- The members from before: their e-mail, and the day they joined (their clinic's).
update members m set email = u.email from auth.users u where u.id = m.user_id and m.email is null;
update members m set joined_at = o.created_at, created_at = coalesce(m.created_at, o.created_at)
from organizations o where o.id = m.organization_id and m.status = 'active' and m.joined_at is null;

-- One clinic at a time: at most one membership invited or active per person.
create unique index if not exists members_one_live_clinic on members (user_id) where status in ('invited', 'active');

-- ── 2. Who may do what ────────────────────────────────────────
-- The signed-in person's role at a clinic, while active; null for anyone else.
create or replace function pulse_role(org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from members where organization_id = org and user_id = auth.uid() and status = 'active';
$$;

create or replace function is_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where organization_id = org and user_id = auth.uid() and status = 'active');
$$;

create or replace function is_owner(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members where organization_id = org and user_id = auth.uid() and status = 'active' and role = 'owner'
  );
$$;

-- The front office: the owner and the reception (sales, conversations, the agenda's bookings).
create or replace function is_staff(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members where organization_id = org and user_id = auth.uid() and status = 'active'
      and role in ('owner', 'reception')
  );
$$;

create or replace function can_record(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members where organization_id = org and user_id = auth.uid() and status = 'active'
      and role in ('owner', 'professional')
  );
$$;

-- A patient the signed-in person may see: all of them for the front office; for a
-- professional, those with a visit booked with them or not assigned to anyone yet.
create or replace function sees_patient(org uuid, patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case pulse_role(org)
    when 'owner' then true
    when 'reception' then true
    when 'professional' then exists (
      select 1 from appointments a
      where a.organization_id = org and a.patient_id = patient
        and (a.professional_id = auth.uid() or a.professional_id is null)
    )
    else false
  end;
$$;

create index if not exists appointments_patient on appointments (organization_id, patient_id);
create index if not exists appointments_professional on appointments (organization_id, professional_id);

-- Read by every member, written by the owner: the clinic's catalogue and its automations.
do $$
declare t text;
begin
  foreach t in array array['procedures', 'procedure_products', 'automation_rules', 'automation_runs'] loop
    execute format('drop policy if exists "members only" on %I', t);
    execute format('drop policy if exists "members read" on %I', t);
    execute format('drop policy if exists "owners write" on %I', t);
    execute format('create policy "members read" on %I for select using (is_member(organization_id))', t);
    execute format(
      'create policy "owners write" on %I for all using (is_owner(organization_id)) with check (is_owner(organization_id))', t
    );
  end loop;
end $$;

-- Read by every member, written by the front office: the stock.
do $$
declare t text;
begin
  foreach t in array array['products', 'inventory_lots'] loop
    execute format('drop policy if exists "members only" on %I', t);
    execute format('drop policy if exists "members read" on %I', t);
    execute format('drop policy if exists "staff write" on %I', t);
    execute format('create policy "members read" on %I for select using (is_member(organization_id))', t);
    execute format(
      'create policy "staff write" on %I for all using (is_staff(organization_id)) with check (is_staff(organization_id))', t
    );
  end loop;
end $$;

-- The front office only: sales, the waiting list, opportunities.
do $$
declare t text;
begin
  foreach t in array array['leads', 'waitlist_entries', 'opportunities'] loop
    execute format('drop policy if exists "members only" on %I', t);
    execute format('drop policy if exists "staff only" on %I', t);
    execute format(
      'create policy "staff only" on %I for all using (is_staff(organization_id)) with check (is_staff(organization_id))', t
    );
  end loop;
end $$;

-- Patients: seen as above; registered and edited by the front office; deleted by the owner only
-- (deleting one takes their visits and records with it).
drop policy if exists "members only" on patients;
drop policy if exists "who sees" on patients;
drop policy if exists "staff add" on patients;
drop policy if exists "staff edit" on patients;
drop policy if exists "owners delete" on patients;
create policy "who sees" on patients for select using (sees_patient(organization_id, id));
create policy "staff add" on patients for insert with check (is_staff(organization_id));
create policy "staff edit" on patients for update using (is_staff(organization_id)) with check (is_staff(organization_id));
create policy "owners delete" on patients for delete using (is_owner(organization_id));

-- The agenda: the front office books and sees it all; a professional sees their own visits and
-- the ones not assigned yet. Status changes go through pulse_set_appointment_status (below).
drop policy if exists "members only" on appointments;
drop policy if exists "who sees" on appointments;
drop policy if exists "staff book" on appointments;
drop policy if exists "staff edit" on appointments;
drop policy if exists "staff delete" on appointments;
create policy "who sees" on appointments for select using (
  is_staff(organization_id)
  or (pulse_role(organization_id) = 'professional' and (professional_id = auth.uid() or professional_id is null))
);
-- A booking starts open; a visit from before the Pulse may be written as done, in the past.
create policy "staff book" on appointments for insert with check (
  is_staff(organization_id)
  and (status in ('agendado', 'confirmado') or (status = 'concluido' and starts_at < pulse_today()::timestamp at time zone 'UTC'))
);
create policy "staff edit" on appointments for update using (is_staff(organization_id)) with check (is_staff(organization_id));
-- A finished visit has a cost snapshot and moved stock: only pulse_delete_appointment removes it.
create policy "staff delete" on appointments for delete using (is_staff(organization_id) and status <> 'concluido');

-- The activity log: the front office reads it (it names patients); anyone active writes to it.
drop policy if exists "members only" on activities;
drop policy if exists "staff read" on activities;
drop policy if exists "members write" on activities;
create policy "staff read" on activities for select using (is_staff(organization_id));
create policy "members write" on activities for insert with check (is_member(organization_id));

-- Clinical records: the owner and the professionals, for the patients each one sees.
drop policy if exists "clinicians read" on clinical_records;
drop policy if exists "clinicians write" on clinical_records;
drop policy if exists "clinicians update" on clinical_records;
create policy "clinicians read" on clinical_records for select
  using (can_record(organization_id) and sees_patient(organization_id, patient_id));
create policy "clinicians write" on clinical_records for insert
  with check (can_record(organization_id) and sees_patient(organization_id, patient_id));
create policy "clinicians update" on clinical_records for update
  using (can_record(organization_id) and sees_patient(organization_id, patient_id))
  with check (can_record(organization_id) and sees_patient(organization_id, patient_id));

-- Members: the active team sees itself; anyone sees their own memberships (an invitation, an
-- access ended); each active member edits only their own name. Invitations, roles and
-- access go through the functions below and the server.
drop policy if exists "own memberships" on members;
create policy "own memberships" on members for select using (user_id = auth.uid());
drop policy if exists "self update" on members;
create policy "self update" on members for update
  using (user_id = auth.uid() and status = 'active') with check (user_id = auth.uid() and status = 'active');

-- Nothing in the app truncates or adds triggers; nobody signed out reaches a table.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- A product's cost is the owner's to change (the front office may set it when registering
-- one, from the invoice in hand). 0010 also hides it from them.
create or replace function pulse_guard_product_cost() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.unit_cost is distinct from old.unit_cost and auth.uid() is not null and not is_owner(new.organization_id) then
    raise exception 'pulse: only the owner changes costs' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists pulse_guard_product_cost on products;
create trigger pulse_guard_product_cost before update on products
  for each row execute function pulse_guard_product_cost();

-- ── 3. Who did what ───────────────────────────────────────────
alter table appointments add column if not exists created_at timestamptz;
alter table appointments alter column created_at set default now();
alter table appointments
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

alter table patients add column if not exists created_at timestamptz;
alter table patients alter column created_at set default now();
alter table patients
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

alter table leads
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

alter table products add column if not exists created_at timestamptz;
alter table products alter column created_at set default now();
alter table products
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

alter table inventory_lots add column if not exists created_at timestamptz;
alter table inventory_lots alter column created_at set default now();
alter table inventory_lots
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

alter table clinical_records add column if not exists updated_by uuid;
alter table activities add column if not exists actor_id uuid;

-- The author is whoever is signed in. The server's own writes (no session) keep what they say.
-- Authorship stays when someone is disabled: members are never deleted.
create or replace function pulse_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'clinical_records' then
      new.author_id := coalesce(auth.uid(), new.author_id);
    elsif tg_table_name = 'activities' then
      new.actor_id := coalesce(auth.uid(), new.actor_id);
    else
      new.created_by := coalesce(auth.uid(), new.created_by);
    end if;
    return new;
  end if;
  if tg_table_name = 'clinical_records' then
    new.author_id := old.author_id;
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['appointments', 'patients', 'leads', 'products', 'inventory_lots', 'clinical_records'] loop
    execute format('drop trigger if exists pulse_stamp on %I', t);
    execute format('create trigger pulse_stamp before insert or update on %I for each row execute function pulse_stamp()', t);
  end loop;
end $$;
drop trigger if exists pulse_stamp on activities;
create trigger pulse_stamp before insert on activities for each row execute function pulse_stamp();

-- ── 4. Conversations ──────────────────────────────────────────
create unique index if not exists leads_org_id on leads (organization_id, id);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  lead_id uuid,
  patient_id uuid,
  status text not null default 'aberta' check (status in ('aberta', 'aguardando_cliente', 'follow_up', 'resolvida')),
  assigned_user_id uuid,
  follow_up_at timestamptz,
  -- The latest entry, for the list (kept by pulse_conversation_touch).
  last_message_at timestamptz,
  last_message_preview text,
  last_direction text check (last_direction is null or last_direction in ('in', 'out', 'note')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  check (lead_id is not null or patient_id is not null),
  unique (organization_id, id),
  foreign key (organization_id, lead_id) references leads (organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete cascade
);

-- One conversation per person: by patient once they are one, by contact before.
create unique index if not exists conversations_patient on conversations (organization_id, patient_id) where patient_id is not null;
create unique index if not exists conversations_lead on conversations (organization_id, lead_id) where lead_id is not null;
create index if not exists conversations_recent on conversations (organization_id, last_message_at desc nulls last);

-- Each entry of the history. "in": the person to the clinic; "out": the clinic to the person;
-- "note": internal, never sent. The channel says how it happened: registered by hand
-- (manual, phone, whatsapp_manual), an internal note, or, once integrated, received or sent
-- by WhatsApp itself ('whatsapp', which only the server writes, with its provider id).
create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out', 'note')),
  channel text not null check (channel in ('manual', 'internal_note', 'phone', 'whatsapp_manual', 'whatsapp')),
  body text not null check (char_length(body) between 1 and 4000),
  -- When it happened, on the clinic's wall clock: sent_at for "out", received_at for "in".
  occurred_at timestamptz not null default pulse_now(),
  author_id uuid,
  delivery_status text check (delivery_status is null or delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  provider text check (provider is null or provider in ('whatsapp_cloud')),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  created_at timestamptz not null default now(),
  check ((direction = 'note') = (channel = 'internal_note')),
  check (channel <> 'whatsapp' or provider is not null),
  foreign key (organization_id, conversation_id) references conversations (organization_id, id) on delete cascade
);

-- The same provider message never enters twice (a webhook retried, a sync repeated).
create unique index if not exists conversation_messages_provider
  on conversation_messages (organization_id, provider, provider_message_id) where provider_message_id is not null;
create index if not exists conversation_messages_thread on conversation_messages (conversation_id, occurred_at desc);

alter table conversations enable row level security;
alter table conversation_messages enable row level security;
drop policy if exists "staff only" on conversations;
create policy "staff only" on conversations for all using (is_staff(organization_id)) with check (is_staff(organization_id));
drop policy if exists "staff read" on conversation_messages;
drop policy if exists "staff write" on conversation_messages;
create policy "staff read" on conversation_messages for select using (is_staff(organization_id));
-- By hand only: nobody can pass an entry off as one WhatsApp delivered.
create policy "staff write" on conversation_messages for insert with check (
  is_staff(organization_id) and channel <> 'whatsapp' and provider is null and provider_message_id is null and delivery_status is null
);

revoke all on conversations, conversation_messages from anon, authenticated;
grant select on conversations, conversation_messages to authenticated;
grant insert (organization_id, lead_id, patient_id, status, assigned_user_id, follow_up_at) on conversations to authenticated;
grant update (status, assigned_user_id, follow_up_at) on conversations to authenticated;
grant insert (organization_id, conversation_id, direction, channel, body) on conversation_messages to authenticated;

-- The conversation's list line follows its latest entry.
create or replace function pulse_conversation_touch(conversation uuid) returns void
language sql security definer set search_path = public as $$
  update conversations c set
    last_message_at = m.occurred_at,
    last_message_preview = left(m.body, 160),
    last_direction = m.direction
  from (
    select occurred_at, body, direction from conversation_messages
    where conversation_id = conversation order by occurred_at desc, created_at desc limit 1
  ) m
  where c.id = conversation;
$$;

create or replace function pulse_message_written() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pulse_conversation_touch(new.conversation_id);
  return new;
end $$;

create or replace function pulse_message_author() returns trigger
language plpgsql set search_path = public as $$
begin
  new.author_id := coalesce(auth.uid(), new.author_id);
  return new;
end $$;

drop trigger if exists pulse_message_author on conversation_messages;
create trigger pulse_message_author before insert on conversation_messages
  for each row execute function pulse_message_author();
drop trigger if exists pulse_message_written on conversation_messages;
create trigger pulse_message_written after insert on conversation_messages
  for each row execute function pulse_message_written();

drop trigger if exists pulse_stamp on conversations;
create trigger pulse_stamp before insert or update on conversations for each row execute function pulse_stamp();

-- A contact who becomes a patient keeps their conversation: it is now the patient's. If the
-- patient already had one, the two histories become one.
create or replace function pulse_conversation_follows_lead() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  of_lead uuid;
  of_patient uuid;
begin
  if new.patient_id is null or new.patient_id is not distinct from old.patient_id then
    return new;
  end if;
  select id into of_lead from conversations where organization_id = new.organization_id and lead_id = new.id;
  if of_lead is null then
    return new;
  end if;
  select id into of_patient from conversations where organization_id = new.organization_id and patient_id = new.patient_id;
  if of_patient is null then
    update conversations set patient_id = new.patient_id where id = of_lead and patient_id is null;
  elsif of_patient <> of_lead then
    update conversation_messages set conversation_id = of_patient where conversation_id = of_lead;
    delete from conversations where id = of_lead;
    update conversations set lead_id = coalesce(lead_id, new.id) where id = of_patient;
    perform pulse_conversation_touch(of_patient);
  end if;
  return new;
end $$;

drop trigger if exists pulse_conversation_follows_lead on leads;
create trigger pulse_conversation_follows_lead after update of patient_id on leads
  for each row execute function pulse_conversation_follows_lead();

-- A contact deleted from Vendas who never became a patient takes their history with them.
create or replace function pulse_conversation_lead_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from conversations where organization_id = old.organization_id and lead_id = old.id and patient_id is null;
  return old;
end $$;

drop trigger if exists pulse_conversation_lead_gone on leads;
create trigger pulse_conversation_lead_gone before delete on leads
  for each row execute function pulse_conversation_lead_gone();

-- ── 5. The visit's money ──────────────────────────────────────
create unique index if not exists appointments_org_id on appointments (organization_id, id);

-- On the visit itself (the front office sees what was charged): written only by the functions below.
alter table appointments
  add column if not exists price_charged integer check (price_charged is null or price_charged >= 0),
  add column if not exists discount integer check (discount is null or discount >= 0),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

-- The snapshot taken when the visit was finished: the owner's only.
create table if not exists appointment_financials (
  appointment_id uuid primary key,
  organization_id uuid not null references organizations on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid,
  -- The procedure's price that day, what was taken off, and what was charged.
  list_price integer not null check (list_price >= 0),
  discount integer not null default 0 check (discount >= 0),
  price_charged integer not null check (price_charged >= 0),
  -- The products used, at their cost that day (appointment_supplies holds each one).
  total_cost integer not null check (total_cost >= 0),
  gross_profit integer not null,
  -- Percent of the price charged; null when nothing was charged.
  gross_margin numeric,
  foreign key (organization_id, appointment_id) references appointments (organization_id, id) on delete cascade
);
create index if not exists appointment_financials_org on appointment_financials (organization_id);

create table if not exists appointment_supplies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  appointment_id uuid not null,
  product_id uuid,
  -- The product as it was: its name and unit stay even if it is renamed or deleted.
  product_name text not null,
  unit text not null,
  quantity_used numeric(10, 3) not null check (quantity_used > 0),
  unit_cost_snapshot integer not null check (unit_cost_snapshot >= 0),
  total_cost_snapshot integer not null check (total_cost_snapshot >= 0),
  -- What actually left the stock (less than used when the stock was short): what undoing returns.
  stock_drawn numeric(10, 3) not null default 0 check (stock_drawn >= 0),
  foreign key (organization_id, appointment_id) references appointments (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references products (organization_id, id) on delete set null (product_id)
);
create index if not exists appointment_supplies_appointment on appointment_supplies (appointment_id);

alter table appointment_financials enable row level security;
alter table appointment_supplies enable row level security;
drop policy if exists "owners read" on appointment_financials;
drop policy if exists "owners read" on appointment_supplies;
create policy "owners read" on appointment_financials for select using (is_owner(organization_id));
create policy "owners read" on appointment_supplies for select using (is_owner(organization_id));
revoke all on appointment_financials, appointment_supplies from anon, authenticated;
grant select on appointment_financials, appointment_supplies to authenticated;

-- What the app may write on a visit directly. The snapshot's columns are written only by the
-- functions below; 0010 also takes `status` away (it changes only through them).
revoke insert, update on appointments from anon, authenticated;
grant insert (
  id, organization_id, patient_id, procedure_id, professional_id, starts_at, duration_min, status,
  deposit_cents, deposit_due, deposit_paid_at, deposit_percent, deposit_provider, deposit_payment_id
) on appointments to authenticated;
grant update (
  patient_id, procedure_id, professional_id, starts_at, duration_min, status,
  deposit_cents, deposit_due, deposit_paid_at, deposit_percent, deposit_provider, deposit_payment_id
) on appointments to authenticated;

-- Takes `amount` of a product from its lots, the one expiring first going first, never an
-- expired one (insights.ts drawDown). Returns what it could take.
create or replace function pulse_draw_stock(org uuid, product uuid, amount numeric) returns numeric
language plpgsql set search_path = public as $$
declare
  lot record;
  need numeric := amount;
  took numeric := 0;
  take numeric;
begin
  for lot in
    select id, quantity from inventory_lots
    where organization_id = org and product_id = product and quantity > 0 and expires_at >= pulse_today()
    order by expires_at, id
    for update
  loop
    exit when need <= 0;
    take := least(lot.quantity, need);
    update inventory_lots set quantity = round(quantity - take, 3) where id = lot.id;
    need := need - take;
    took := took + take;
  end loop;
  return round(took, 3);
end $$;

-- Gives a finished visit's products back (to the lot in date that expires first, or the last
-- one) and forgets its snapshot (insights.ts restock).
create or replace function pulse_return_supplies(org uuid, appointment uuid) returns void
language plpgsql set search_path = public as $$
declare
  s record;
  target uuid;
begin
  for s in
    select product_id, stock_drawn from appointment_supplies
    where organization_id = org and appointment_id = appointment and product_id is not null and stock_drawn > 0
  loop
    select id into target from inventory_lots
    where organization_id = org and product_id = s.product_id
    order by (expires_at < pulse_today()), case when expires_at >= pulse_today() then expires_at end, expires_at desc
    limit 1;
    if target is not null then
      update inventory_lots set quantity = quantity + s.stock_drawn where id = target;
    end if;
  end loop;
  delete from appointment_supplies where organization_id = org and appointment_id = appointment;
  delete from appointment_financials where organization_id = org and appointment_id = appointment;
end $$;

-- A patient's visits, spend and next return, from their finished visits (insights.ts
-- visitSummary). The spend is what was charged, or the procedure's price for a visit
-- from before the snapshot.
create or replace function pulse_sync_patient(org uuid, patient uuid) returns void
language plpgsql set search_path = public as $$
declare
  first_at timestamptz;
  last_at timestamptz;
  spent bigint;
  next_at timestamptz;
begin
  select min(a.starts_at), max(a.starts_at), coalesce(sum(coalesce(a.price_charged, p.price, 0)), 0)
  into first_at, last_at, spent
  from appointments a
  left join procedures p on p.id = a.procedure_id
  where a.organization_id = org and a.patient_id = patient and a.status = 'concluido';

  select a.starts_at + make_interval(days => coalesce(p.return_days, 0)) into next_at
  from appointments a
  left join procedures p on p.id = a.procedure_id
  where a.organization_id = org and a.patient_id = patient and a.status = 'concluido'
  order by a.starts_at desc
  limit 1;

  update patients
  set first_visit_at = first_at, last_visit_at = last_at, next_return_at = next_at, total_spent = least(spent, 2147483647)::integer
  where id = patient and organization_id = org;
end $$;

-- Finishes a visit: takes its products from the stock and freezes its money at today's costs.
-- `charged`: what the patient paid (the procedure's price when not given). `supplies`: the
-- products actually used, [{"product_id": "…", "quantity": 0.3}] (the procedure's own when not given).
create or replace function pulse_complete_appointment(a appointments, charged integer, supplies jsonb) returns void
language plpgsql set search_path = public as $$
declare
  item record;
  prod record;
  line integer;
  drawn numeric;
  total integer := 0;
  list integer;
  paid integer;
begin
  select price into list from procedures where id = a.procedure_id and organization_id = a.organization_id;
  list := coalesce(list, 0);
  paid := coalesce(charged, list);
  if paid < 0 or paid > 100000000 then
    raise exception 'pulse: invalid price' using errcode = '23514';
  end if;
  if supplies is not null and jsonb_typeof(supplies) <> 'array' then
    raise exception 'pulse: invalid supplies' using errcode = '22023';
  end if;

  for item in
    select x.product_id, round(sum(x.quantity), 3) as quantity
    from (
      select (e->>'product_id')::uuid as product_id, (e->>'quantity')::numeric as quantity
      from jsonb_array_elements(coalesce(supplies, '[]'::jsonb)) e
      where supplies is not null
      union all
      select pp.product_id, pp.quantity
      from procedure_products pp
      where supplies is null and pp.organization_id = a.organization_id and pp.procedure_id = a.procedure_id
    ) x
    group by x.product_id
    having round(sum(x.quantity), 3) > 0
  loop
    if item.quantity > 9999999 then
      raise exception 'pulse: invalid quantity' using errcode = '23514';
    end if;
    select id, name, unit, unit_cost into prod from products where id = item.product_id and organization_id = a.organization_id;
    if not found then
      raise exception 'pulse: unknown product' using errcode = '23503';
    end if;
    line := round(item.quantity * prod.unit_cost);
    drawn := pulse_draw_stock(a.organization_id, prod.id, item.quantity);
    insert into appointment_supplies (
      organization_id, appointment_id, product_id, product_name, unit,
      quantity_used, unit_cost_snapshot, total_cost_snapshot, stock_drawn
    ) values (
      a.organization_id, a.id, prod.id, prod.name, prod.unit, item.quantity, prod.unit_cost, line, drawn
    );
    total := total + line;
  end loop;

  insert into appointment_financials (
    appointment_id, organization_id, completed_by, list_price, discount, price_charged, total_cost, gross_profit, gross_margin
  ) values (
    a.id, a.organization_id, auth.uid(), list, greatest(list - paid, 0), paid, total, paid - total,
    case when paid > 0 then round((paid - total) * 100.0 / paid, 2) end
  );
  update appointments
  set price_charged = paid, discount = greatest(list - paid, 0), completed_at = now(), completed_by = auth.uid()
  where id = a.id;
end $$;

-- Every change of a visit's status, in one transaction: undoing a finished visit gives its
-- products back and drops its snapshot; finishing one takes the snapshot; the patient's
-- summary and the activity log follow. The front office changes any visit; a professional
-- their own (or unassigned) ones, and never cancels.
create or replace function pulse_set_appointment_status(
  appointment uuid, next_status text, charged integer default null, supplies jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a appointments;
  who text;
  patient_name text;
  procedure_name text;
  said text;
begin
  select * into a from appointments where id = appointment for update;
  if not found then
    raise exception 'pulse: not found' using errcode = 'P0002';
  end if;
  who := pulse_role(a.organization_id);
  if who is null
    or (who = 'professional' and (next_status = 'cancelado' or (a.professional_id is not null and a.professional_id <> auth.uid())))
  then
    raise exception 'pulse: not allowed' using errcode = '42501';
  end if;
  if next_status not in ('agendado', 'confirmado', 'concluido', 'faltou', 'cancelado') then
    raise exception 'pulse: invalid status' using errcode = '23514';
  end if;
  if a.status = next_status then
    return;
  end if;
  -- Done or missed is said on the day or after it.
  if next_status in ('concluido', 'faltou') and (a.starts_at at time zone 'UTC')::date > pulse_today() then
    raise exception 'pulse: not yet' using errcode = '22023';
  end if;

  if a.status = 'concluido' then
    perform pulse_return_supplies(a.organization_id, a.id);
    update appointments set price_charged = null, discount = null, completed_at = null, completed_by = null where id = a.id;
  end if;
  update appointments set status = next_status where id = a.id;
  if next_status = 'concluido' then
    select * into a from appointments where id = a.id;
    perform pulse_complete_appointment(a, charged, supplies);
  end if;
  perform pulse_sync_patient(a.organization_id, a.patient_id);

  select name into patient_name from patients where id = a.patient_id;
  select name into procedure_name from procedures where id = a.procedure_id;
  said := case next_status
    when 'confirmado' then format('%s confirmou presença.', coalesce(patient_name, 'Paciente'))
    when 'concluido' then format('%s: %s finalizado. Estoque e próximo retorno atualizados.', coalesce(patient_name, 'Paciente'), coalesce(procedure_name, 'procedimento'))
    when 'faltou' then format('%s faltou ao atendimento de %s.', coalesce(patient_name, 'Paciente'), coalesce(procedure_name, 'procedimento'))
    when 'cancelado' then 'Um cancelamento abriu um horário na agenda.'
  end;
  if said is not null then
    insert into activities (organization_id, at, text) values (a.organization_id, pulse_now(), said);
  end if;
end $$;

-- Deletes a visit. A finished one only by the owner, its products back in stock first.
create or replace function pulse_delete_appointment(appointment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a appointments;
begin
  select * into a from appointments where id = appointment for update;
  if not found then
    raise exception 'pulse: not found' using errcode = 'P0002';
  end if;
  if not (is_owner(a.organization_id) or (is_staff(a.organization_id) and a.status <> 'concluido')) then
    raise exception 'pulse: not allowed' using errcode = '42501';
  end if;
  if a.status = 'concluido' then
    perform pulse_return_supplies(a.organization_id, a.id);
  end if;
  delete from appointments where id = a.id;
  perform pulse_sync_patient(a.organization_id, a.patient_id);
end $$;

-- After a visit from before the Pulse is written: the patient's summary.
create or replace function pulse_refresh_patient(patient uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  org uuid;
begin
  select organization_id into org from patients where id = patient;
  if org is null or not is_staff(org) then
    raise exception 'pulse: not allowed' using errcode = '42501';
  end if;
  perform pulse_sync_patient(org, patient);
end $$;

-- The products' costs, for the owner only (0010 hides the column from everyone else).
create or replace function pulse_product_costs(org uuid) returns table (product_id uuid, unit_cost integer)
language sql stable security definer set search_path = public as $$
  select id, unit_cost from products where organization_id = org and is_owner(org);
$$;

-- ── 6. The team ───────────────────────────────────────────────
-- The owner changes a member's name, role or access. Reactivating someone who never accepted
-- their invitation puts it back. The clinic always keeps an active owner.
create or replace function pulse_team_update(
  org uuid, member uuid, new_role text default null, new_status text default null, new_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  m members;
  remaining integer;
  status_to text;
begin
  if not is_owner(org) then
    raise exception 'pulse: not allowed' using errcode = '42501';
  end if;
  select * into m from members where organization_id = org and user_id = member for update;
  if not found then
    raise exception 'pulse: not found' using errcode = 'P0002';
  end if;
  if new_role is not null and new_role not in ('owner', 'reception', 'professional') then
    raise exception 'pulse: invalid role' using errcode = '23514';
  end if;
  if new_status is not null and new_status not in ('active', 'disabled') then
    raise exception 'pulse: invalid status' using errcode = '23514';
  end if;
  status_to := coalesce(new_status, m.status);
  if new_status = 'active' and m.joined_at is null then
    status_to := 'invited';
  end if;
  if m.role = 'owner' and m.status = 'active' and (coalesce(new_role, m.role) <> 'owner' or status_to <> 'active') then
    select count(*) into remaining from members where organization_id = org and role = 'owner' and status = 'active';
    if remaining <= 1 then
      raise exception 'pulse: last owner' using errcode = 'P0001';
    end if;
  end if;
  update members set
    role = coalesce(new_role, role),
    status = status_to,
    name = coalesce(nullif(left(trim(new_name), 120), ''), name),
    disabled_at = case when status_to = 'disabled' then coalesce(disabled_at, now()) end
  where organization_id = org and user_id = member;
end $$;

-- The invited person joins the clinic (after setting their password), with the name they confirm.
create or replace function pulse_accept_invite(org uuid, display_name text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update members set
    status = 'active',
    joined_at = now(),
    name = coalesce(nullif(left(trim(display_name), 120), ''), name)
  where organization_id = org and user_id = auth.uid() and status = 'invited';
  if not found then
    raise exception 'pulse: no invitation' using errcode = 'P0002';
  end if;
end $$;

-- The signed-in person's memberships with the clinic's name: what an invitation or an ended
-- access shows before the clinic's own rows are readable.
create or replace function pulse_my_memberships()
returns table (organization_id uuid, clinic text, role text, status text, name text, invited_by_name text)
language sql stable security definer set search_path = public as $$
  select m.organization_id, o.name, m.role, m.status, m.name,
         (select i.name from members i where i.organization_id = m.organization_id and i.user_id = m.invited_by)
  from members m
  join organizations o on o.id = m.organization_id
  where m.user_id = auth.uid();
$$;

-- For the server's invitations only (service role): whether an e-mail already has an account.
create or replace function pulse_user_by_email(lookup text) returns table (id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at from auth.users u where lower(u.email) = lower(trim(lookup)) limit 1;
$$;

-- ── 7. Who may call what ──────────────────────────────────────
revoke all on function pulse_draw_stock(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function pulse_return_supplies(uuid, uuid) from public, anon, authenticated;
revoke all on function pulse_sync_patient(uuid, uuid) from public, anon, authenticated;
revoke all on function pulse_complete_appointment(appointments, integer, jsonb) from public, anon, authenticated;
revoke all on function pulse_conversation_touch(uuid) from public, anon, authenticated;
revoke all on function pulse_user_by_email(text) from public, anon, authenticated;
grant execute on function pulse_user_by_email(text) to service_role;

revoke all on function pulse_set_appointment_status(uuid, text, integer, jsonb) from public, anon;
revoke all on function pulse_delete_appointment(uuid) from public, anon;
revoke all on function pulse_refresh_patient(uuid) from public, anon;
revoke all on function pulse_product_costs(uuid) from public, anon;
revoke all on function pulse_team_update(uuid, uuid, text, text, text) from public, anon;
revoke all on function pulse_accept_invite(uuid, text) from public, anon;
revoke all on function pulse_my_memberships() from public, anon;
grant execute on function pulse_set_appointment_status(uuid, text, integer, jsonb) to authenticated;
grant execute on function pulse_delete_appointment(uuid) to authenticated;
grant execute on function pulse_refresh_patient(uuid) to authenticated;
grant execute on function pulse_product_costs(uuid) to authenticated;
grant execute on function pulse_team_update(uuid, uuid, text, text, text) to authenticated;
grant execute on function pulse_accept_invite(uuid, text) to authenticated;
grant execute on function pulse_my_memberships() to authenticated;
