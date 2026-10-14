-- PROPOSTA, NÃO APLICADA. Wuavy Pulse 0015: the clinical evolution. Run after 0014.
-- Additive: it adds two nullable columns and one table. Every record written before it
-- stays exactly as it is and goes on reading the same way, with its new columns empty.
--
--  1. A record may name the visit it belongs to and the procedure that was done. Both
--     stay optional: a note written between visits is still a record, and the records
--     already in the database have no visit to point at.
--  2. A record's past is kept. Deleting was already revoked (0007); from here an edit
--     keeps the previous state too, written by the database. The history is read-only
--     for everyone, including the owner.
--  3. clinical_records gains unique (organization_id, id), which it never had. It is
--     what lets 0016's attachments point at a record with a composite key, the way
--     every other relation in this schema does.

-- ── 1. The key other tables will point at ─────────────────────
-- Plain, not CONCURRENTLY: the migration runner wraps a file in a transaction, and
-- CREATE INDEX CONCURRENTLY cannot run inside one — it would fail the whole migration.
-- At this size the lock lasts milliseconds. If this table ever holds enough records for
-- that to matter, move this one statement to a file of its own and add CONCURRENTLY
-- there; everything else in this file is happy in a transaction.
create unique index if not exists clinical_records_org_id
  on clinical_records (organization_id, id);

-- ── 2. The visit and the procedure ────────────────────────────

alter table clinical_records add column if not exists appointment_id uuid;
alter table clinical_records add column if not exists procedure_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinical_records_appointment_fkey') then
    alter table clinical_records add constraint clinical_records_appointment_fkey
      foreign key (organization_id, appointment_id) references appointments (organization_id, id)
      on delete set null (appointment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinical_records_procedure_fkey') then
    alter table clinical_records add constraint clinical_records_procedure_fkey
      foreign key (organization_id, procedure_id) references procedures (organization_id, id)
      on delete set null (procedure_id);
  end if;
end $$;

-- The visit's own records.
create index if not exists clinical_records_appointment
  on clinical_records (organization_id, appointment_id) where appointment_id is not null;

-- ── 3. What a record used to say ──────────────────────────────

create table if not exists clinical_record_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  record_id uuid not null,
  -- The whole row as it stood before this change.
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  foreign key (organization_id, record_id) references clinical_records (organization_id, id) on delete cascade
);

create index if not exists clinical_record_revisions_record
  on clinical_record_revisions (organization_id, record_id, changed_at desc);

create or replace function pulse_keep_record() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into clinical_record_revisions (organization_id, record_id, snapshot, changed_by)
  values (old.organization_id, old.id, to_jsonb(old), coalesce(auth.uid(), new.updated_by));
  return new;
end $$;

-- After pulse_stamp (0009), which runs on the same event: triggers fire in name order,
-- and "pulse_stamp" sorts before "pulse_z_record_revision", so the snapshot is taken
-- once the row already carries the stamp it is about to be saved with.
drop trigger if exists pulse_z_record_revision on clinical_records;
create trigger pulse_z_record_revision before update on clinical_records
  for each row execute function pulse_keep_record();

-- ── 4. Who may read it ────────────────────────────────────────

alter table clinical_record_revisions enable row level security;

drop policy if exists "clinicians read record revisions" on clinical_record_revisions;
create policy "clinicians read record revisions" on clinical_record_revisions for select
  using (can_record(organization_id) and exists (
    select 1 from clinical_records r
    where r.organization_id = clinical_record_revisions.organization_id
      and r.id = clinical_record_revisions.record_id
      and sees_patient(r.organization_id, r.patient_id)
  ));

revoke all on clinical_record_revisions from anon;
revoke insert, update, delete on clinical_record_revisions from authenticated;

-- ── 5. What the app may write on a record ─────────────────────
-- 0007 left insert and update open on every column. Now that the database stamps and
-- snapshots, the app writes only what a person actually types.
revoke insert, update on clinical_records from anon, authenticated;
grant insert (
  id, organization_id, patient_id, recorded_at, chief_complaint, notes, appointment_id, procedure_id
) on clinical_records to authenticated;
grant update (
  recorded_at, chief_complaint, notes, appointment_id, procedure_id
) on clinical_records to authenticated;
