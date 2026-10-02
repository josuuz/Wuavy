-- Wuavy Pulse 0003: the commercial state of a clinic (demo → trial → subscription).
-- Mirrors src/lib/flow/access.ts. Additive: no row is deleted, nothing is locked here.
-- Not applied yet: review before running.
--
-- A new clinic starts a 30-day trial (the defaults below). When trial_ends_at
-- passes, the app turns read-only: data is shown, writes are refused in the
-- Server Actions (lib/flow/actions.ts), and nothing is deleted. The data is
-- kept RETENTION_DAYS (30) after the trial; no job removes it yet.
--
-- Existing clinics get the same defaults when this runs: a 30-day trial
-- counted from today. Set them to 'active' first if they are paying already.
--
-- Members cannot change these columns: organizations has a select policy only,
-- and clinics are created with the service role (app/(app)/pulse/comecar).

alter table organizations
  add column subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'past_due', 'canceled')),
  add column trial_started_at timestamptz not null default now(),
  add column trial_ends_at timestamptz not null default now() + interval '30 days';

-- How many people or hours an automation run brought back (insights.valueDelivered).
alter table automation_runs add column converted integer not null default 0 check (converted >= 0);

-- Later, when the database should enforce read-only on its own (not only the app):
-- a security-definer function such as
--   can_write(org uuid) = is_member(org) and status/trial allow it
-- used in every insert/update/delete policy in place of is_member().
