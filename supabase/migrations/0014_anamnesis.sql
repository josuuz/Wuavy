-- PROPOSTA, NÃO APLICADA. Wuavy Pulse 0014: a anamnese. Run after 0013.
-- Additive and safe to run twice: it creates tables and touches no existing row.
--
--  1. A clinic writes its own forms. A form belongs to the clinic and may be tied to one
--     procedure (the anamnesis for botox is not the one for peeling); untied, it is the
--     clinic's general form.
--  2. A form's questions are versioned and immutable once published. Editing a form
--     publishes a new version; the old one stays exactly as it was, because a filled
--     sheet has to go on meaning what it meant the day it was signed.
--  3. A filled sheet also keeps its own copy of the questions it answered. Belt and
--     braces: even if a version row were ever removed, the sheet still reads correctly.
--     The same instinct as appointment_financials in 0009 — freeze what was true then.
--  4. Five answers are columns, not JSON: health history, allergies, medications,
--     contraindications and goals. An allergy must never depend on a template still
--     having that field, nor on the interface knowing to render it.
--  5. Every change keeps the previous state, written by the database, never by the app.
--
-- Who sees it: the same rule as clinical_records (0009) — the owner and the
-- professionals, and only for the patients each one sees. The front desk gets nothing.
-- Times follow lib/flow/clock.ts: recorded_at is the clinic's wall clock (pulse_now()),
-- created_at and changed_at are real UTC.

-- ── 1. The clinic's forms ─────────────────────────────────────

create table if not exists anamnesis_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  -- Null: the clinic's general form. Set: the form for that procedure.
  procedure_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  -- Retired rather than deleted: sheets filled from it keep their meaning.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  unique (organization_id, id),
  foreign key (organization_id, procedure_id) references procedures (organization_id, id)
    on delete set null (procedure_id)
);

-- One live general form, and one live form per procedure, per clinic.
create unique index if not exists anamnesis_forms_general on anamnesis_forms (organization_id)
  where procedure_id is null and archived_at is null;
create unique index if not exists anamnesis_forms_procedure on anamnesis_forms (organization_id, procedure_id)
  where procedure_id is not null and archived_at is null;

-- ── 2. The versions of a form, immutable once published ───────
--
-- fields is the questionnaire, in order:
--   [{ "key": "fumante",   "label": "Fuma?",                "kind": "boolean", "required": true },
--    { "key": "cirurgias", "label": "Cirurgias anteriores", "kind": "text",    "max": 2000 },
--    { "key": "pele",      "label": "Tipo de pele",         "kind": "choice",  "options": ["seca", "oleosa", "mista"] }]
-- kind is one of text, boolean, choice, list. The shape is checked by the server when a
-- version is published (one place, with messages a person can read), not here: a check
-- constraint that walked the array would be slow and hostile to read.

create table if not exists anamnesis_form_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  form_id uuid not null,
  version integer not null check (version > 0),
  fields jsonb not null check (jsonb_typeof(fields) = 'array'),
  published_at timestamptz not null default now(),
  published_by uuid,
  unique (organization_id, id),
  unique (organization_id, form_id, version),
  foreign key (organization_id, form_id) references anamnesis_forms (organization_id, id) on delete cascade
);

create index if not exists anamnesis_form_versions_form
  on anamnesis_form_versions (organization_id, form_id, version desc);

-- Published is published. A correction is a new version, so that no filled sheet ever
-- changes meaning behind someone's back.
--
-- Update only, deliberately. A trigger that also raised on delete would make a whole
-- organization impossible to remove: dropping a clinic cascades to its forms and from
-- there to its versions, and the exception would abort the lot — including the rollback
-- that comecar/actions.ts performs when creating a clinic fails halfway. Deletion is
-- held off by the privilege instead (revoked below), which a cascade is right to bypass.
create or replace function pulse_versions_are_frozen() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Uma versão publicada da anamnese não muda: publique uma versão nova.';
end $$;

drop trigger if exists pulse_anamnesis_version_frozen on anamnesis_form_versions;
create trigger pulse_anamnesis_version_frozen before update on anamnesis_form_versions
  for each row execute function pulse_versions_are_frozen();

-- ── 3. The filled sheet ───────────────────────────────────────

create table if not exists anamneses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  patient_id uuid not null,
  -- The exact version answered. Null only for a sheet filled with no form at all.
  version_id uuid,
  -- What that version's questions were, copied in at fill time.
  fields_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(fields_snapshot) = 'array'),
  -- The answers, keyed by the fields' keys: { "fumante": false, "pele": "mista" }.
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  -- Always asked, whatever the form says.
  health_history text check (health_history is null or char_length(health_history) <= 4000),
  allergies text check (allergies is null or char_length(allergies) <= 2000),
  medications text check (medications is null or char_length(medications) <= 2000),
  contraindications text check (contraindications is null or char_length(contraindications) <= 2000),
  goals text check (goals is null or char_length(goals) <= 2000),
  recorded_at timestamptz not null default pulse_now(),
  author_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid,
  unique (organization_id, id),
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete cascade,
  foreign key (organization_id, version_id) references anamnesis_form_versions (organization_id, id)
    on delete set null (version_id)
);

