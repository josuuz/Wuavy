-- PROPOSTA, NÃO APLICADA. Wuavy Pulse 0016: photographs, documents and consent.
-- Run after 0015, which gives clinical_records the key this file points at.
--
--  1. One row per file. The row is the record; the bucket only holds bytes.
--  2. The bucket is private, and stays private. Nobody signed in reaches it directly:
--     no policy is written on storage.objects, which in Supabase means that table's
--     row-level security denies everything to anon and authenticated. The server
--     uploads with the service role, exactly as lib/flow/logo.ts already does for the
--     clinic's logo, and hands out short-lived signed URLs for reading.
--
--     Why not a policy that reads the organization out of the file's path: it would
--     make authorization depend on a string being shaped correctly, and on nobody ever
--     writing a path by hand. For a photograph of someone's face, that is not a good
--     enough reason to be clever. Authorization lives in the row and in this table's
--     policies, which the server checks before it signs anything.
--
--  3. A consent is a document with a date and a name: the same table, a different kind,
--     and a constraint that will not let it be a consent without both.
--  4. Deleting is granted to nobody. Taking a photograph out of a patient's file is a
--     decision for the clinic's owner and the server, through a function of its own
--     (not in this file), so that the bytes go with the row and neither is orphaned.
--
--  5. Two writes cannot be one transaction. The bucket is not Postgres, so an upload
--     and an insert can disagree: either can succeed while the other fails. The order
--     is chosen by which wreckage is worse.
--
--     A file with no row is the bad one: bytes of someone's face sitting in a bucket
--     with nothing to say whose they are, who may see them, or when they should go.
--     A row with no file is dull: it shows nothing and a sweep can clear it.
--
--     So the server writes the row first with uploaded_at null, uploads to the path the
--     row already names, then sets uploaded_at. Reading ignores rows that never got
--     their bytes, and a row left unconfirmed for an hour is rubbish to be collected,
--     along with any object whose path no confirmed row claims.

-- ── 1. The bucket ─────────────────────────────────────────────
-- Private. The size and type limits are the bucket's own, so a file the server would
-- refuse is refused one layer lower as well.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical', 'clinical', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No policy is created on storage.objects for this bucket, and that is the point:
-- deny by default. If a policy is ever added here, it should be reviewed as carefully
-- as the clinical tables themselves.

-- ── 2. The files ──────────────────────────────────────────────

create table if not exists clinical_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  patient_id uuid not null,
  -- The evolution entry it illustrates, when it illustrates one.
  record_id uuid,
  kind text not null check (kind in ('foto_antes', 'foto_depois', 'documento', 'consentimento')),
  -- Where the bytes are: 'org/<organization_id>/patient/<patient_id>/<uuid>.<ext>'.
  -- Unique, so one object can never be claimed by two rows, in this clinic or another.
  storage_path text not null unique check (char_length(storage_path) between 8 and 400),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  bytes integer not null check (bytes > 0 and bytes <= 20971520),
  caption text check (caption is null or char_length(caption) <= 300),
  -- When the photograph was taken, if that is not when it was uploaded.
  taken_at timestamptz,
  -- A consent, and only a consent, carries who signed it and when — and it carries
  -- both or it is not a consent. A scan with no date and no name is a 'documento'.
  consent_signed_at timestamptz,
  consent_signer text check (consent_signer is null or char_length(consent_signer) between 2 and 200),
  -- Set when the bytes are known to be in the bucket. See the note on ordering below:
  -- the row is written first and confirmed second, so a half-done upload leaves a row
  -- with no file (harmless, and easy to sweep) rather than a file with no row.
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (organization_id, id),
  check ((kind = 'consentimento') = (consent_signed_at is not null and consent_signer is not null)),
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete cascade,
  foreign key (organization_id, record_id) references clinical_records (organization_id, id)
    on delete set null (record_id)
);

create index if not exists clinical_attachments_patient
  on clinical_attachments (organization_id, patient_id, created_at desc) where uploaded_at is not null;
create index if not exists clinical_attachments_record
  on clinical_attachments (organization_id, record_id) where record_id is not null and uploaded_at is not null;
-- The sweep's own index: rows that never got their bytes.
create index if not exists clinical_attachments_unconfirmed
  on clinical_attachments (created_at) where uploaded_at is null;

-- ── 3. Who may read and write ─────────────────────────────────

alter table clinical_attachments enable row level security;

-- Only files that are really there. An unconfirmed row is invisible to the clinic; the
-- server, which is the one that confirms it, reads with the service role and sees it.
drop policy if exists "clinicians read files" on clinical_attachments;
create policy "clinicians read files" on clinical_attachments for select
  using (uploaded_at is not null and can_record(organization_id) and sees_patient(organization_id, patient_id));
drop policy if exists "clinicians update files" on clinical_attachments;
create policy "clinicians update files" on clinical_attachments for update
  using (can_record(organization_id) and sees_patient(organization_id, patient_id))
  with check (can_record(organization_id) and sees_patient(organization_id, patient_id));

-- No insert policy, deliberately. A row appears only when the server has put the bytes
-- in the bucket, so the two are written together, by the service role, and a row can
-- never point at a file that is not there.
revoke all on clinical_attachments from anon;
revoke insert, update, delete on clinical_attachments from authenticated;
-- What a clinician may change afterwards is the caption and which entry it belongs to.
grant update (caption, record_id) on clinical_attachments to authenticated;

-- Stamped by the database, like everything else that records who did what. The columns
-- that say which clinic, which patient and which bytes are frozen after the insert.
create or replace function pulse_attachment_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;
  new.created_by := old.created_by;
  new.organization_id := old.organization_id;
  new.patient_id := old.patient_id;
  new.storage_path := old.storage_path;
  new.kind := old.kind;
  return new;
end $$;

drop trigger if exists pulse_attachment_stamp on clinical_attachments;
create trigger pulse_attachment_stamp before insert or update on clinical_attachments
  for each row execute function pulse_attachment_stamp();
