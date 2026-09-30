-- Wuavy Flow 0002: one person from first contact to next return.
-- A contact who books becomes a patient: leads.patient_id links the two, so the
-- person is never registered twice and the patient keeps their origin and quotes.
-- The sales funnel ends at "agendado"; an appointment can be marked as a no-show.
-- Additive: no row is deleted, and the link is a composite foreign key like
-- every other relationship, so it never points at another organization.

alter table leads add column patient_id uuid;
alter table leads
  add constraint leads_organization_id_patient_id_fkey
  foreign key (organization_id, patient_id) references patients (organization_id, id) on delete set null (patient_id);

-- The two stages after "agendado" now live in the patient's record.
update leads set stage = 'agendado' where stage in ('procedimento', 'retorno');
alter table leads drop constraint leads_stage_check;
alter table leads add constraint leads_stage_check
  check (stage in ('novo', 'contato', 'avaliacao', 'orcamento', 'agendado'));

alter table appointments drop constraint appointments_status_check;
alter table appointments add constraint appointments_status_check
  check (status in ('agendado', 'confirmado', 'cancelado', 'concluido', 'faltou'));
