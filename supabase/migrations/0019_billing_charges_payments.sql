-- Wuavy 0019: cobranças únicas (Checkout Pro) e os pagamentos relatados
-- pelo Mercado Pago sobre elas. Etapa C do Wuavy Cobranças — ao lado das
-- tabelas da Etapa B (0018: billing_clients, billing_services) e sem tocar
-- maintenance_clients/subscriptions/payments (0013) nem as assinaturas do
-- Pulse (0003).
--
-- Additive: cria duas tabelas e nada mais. Não aplicada ainda: revisar
-- antes de rodar.
--
-- creation_claimed_at/creation_blocked_at em billing_charges foram
-- acrescentadas antes da primeira aplicação, depois da revisão de
-- idempotência ter achado a lacuna: um UPDATE sem conferir erro podia deixar
-- a Preference criada no Mercado Pago sem o id salvo aqui.

-- ── Cobranças ─────────────────────────────────────────────────────
-- Uma linha por tentativa de cobrar: nasce "pending" com amount_cents e
-- description já congelados, antes de qualquer chamada ao Mercado Pago —
-- o id desta linha é a external_reference e a chave de idempotência da
-- Preference (lib/billing/charges.ts), então repetir a criação nunca gera
-- uma segunda cobrança. service_id é só de onde veio o valor inicial: mudar
-- o preço padrão de um serviço depois nunca altera amount_cents aqui.
create table billing_charges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references billing_clients (id),
  service_id uuid references billing_services (id) on delete set null,
  -- O que o cliente vê na cobrança: o nome do serviço, ou uma descrição
  -- personalizada. Congelado na criação, como amount_cents.
  description text not null check (length(trim(description)) between 1 and 200),
  -- 'once' só: recorrência de serviços novos é trabalho de uma etapa futura.
  kind text not null default 'once' check (kind in ('once')),
  amount_cents integer not null check (amount_cents between 100 and 100000000),
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  -- O id da Preference do Checkout Pro. Único: a mesma linha nunca gera duas.
  provider_preference_id text unique,
  -- O link que o Mercado Pago devolveu (init_point ou, em teste, sandbox_init_point).
  payment_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  -- A reserva atômica antes de chamar o Mercado Pago (lib/billing/charges.ts,
  -- claimCreation): um UPDATE condicional só avança quando nenhuma outra
  -- tentativa está em andamento, então duas requisições com o mesmo id nunca
  -- criam duas Preferences. Marcada ao começar, limpa quando a criação
  -- termina (sucesso, recusa, ou bloqueio). Uma reserva velha (>30s) é
  -- considerada abandonada e pode ser reivindicada de novo.
  creation_claimed_at timestamptz,
  -- Travada depois de um resultado incerto do Mercado Pago (timeout, 5xx) ou
  -- de a Preference ter sido aceita mas a gravação local ter falhado mesmo
  -- depois das tentativas (lib/billing/create-charge.ts, runPersistPreference).
  -- Enquanto isto não for null, nenhuma criação automática é tentada de novo
  -- — só uma reconciliação manual (reconcilePreference/releaseForRetry) limpa.
  creation_blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_charges_client on billing_charges (client_id, created_at desc);
create index billing_charges_status on billing_charges (status, created_at desc);

-- ── Pagamentos ────────────────────────────────────────────────────
-- Cada pagamento que o Mercado Pago relata para uma cobrança (GET
-- /v1/payments/{id}, nunca o corpo do aviso). provider_payment_id é único:
-- o mesmo aviso duas vezes escreve a mesma linha, nunca conta duas, e uma
-- cobrança pode ter mais de um pagamento (uma tentativa recusada, depois
-- uma aprovada). status_detail guarda o valor bruto do Mercado Pago
-- (authorized, in_process, charged_back…) para conferência; status é o
-- mesmo reduzido a cinco valores que billing_charges usa.
create table billing_payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references billing_charges (id) on delete cascade,
  provider_payment_id text not null unique,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  status_detail text,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index billing_payments_charge on billing_payments (charge_id, created_at desc);

-- ── Quem pode ler ─────────────────────────────────────────────────
-- Mesmo padrão das migrations 0013 e 0018: RLS ligado, nenhuma política.
-- Só o painel chega aqui, com a service role, depois de getAdmin().
alter table billing_charges enable row level security;
alter table billing_payments enable row level security;
