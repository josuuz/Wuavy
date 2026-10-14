-- Andaime: o mínimo do Supabase que as migrations 0001–0016 exigem, montado sobre
-- um Postgres puro (PGlite 17.5). NÃO é o Supabase: é o suficiente para exercitar
-- o SQL das migrations. O que diverge está anotado no relatório.

-- pgcrypto não vem no PGlite. As migrations só a pedem por gen_random_uuid(), que é
-- do núcleo desde o PG 13 (confirmado: nenhuma usa crypt, digest, hmac ou pgp_*).
-- O runner neutraliza o `create extension` ao aplicar as migrations do projeto.

-- Os três papéis do PostgREST. service_role ignora RLS, como no Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- O Supabase concede tudo por padrão em public e deixa o RLS filtrar. É o que faz
-- `revoke ... from authenticated` nas migrations ter efeito: há o que revogar.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ── auth ──────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Só as colunas que as migrations e as fixtures tocam.
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A mesma leitura que o Supabase faz: o "sub" do JWT que o PostgREST põe em
-- request.jwt.claims. Lá a função também aceita request.jwt.claim.sub.
-- O nullif vem ANTES do cast: sem claims, current_setting devolve string vazia, e
-- ''::jsonb é erro de sintaxe, não nulo. É assim que o Supabase define as duas.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ── storage ───────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets,
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  metadata jsonb,
  unique (bucket_id, name)
);

-- No Supabase, storage.objects tem RLS ligado e nenhuma política para estes
-- buckets, o que nega tudo a quem está autenticado. Reproduzido aqui.
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant select on storage.objects, storage.buckets to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;
