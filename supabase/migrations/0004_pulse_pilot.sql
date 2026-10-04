-- Wuavy Pulse 0004: what the first real clinic needs. Run after 0002 and 0003.
-- Additive and safe to run twice: no row is deleted.
--
--  1. A subscription can be activated by hand (provider 'manual'), for a
--     clinic that contracted directly with Wuavy while the online checkout
--     is not live.
--  2. A product's minimum stock: at or below it, the Pulse says to buy.
--  3. The clinic's owner edits the clinic's profile, and each member their
--     own name, from Configurações. Row-level security says whose row; column
--     privileges say which columns, so nobody can change an id, a role or a
--     logo address by calling the API directly.
--  4. Procedures of any specialty: the category "outro".

-- ── 1. Manual activation ──────────────────────────────────────
alter table subscriptions drop constraint if exists subscriptions_provider_check;
alter table subscriptions add constraint subscriptions_provider_check check (provider in ('mercadopago', 'manual'));

-- To activate a clinic by hand (Supabase › SQL editor), with the e-mail the
-- person signed up with. They then open /pulse/comecar and set up the clinic,
-- which attaches this subscription to it:
--
--   insert into subscriptions (user_id, provider, status, started_at)
--   select id, 'manual', 'active', now() from auth.users where email = 'dono@clinica.com.br';
--
-- To suspend it later (read-only, nothing deleted):
--
--   update subscriptions set status = 'cancelled', updated_at = now()
--   where provider = 'manual' and user_id = (select id from auth.users where email = 'dono@clinica.com.br');

-- ── 2. Minimum stock ──────────────────────────────────────────
alter table products add column if not exists min_quantity numeric(10, 3) check (min_quantity >= 0);

-- ── 3. Editing the clinic and the account ─────────────────────
create or replace function is_owner(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where organization_id = org and user_id = auth.uid() and role = 'owner');
$$;

drop policy if exists "owners update" on organizations;
create policy "owners update" on organizations for update using (is_owner(id)) with check (is_owner(id));
revoke update on organizations from anon, authenticated;
-- logo_url is written by the server only (the upload checks the file first).
grant update (name, segment, city, whatsapp, team_size, opening_time, closing_time, work_days) on organizations to authenticated;

drop policy if exists "self update" on members;
create policy "self update" on members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on members from anon, authenticated;
grant update (name) on members to authenticated;

-- ── 4. Procedures of any specialty ────────────────────────────
alter table procedures drop constraint if exists procedures_category_check;
alter table procedures add constraint procedures_category_check check (category in ('facial', 'injetaveis', 'corporal', 'outro'));
