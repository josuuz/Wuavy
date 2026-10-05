-- Wuavy Pulse 0005: every account is a lead, from the demo on. Run after 0004.
-- Additive and safe to run twice: no row is deleted, nothing existing changes.
--
--  1. profiles: one row per account (created by a trigger at sign-up) with
--     only what auth.users does not hold: the name, where the person came
--     from, and the first time each step of
--     the journey happened. E-mail and sign-up date stay in auth.users;
--     subscription and clinic stay in their own tables.
--  2. pulse_mark(step): the signed-in person records a step of their own
--     journey (demo, subscribe, checkout). Nothing else can write profiles.
--  3. pulse_leads: one view joining it all, for the dashboard only (Table
--     Editor or SQL). Never exposed to the API: it reads auth.users.

-- ── 1. Profiles ───────────────────────────────────────────────
create table if not exists profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text,
  source text not null default 'site' check (source in ('site', 'demo', 'checkout')),
  demo_first_at timestamptz,
  demo_last_at timestamptz,
  subscribe_clicked_at timestamptz,
  checkout_started_at timestamptz,
  created_at timestamptz not null default now()
);

-- An earlier draft of this file kept a marketing consent; it is not collected.
drop view if exists pulse_leads;
alter table profiles drop column if exists marketing_consent, drop column if exists marketing_consent_at;

alter table profiles enable row level security;
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for select using (user_id = auth.uid());
revoke all on profiles from anon;
revoke insert, update, delete on profiles from authenticated;

-- At sign-up, from what the form sent (user metadata). A profile that fails
-- to be written never blocks the account: the journey marks create it later.
create or replace function pulse_profile_from_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  begin
    insert into public.profiles (user_id, name, source, created_at)
    values (
      new.id,
      nullif(left(trim(meta->>'name'), 120), ''),
      case when meta->>'source' in ('demo', 'checkout') then meta->>'source' else 'site' end,
      coalesce(new.created_at, now())
    )
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'pulse_profile_from_signup: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists pulse_profile_on_signup on auth.users;
create trigger pulse_profile_on_signup after insert on auth.users
  for each row execute function pulse_profile_from_signup();

-- The accounts from before this migration: the clinics already using the Pulse,
-- and any sign-up made before it ran (its form's answers are in the metadata).
insert into profiles (user_id, name, source, created_at)
select u.id,
       coalesce(nullif(left(trim(u.raw_user_meta_data->>'name'), 120), ''), (select m.name from members m where m.user_id = u.id limit 1)),
       case when u.raw_user_meta_data->>'source' in ('demo', 'checkout') then u.raw_user_meta_data->>'source' else 'site' end,
       u.created_at
from auth.users u
on conflict (user_id) do nothing;

-- ── 2. Journey marks ──────────────────────────────────────────
-- The first time of each step is kept; the demo also keeps the latest visit.
create or replace function pulse_mark(step text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or step not in ('demo', 'subscribe', 'checkout') then
    return;
  end if;
  insert into profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update profiles set
    demo_first_at = case when step = 'demo' then coalesce(demo_first_at, now()) else demo_first_at end,
    demo_last_at = case when step = 'demo' then now() else demo_last_at end,
    subscribe_clicked_at = case when step = 'subscribe' then coalesce(subscribe_clicked_at, now()) else subscribe_clicked_at end,
    checkout_started_at = case when step = 'checkout' then coalesce(checkout_started_at, now()) else checkout_started_at end
  where user_id = auth.uid();
end $$;

revoke all on function pulse_mark(text) from public, anon;
grant execute on function pulse_mark(text) to authenticated;

-- ── 3. The leads, in one place ────────────────────────────────
-- stage: lead (account only) → demo (opened the demo) → checkout (payment
-- pending) → assinante (paid, clinic not set up yet) → cliente (has a clinic).
drop view if exists pulse_leads;
create view pulse_leads with (security_invoker = on) as
select
  u.id as user_id,
  u.email,
  p.name,
  u.created_at as signed_up_at,
  p.source,
  p.demo_first_at,
  p.demo_last_at,
  p.subscribe_clicked_at,
  p.checkout_started_at,
  s.status as subscription_status,
  s.provider as subscription_provider,
  s.started_at as subscribed_at,
  m.organization_id is not null as onboarding_done,
  o.created_at as onboarded_at,
  case
    when m.organization_id is not null then 'cliente'
    when s.status in ('active', 'past_due') then 'assinante'
    when s.status = 'pending' then 'checkout'
    when p.demo_first_at is not null then 'demo'
    else 'lead'
  end as stage
from auth.users u
left join profiles p on p.user_id = u.id
left join lateral (
  select status, provider, started_at from subscriptions where user_id = u.id order by created_at desc limit 1
) s on true
left join lateral (
  select organization_id from members where user_id = u.id limit 1
) m on true
left join organizations o on o.id = m.organization_id;

revoke all on pulse_leads from public, anon, authenticated;
