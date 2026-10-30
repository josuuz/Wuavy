-- Wuavy 0022: cupons de representantes (Wuavy Cobranças). Aditiva: três
-- tabelas novas + duas colunas em billing_charges. Não toca billing_clients,
-- billing_services, maintenance_* nem subscriptions (Pulse). Não aplicada
-- ainda: revisar antes de rodar.
--
-- Era 0020 ao ser escrita; renumerada para 0022 ao descobrir, pela checagem
-- remota (supabase migration list --project-ref wazxofdzvzfgonmwsdhs), que
-- 0020 e 0021 já estão de fato aplicadas lá — a branch
-- fix/pulse-subscription-reconciliation, sem relação com cupons, já as
-- usou. O Supabase rastreia migrations pelo número, não pelo nome do
-- arquivo: um 0020_billing_coupons.sql teria sido silenciosamente ignorado
-- por supabase db push, sem erro, sem criar nenhuma tabela.

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
