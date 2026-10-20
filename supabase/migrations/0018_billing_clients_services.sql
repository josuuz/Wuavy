-- Wuavy 0018: clientes e catálogo de serviços da agência (Wuavy Cobranças).
-- Era 0017 ao ser escrita; renumerada para 0018 porque a worktree
-- pulse-legacy-transition já tinha uma 0017_legacy_access_transition.sql
-- própria (Pulse, subscriptions) não commitada, descoberta só na Etapa C.
-- Produto próprio, ao lado da manutenção: não altera maintenance_clients,
-- maintenance_subscriptions, maintenance_payments nem as assinaturas do Pulse
-- (migration 0003). Mudar um preço padrão aqui nunca muda o que uma
-- assinatura ou cobrança já criada cobra — esses valores ficam congelados
-- onde já estavam (maintenance_subscriptions.amount_cents hoje; o mesmo vale
-- para cobranças futuras, que sempre guardam o próprio valor).
--
-- Additive: cria duas tabelas e nada mais. Não aplicada ainda: revisar antes
-- de rodar.

-- ── Clientes da agência ──────────────────────────────────────────
-- Um registro por pessoa ou empresa que a Wuavy cobra, de qualquer serviço.
-- Não há uma constraint de unicidade em nome/e-mail/whatsapp: dois clientes
-- legítimos podem compartilhar e-mail (a mesma contadora) ou nome parecido.
-- A prevenção de duplicidade é feita na camada de aplicação (lib/billing/
-- clients.ts), que avisa antes de criar e deixa confirmar.
create table billing_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  whatsapp text,
  notes text,
  -- Vínculo opcional com um cliente de manutenção já existente. Nunca
  -- preenchido automaticamente por esta migration: quem liga os dois é o
  -- painel, cliente por cliente, quando o administrador confirmar que são
  -- o mesmo. Um cliente de manutenção liga a no máximo um registro aqui.
  maintenance_client_id uuid references maintenance_clients (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Um cliente que a Wuavy não atende mais. A linha fica; nada é apagado.
  archived_at timestamptz
);

create index billing_clients_live on billing_clients (created_at desc) where archived_at is null;
create unique index billing_clients_one_maintenance_link on billing_clients (maintenance_client_id) where maintenance_client_id is not null;

-- ── Catálogo de serviços ─────────────────────────────────────────
-- O que a Wuavy vende. default_price_cents é só o ponto de partida de uma
-- cobrança nova (lib/billing/services.ts): uma cobrança sempre guarda o seu
-- próprio valor, então mudar o preço padrão aqui não afeta nenhum contrato
-- já criado, recorrente ou não.
create table billing_services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  kind text not null check (kind in ('once', 'recurring')),
  default_price_cents integer not null check (default_price_cents between 500 and 10000000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_services_name on billing_services (name);

-- Os cinco serviços do levantamento inicial. O valor de manutenção (R$ 40)
-- é só o padrão do catálogo: os clientes de manutenção já existentes
-- continuam cobrando o que está em maintenance_clients.price_cents, sem
-- qualquer relação com esta linha.
insert into billing_services (name, description, kind, default_price_cents) values
  ('Criação de site', 'Projeto e desenvolvimento de um site novo.', 'once', 150000),
  ('Manutenção de site', 'Manutenção mensal recorrente do site.', 'recurring', 4000),
  ('Gestão de tráfego pago', 'Taxa de gestão de campanhas de anúncios — não inclui o orçamento de mídia.', 'recurring', 60000),
  ('Landing page', 'Criação de uma landing page avulsa.', 'once', 80000),
  ('Serviço personalizado', 'Descrição e valor definidos na hora da cobrança.', 'once', 10000);

-- ── Quem pode ler ─────────────────────────────────────────────────
-- Nobody, com uma chave anônima ou de usuário: RLS ligado e nenhuma política,
-- o mesmo padrão da migration 0013. Só o painel chega aqui, com a service
-- role (createAdminClient), depois de passar por getAdmin().
alter table billing_clients enable row level security;
alter table billing_services enable row level security;
