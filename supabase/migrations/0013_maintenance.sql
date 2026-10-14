-- Wuavy 0013: assinaturas de manutenção de sites. Mirrors src/lib/maintenance/.
-- A product of its own, next to the Pulse and never inside it: separate
-- tables, a separate webhook, its own price. The Pulse's `subscriptions`
-- (migration 0003) is not touched here.
--
-- Additive: creates three tables and nothing else. Not applied yet: review
-- before running.

-- ── Clients ───────────────────────────────────────────────────
-- One row per site we maintain. `token` is the client's individual link
-- (/manutencao/<token>): a random string, the only thing that opens their
-- subscription page, so a client needs no account to authorize the charge.
-- `price_cents` is what this client pays: 4000 (R$ 40) is the standard plan,
-- and the administrator may set another.
create table maintenance_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  site_url text check (site_url is null or site_url ~ '^https?://'),
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  whatsapp text,
  notes text,
  plan_name text not null default 'Manutenção Essencial',
  -- In cents, so no money is ever a float. R$ 40/month is the default plan.
  price_cents integer not null default 4000 check (price_cents between 500 and 1000000),
  token text not null unique check (token ~ '^[a-z0-9]{16,64}$'),
  created_at timestamptz not null default now(),
  -- A client we no longer maintain. Their rows stay; nothing is deleted.
  archived_at timestamptz
);

create index maintenance_clients_live on maintenance_clients (created_at desc) where archived_at is null;

-- ── Subscriptions ─────────────────────────────────────────────
-- The monthly charge the client authorized at Mercado Pago. Only the server
-- writes these rows: the client's page creates one as 'pending' and the
-- status comes from what Mercado Pago reports, never from the browser.
-- `amount_cents` is frozen at creation: changing a client's price does not
-- change what a live subscription charges (Mercado Pago holds that value).
create table maintenance_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references maintenance_clients on delete cascade,
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  -- The Mercado Pago preapproval id; unique, so a repeated webhook finds the same row.
  provider_subscription_id text unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled')),
  amount_cents integer not null check (amount_cents between 500 and 1000000),
  started_at timestamptz,
  -- The next charge, as Mercado Pago reports it: the panel's "vencimento".
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_subscriptions_client on maintenance_subscriptions (client_id, created_at desc);

-- A client has at most one subscription that is not cancelled.
create unique index maintenance_subscriptions_one_live on maintenance_subscriptions (client_id)
  where status <> 'cancelled';

-- ── Payments ──────────────────────────────────────────────────
-- Every monthly charge Mercado Pago reports for one of our subscriptions.
-- The history the panel shows. provider_payment_id is unique, so the same
-- notice twice writes the same row.
create table maintenance_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references maintenance_subscriptions on delete cascade,
  provider_payment_id text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  -- As Mercado Pago reports it: scheduled, processed, recycling, cancelled…
  status text not null,
  -- Whether that status means the money came in.
  paid boolean not null default false,
  charged_at timestamptz,
  created_at timestamptz not null default now()
);

create index maintenance_payments_subscription on maintenance_payments (subscription_id, charged_at desc);

-- ── Who may read ──────────────────────────────────────────────
-- Nobody, with an anon or signed-in key. Row-level security is on and there
-- are no policies: these three tables are reached only by the server, with
-- the service role (src/lib/maintenance/db.ts) — the client's page through
-- the random token in its URL, the panel through an administrator's session.
alter table maintenance_clients enable row level security;
alter table maintenance_subscriptions enable row level security;
alter table maintenance_payments enable row level security;