create index if not exists anamneses_patient
  on anamneses (organization_id, patient_id, recorded_at desc);

-- ── 4. What changed, and who changed it ───────────────────────
--
-- Append-only, written by the database. Nobody is granted insert, update or delete on
-- it: the trigger below is security definer and is its only writer.

create table if not exists anamnesis_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  anamnesis_id uuid not null,
  -- The whole row as it stood before this change.
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  foreign key (organization_id, anamnesis_id) references anamneses (organization_id, id) on delete cascade
);

create index if not exists anamnesis_revisions_sheet
  on anamnesis_revisions (organization_id, anamnesis_id, changed_at desc);

create or replace function pulse_keep_anamnesis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into anamnesis_revisions (organization_id, anamnesis_id, snapshot, changed_by)
  values (old.organization_id, old.id, to_jsonb(old), coalesce(auth.uid(), new.updated_by));
  return new;
end $$;

-- Authorship from the signed-in person, never from the request (0009's pulse_stamp does
-- the same for the tables it covers; anamneses gets its own so that 0009 is left alone).
create or replace function pulse_anamnesis_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    return new;
  end if;
  new.author_id := old.author_id;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

-- Postgres fires BEFORE triggers in name order, so the revision's name is chosen to
-- sort after the stamp's: by the time the revision is written, updated_by is already
-- filled in, and its fallback means something when auth.uid() is null (a write by the
-- server's service role). The same reason 0015 names its trigger pulse_z_record_revision.
drop trigger if exists pulse_anamnesis_stamp on anamneses;
create trigger pulse_anamnesis_stamp before insert or update on anamneses
  for each row execute function pulse_anamnesis_stamp();

drop trigger if exists pulse_anamnesis_revision on anamneses;
drop trigger if exists pulse_z_anamnesis_revision on anamneses;
create trigger pulse_z_anamnesis_revision before update on anamneses
  for each row execute function pulse_keep_anamnesis();

-- ── 5. Who may read and write ─────────────────────────────────

alter table anamnesis_forms enable row level security;
alter table anamnesis_form_versions enable row level security;
alter table anamneses enable row level security;
alter table anamnesis_revisions enable row level security;

-- The forms: every clinician reads them; only the owner shapes them.
drop policy if exists "clinicians read forms" on anamnesis_forms;
create policy "clinicians read forms" on anamnesis_forms for select using (can_record(organization_id));
drop policy if exists "owners write forms" on anamnesis_forms;
create policy "owners write forms" on anamnesis_forms for insert with check (is_owner(organization_id));
drop policy if exists "owners update forms" on anamnesis_forms;
create policy "owners update forms" on anamnesis_forms for update
  using (is_owner(organization_id)) with check (is_owner(organization_id));

drop policy if exists "clinicians read versions" on anamnesis_form_versions;
create policy "clinicians read versions" on anamnesis_form_versions for select using (can_record(organization_id));
drop policy if exists "owners publish versions" on anamnesis_form_versions;
create policy "owners publish versions" on anamnesis_form_versions for insert with check (is_owner(organization_id));

-- The sheets: the clinical rule, exactly as clinical_records has it.
drop policy if exists "clinicians read sheets" on anamneses;
create policy "clinicians read sheets" on anamneses for select
  using (can_record(organization_id) and sees_patient(organization_id, patient_id));
drop policy if exists "clinicians write sheets" on anamneses;
create policy "clinicians write sheets" on anamneses for insert
  with check (can_record(organization_id) and sees_patient(organization_id, patient_id));
drop policy if exists "clinicians update sheets" on anamneses;
create policy "clinicians update sheets" on anamneses for update
  using (can_record(organization_id) and sees_patient(organization_id, patient_id))
  with check (can_record(organization_id) and sees_patient(organization_id, patient_id));

-- The history is read with the sheet it belongs to, and written by nobody.
drop policy if exists "clinicians read revisions" on anamnesis_revisions;
create policy "clinicians read revisions" on anamnesis_revisions for select
  using (can_record(organization_id) and exists (
    select 1 from anamneses a
    where a.organization_id = anamnesis_revisions.organization_id
      and a.id = anamnesis_revisions.anamnesis_id
      and sees_patient(a.organization_id, a.patient_id)
  ));

revoke all on anamnesis_forms, anamnesis_form_versions, anamneses, anamnesis_revisions from anon;
revoke delete on anamnesis_forms, anamnesis_form_versions, anamneses from authenticated;
revoke insert, update, delete on anamnesis_revisions from authenticated;

-- The sheet's own bookkeeping belongs to the database, not to the app.
revoke insert, update on anamneses from authenticated;
grant insert (
  id, organization_id, patient_id, version_id, fields_snapshot, answers,
  health_history, allergies, medications, contraindications, goals, recorded_at
) on anamneses to authenticated;
grant update (
  answers, health_history, allergies, medications, contraindications, goals, recorded_at
) on anamneses to authenticated;
