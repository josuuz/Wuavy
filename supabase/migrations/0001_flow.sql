-- Wuavy Flow: first schema. Mirrors src/lib/flow/types.ts.
-- Every table carries organization_id; row-level security lets a signed-in
-- user read and write only the organizations they belong to (members).
-- Every relationship between clinic tables is a composite (organization_id, id)
-- foreign key, so a row can never point at another organization's record.
-- Money in cents (integer). Not applied yet: review before running.

create extension if not exists "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default 'estetica',
  city text,
  created_at timestamptz not null default now()
);

-- "users": the people of a clinic, linked to Supabase Auth.
create table members (
  organization_id uuid not null references organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'reception', 'professional')),
  primary key (organization_id, user_id)
);

create or replace function is_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where organization_id = org and user_id = auth.uid());
$$;

create table procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  category text not null check (category in ('facial', 'injetaveis', 'corporal')),
  price integer not null check (price >= 0),
  duration_min integer not null check (duration_min > 0),
  return_days integer not null check (return_days > 0),
  unique (organization_id, id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  unit text not null,
  unit_cost integer not null check (unit_cost >= 0),
  unique (organization_id, id)
);

create table procedure_products (
  organization_id uuid not null references organizations on delete cascade,
  procedure_id uuid not null,
  product_id uuid not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  primary key (procedure_id, product_id),
  foreign key (organization_id, procedure_id) references procedures (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references products (organization_id, id) on delete cascade
);

create table inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  product_id uuid not null,
  lot_code text not null,
  quantity numeric(10, 3) not null check (quantity >= 0),
  expires_at date not null,
  foreign key (organization_id, product_id) references products (organization_id, id) on delete cascade
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  phone text,
  source text not null check (source in ('instagram', 'google', 'indicacao', 'whatsapp', 'site')),
  procedure_id uuid,
  potential_value integer not null default 0,
  stage text not null default 'novo'
    check (stage in ('novo', 'contato', 'avaliacao', 'orcamento', 'agendado', 'procedimento', 'retorno')),
  created_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  quote_sent_at timestamptz,
  next_action text,
  foreign key (organization_id, procedure_id) references procedures (organization_id, id) on delete set null (procedure_id)
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  phone text,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  next_return_at timestamptz,
  total_spent integer not null default 0,
  notes text, -- commercial and operational notes only, never clinical records
  unique (organization_id, id)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  patient_id uuid not null,
  procedure_id uuid not null,
  professional_id uuid,
  starts_at timestamptz not null,
  duration_min integer not null,
  status text not null default 'agendado' check (status in ('agendado', 'confirmado', 'cancelado', 'concluido')),
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete cascade,
  foreign key (organization_id, procedure_id) references procedures (organization_id, id),
  foreign key (organization_id, professional_id) references members (organization_id, user_id) on delete set null (professional_id)
);

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  patient_id uuid not null,
  procedure_id uuid not null,
  period text not null check (period in ('manha', 'tarde')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete cascade,
  foreign key (organization_id, procedure_id) references procedures (organization_id, id)
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  kind text not null check (kind in ('lead_followup', 'patient_return', 'stock_expiry', 'open_slot')),
  value integer not null default 0,
  refs uuid[] not null default '{}',
  status text not null default 'nova' check (status in ('nova', 'em_andamento', 'resolvida')),
  created_at timestamptz not null default now()
);

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  kind text not null,
  name text not null,
  "when" text not null,
  conditions text[] not null default '{}',
  actions text[] not null default '{}',
  active boolean not null default false,
  unique (organization_id, id)
);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  rule_id uuid not null,
  ran_at timestamptz not null default now(),
  summary text not null,
  recovered integer not null default 0,
  foreign key (organization_id, rule_id) references automation_rules (organization_id, id) on delete cascade
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  at timestamptz not null default now(),
  text text not null
);

-- Row-level security: the same rule on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'procedures', 'products', 'procedure_products', 'inventory_lots', 'leads', 'patients',
    'appointments', 'waitlist_entries', 'opportunities', 'automation_rules', 'automation_runs', 'activities'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "members only" on %I for all using (is_member(organization_id)) with check (is_member(organization_id))',
      t
    );
    execute format('create index on %I (organization_id)', t);
  end loop;
end $$;

alter table organizations enable row level security;
create policy "members read" on organizations for select using (is_member(id));

alter table members enable row level security;
create policy "members read" on members for select using (is_member(organization_id));
