-- Wuavy Pulse 0012: WhatsApp, through Meta's official Cloud API, as a channel of the clinic.
-- Run after 0011. Additive and safe to run twice: no row is changed or deleted, and the app
-- deployed before it keeps working (it never reads what is added here).
--
--  1. Each clinic connects its own number (whatsapp_connections). The number that receives a
--     message decides the clinic, never anything a browser sends. At most one live connection
--     per clinic, and a number is live at one clinic only. Changing or disconnecting the number
--     keeps everything else: WhatsApp is a channel of the clinic, not its identity.
--  2. Credentials of a clinic connected through Meta's Embedded Signup live in Supabase Vault
--     (encrypted at rest); only the server reads them. The test phase uses Meta's test number,
--     whose credentials are server environment variables, never stored here.
--  3. The conversation history gains what WhatsApp says about each message: its type, media
--     metadata (never the file), which connection carried it, and why a send failed.
--  4. A message received is written by one function, in one transaction: the clinic from the
--     number, the person by phone (a patient first, then a contact, created only when nobody
--     has that phone), their one conversation, the message once (Meta's id), the list line.
--  5. Delivery statuses only move forward: sent, delivered, read (or failed).
--  6. New messages and statuses reach the open Conversas screen (Supabase Realtime, under the same RLS).
--
-- Only the owner connects or disconnects (the server checks the role; the database grants no
-- write on connections to anyone signed in). The front desk reads the connection's status and
-- sends through the server. Professionals see neither, as before.

-- ── 1. Connections ────────────────────────────────────────────
create table if not exists whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  status text not null default 'connecting'
    check (status in ('not_connected', 'connecting', 'connected', 'error', 'disconnected')),
  provider text not null default 'whatsapp_cloud' check (provider in ('whatsapp_cloud')),
  -- test: Meta's test number, credentials from the server's environment.
  -- embedded_signup: the clinic's own number, connected through Meta's flow, credentials in Vault.
  mode text not null check (mode in ('test', 'embedded_signup')),
  -- business_app: the number stays on the WhatsApp Business app too (Meta's coexistence).
  onboarding text not null default 'cloud_api' check (onboarding in ('cloud_api', 'business_app')),
  -- What the clinic said the number is. Orientation only: the channel works the same.
  number_choice text check (number_choice is null or number_choice in ('clinic', 'personal')),
  business_id text check (business_id is null or char_length(business_id) <= 64),
  waba_id text check (waba_id is null or char_length(waba_id) <= 64),
  phone_number_id text not null check (char_length(phone_number_id) between 1 and 64),
  display_phone_number text check (display_phone_number is null or char_length(display_phone_number) <= 40),
  display_name text check (display_name is null or char_length(display_name) <= 200),
  -- A short, sanitized reason (Meta's error code), never a token or a message's content.
  last_error text check (last_error is null or char_length(last_error) <= 120),
  connected_at timestamptz,
  connected_by uuid,
  disconnected_at timestamptz,
  disconnected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (organization_id, id)
);

create unique index if not exists whatsapp_connections_one_live
  on whatsapp_connections (organization_id) where status in ('connecting', 'connected', 'error');
create unique index if not exists whatsapp_connections_number_live
  on whatsapp_connections (phone_number_id) where status in ('connecting', 'connected', 'error');

alter table whatsapp_connections enable row level security;
drop policy if exists "staff read" on whatsapp_connections;
create policy "staff read" on whatsapp_connections for select using (is_staff(organization_id));
revoke all on whatsapp_connections from anon, authenticated;
grant select (
  id, organization_id, status, mode, onboarding, number_choice, display_phone_number, display_name,
  connected_at, disconnected_at, created_at
) on whatsapp_connections to authenticated;

-- ── 2. Credentials (server only) ──────────────────────────────
create table if not exists whatsapp_credentials (
  connection_id uuid primary key references whatsapp_connections on delete cascade,
  token_secret_id uuid,
  pin_secret_id uuid,
  created_at timestamptz not null default now()
);
alter table whatsapp_credentials enable row level security;
revoke all on whatsapp_credentials from anon, authenticated;

-- plpgsql, so a project without Vault still runs this migration (only Embedded Signup needs it).
create or replace function pulse_whatsapp_keep_secret(connection uuid, kind text, value text) returns void
language plpgsql security definer set search_path = public as $$
declare
  kept uuid;
  made uuid;
begin
  if kind not in ('token', 'pin') then
    raise exception 'unknown secret kind' using errcode = '22023';
  end if;
  insert into whatsapp_credentials (connection_id) values (connection) on conflict do nothing;
  select case kind when 'token' then token_secret_id else pin_secret_id end into kept
  from whatsapp_credentials where connection_id = connection;
  if kept is not null then
    perform vault.update_secret(kept, value);
  else
    made := vault.create_secret(value, null, 'Wuavy Pulse WhatsApp ' || kind);
    update whatsapp_credentials set
      token_secret_id = case when kind = 'token' then made else token_secret_id end,
      pin_secret_id = case when kind = 'pin' then made else pin_secret_id end
    where connection_id = connection;
  end if;
end $$;

create or replace function pulse_whatsapp_secret(connection uuid, kind text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  value text;
begin
  select s.decrypted_secret into value
  from whatsapp_credentials c
  join vault.decrypted_secrets s on s.id = case kind when 'token' then c.token_secret_id else c.pin_secret_id end
  where c.connection_id = connection;
  return value;
end $$;

create or replace function pulse_whatsapp_forget_secrets(connection uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  select array_remove(array[token_secret_id, pin_secret_id], null) into ids
  from whatsapp_credentials where connection_id = connection;
  if ids is not null and cardinality(ids) > 0 then
    delete from vault.secrets where id = any (ids);
  end if;
  delete from whatsapp_credentials where connection_id = connection;
end $$;

-- ── 3. What WhatsApp says about each message ──────────────────
alter table conversation_messages
  add column if not exists message_type text check (
    message_type is null or message_type in (
      'text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts',
      'interactive', 'button', 'reaction', 'template', 'unsupported'
    )
  ),
  -- Meta's media id, type, file name and caption: the file itself is never stored.
  add column if not exists media jsonb check (media is null or jsonb_typeof(media) = 'object'),
  add column if not exists connection_id uuid,
  add column if not exists failed_reason text check (failed_reason is null or char_length(failed_reason) <= 120),
  add column if not exists status_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversation_messages_connection_fkey') then
    alter table conversation_messages add constraint conversation_messages_connection_fkey
      foreign key (organization_id, connection_id) references whatsapp_connections (organization_id, id)
      on delete set null (connection_id);
  end if;
end $$;

-- The WhatsApp id the person last wrote from: where a reply goes. Written by the server only
-- (the signed-in grants on conversations name their columns, and this is not one of them).
alter table conversations add column if not exists whatsapp_wa_id text
  check (whatsapp_wa_id is null or whatsapp_wa_id ~ '^[0-9]{6,20}$');

-- ── 4. A phone as a line ──────────────────────────────────────
-- The same rule as the app's (conversation-actions.ts): area code and the last eight digits,
-- with or without 55 or a mobile's extra 9, so "+55 11 98765-4321" and WhatsApp's
-- "551187654321" are the same person, and two area codes are never merged.
create or replace function pulse_phone_key(phone text) returns text
language sql immutable set search_path = public as $$
  select case when char_length(n) >= 10 then left(n, 2) || right(n, 8) else right(n, 8) end
  from (
    select case when char_length(d) >= 12 and left(d, 2) = '55' then substr(d, 3) else d end as n
    from (select ltrim(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '0') as d) digits
  ) national;
$$;

create index if not exists patients_phone_key on patients (organization_id, pulse_phone_key(phone)) where phone is not null;
create index if not exists leads_phone_key on leads (organization_id, pulse_phone_key(phone)) where phone is not null;

-- ── 5. A message from WhatsApp ────────────────────────────────
-- direction "in": the person wrote to the clinic. "out": the clinic wrote from the WhatsApp
-- Business app (coexistence's echoes), recorded only for someone already in the Pulse.
-- Returns the new entry's id; null when it was already there (a webhook retried) or skipped.
create or replace function pulse_whatsapp_receive(
  connection uuid,
  message_id text,
  wa_id text,
  profile_name text,
  phone_display text,
  sent_at timestamptz,
  kind text,
  body text,
  media jsonb default null,
  direction text default 'in'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  link whatsapp_connections;
  org uuid;
  line text := pulse_phone_key(wa_id);
  happened timestamptz := (sent_at at time zone 'America/Sao_Paulo') at time zone 'UTC';
  patient uuid;
  lead uuid;
  lead_patient uuid;
  conv uuid;
  entry uuid;
  who text;
begin
  if direction not in ('in', 'out') then
    raise exception 'invalid direction' using errcode = '22023';
  end if;
  if message_id is null or char_length(message_id) not between 1 and 200 or wa_id !~ '^[0-9]{6,20}$' then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  select * into link from whatsapp_connections where id = connection;
  -- A connection that needs reconnecting (an expired credential) still receives: only sending needs it.
  if link.id is null or link.status not in ('connected', 'error') then
    raise exception 'no live connection' using errcode = 'P0002';
  end if;
  org := link.organization_id;

  if exists (
    select 1 from conversation_messages
    where organization_id = org and provider = 'whatsapp_cloud' and provider_message_id = message_id
  ) then
    return null;
  end if;

  -- One message per person at a time: two arriving together never register the person twice.
  perform pg_advisory_xact_lock(hashtextextended(org::text || ':' || line, 0));

  select p.id into patient from patients p
  where p.organization_id = org and p.phone is not null and pulse_phone_key(p.phone) = line
  order by exists (select 1 from conversations c where c.organization_id = org and c.patient_id = p.id) desc,
    p.created_at nulls last, p.id
  limit 1;
  if patient is null then
    select l.id, l.patient_id into lead, lead_patient from leads l
    where l.organization_id = org and l.phone is not null and pulse_phone_key(l.phone) = line
    order by (l.patient_id is not null) desc,
      exists (select 1 from conversations c where c.organization_id = org and c.lead_id = l.id) desc,
      l.created_at, l.id
    limit 1;
    patient := lead_patient;
  end if;

  if patient is null and lead is null then
    if direction = 'out' then
      return null;
    end if;
    who := nullif(left(btrim(coalesce(profile_name, '')), 200), '');
    -- The phone as the clinic reads it, only when it is the same line WhatsApp reported.
    if phone_display is null or pulse_phone_key(phone_display) <> line then
      phone_display := '+' || wa_id;
    end if;
    insert into leads (organization_id, name, phone, source, stage, created_at, last_contact_at)
    values (org, coalesce(who, phone_display), phone_display, 'whatsapp', 'novo', happened, happened)
    returning id into lead;
  end if;

  if patient is not null then
    select id into conv from conversations where organization_id = org and patient_id = patient;
    if conv is null and lead is not null then
      select id into conv from conversations where organization_id = org and lead_id = lead;
    end if;
    if conv is null then
      if lead is null then
        select case when count(*) = 1 then min(id::text)::uuid end into lead
        from leads where organization_id = org and patient_id = patient;
      end if;
      insert into conversations (organization_id, lead_id, patient_id) values (org, lead, patient) returning id into conv;
    end if;
  else
    select id into conv from conversations where organization_id = org and lead_id = lead;
    if conv is null then
      insert into conversations (organization_id, lead_id) values (org, lead) returning id into conv;
    end if;
  end if;

  insert into conversation_messages (
    organization_id, conversation_id, direction, channel, body, occurred_at, delivery_status,
    provider, provider_message_id, message_type, media, connection_id
  ) values (
    org, conv, direction, 'whatsapp', left(body, 4000), happened,
    case when direction = 'in' then 'received' else 'sent' end,
    'whatsapp_cloud', message_id, kind, media, connection
  )
  on conflict (organization_id, provider, provider_message_id) where provider_message_id is not null do nothing
  returning id into entry;
  if entry is null then
    return null;
  end if;

  -- The newest entry decides who owes the next word; a late retry of an old one changes nothing.
  update conversations set
    whatsapp_wa_id = case when direction = 'in' then wa_id else whatsapp_wa_id end,
    status = case
      when direction = 'in' then 'aberta'
      when status = 'aberta' then 'aguardando_cliente'
      else status
    end
  where id = conv and happened >= coalesce(last_message_at, happened);

  update leads l set last_contact_at = greatest(l.last_contact_at, happened)
  from conversations c
  where c.id = conv and l.id = c.lead_id and l.organization_id = org and l.stage <> 'agendado';

  return entry;
end $$;

-- ── 6. Delivery ───────────────────────────────────────────────
create or replace function pulse_whatsapp_status(
  connection uuid,
  message_id text,
  new_status text,
  status_time timestamptz,
  reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  org uuid;
  moved int;
begin
  if new_status not in ('sent', 'delivered', 'read', 'failed') then
    return false;
  end if;
  select organization_id into org from whatsapp_connections where id = connection;
  if org is null then
    return false;
  end if;
  update conversation_messages set
    delivery_status = new_status,
    status_at = status_time,
    failed_reason = case when new_status = 'failed' then left(reason, 120) else failed_reason end
  where organization_id = org and provider = 'whatsapp_cloud' and provider_message_id = message_id and direction = 'out'
    and (
      case new_status when 'failed' then coalesce(delivery_status, 'pending') in ('pending', 'sent')
      else array_position(array['pending', 'sent', 'delivered', 'read'], new_status)
         > coalesce(array_position(array['pending', 'sent', 'delivered', 'read'], delivery_status), 1)
      end
    );
  get diagnostics moved = row_count;
  return moved > 0;
end $$;

-- ── 7. Who may call what ──────────────────────────────────────
revoke all on function pulse_whatsapp_keep_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function pulse_whatsapp_secret(uuid, text) from public, anon, authenticated;
revoke all on function pulse_whatsapp_forget_secrets(uuid) from public, anon, authenticated;
revoke all on function pulse_whatsapp_receive(uuid, text, text, text, text, timestamptz, text, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function pulse_whatsapp_status(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function pulse_whatsapp_keep_secret(uuid, text, text) to service_role;
grant execute on function pulse_whatsapp_secret(uuid, text) to service_role;
grant execute on function pulse_whatsapp_forget_secrets(uuid) to service_role;
grant execute on function pulse_whatsapp_receive(uuid, text, text, text, text, timestamptz, text, text, jsonb, text) to service_role;
grant execute on function pulse_whatsapp_status(uuid, text, text, timestamptz, text) to service_role;

-- ── 8. Live screens ───────────────────────────────────────────
-- Realtime sends a change only to whoever row-level security lets read the row.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversation_messages'
    ) then
      alter publication supabase_realtime add table conversation_messages;
    end if;
  end if;
end $$;
