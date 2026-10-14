-- PROPOSTA, NÃO APLICADA e NUNCA em produção. Verification script for 0014–0016.
--
-- Run it on a throwaway database — `supabase start` locally, or a Supabase branch —
-- with 0001…0013 applied and then 0014, 0015, 0016. It ends in rollback and leaves
-- nothing behind, but it writes to auth.users on the way, so it does not belong
-- anywhere near a clinic's data.
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f teste-isolamento.sql
--
-- Every identity below is fictitious and every value is made up.
--
-- What it is for: row-level security is only as good as the day someone tries to get
-- round it. Each block takes on an identity the way PostgREST does — `role` set to
-- authenticated and request.jwt.claims carrying the user id that auth.uid() reads —
-- and then asserts what that person can and cannot do. Nothing is asserted while
-- holding service_role: that role bypasses RLS, so using it to stand in for a person
-- would make this file prove nothing. test_as() refuses to leave without checking.
--
-- Two ways a test like this lies, and what is done about each:
--   · It passes because the row is not there at all. Every "expects zero" is paired
--     with a control, counted as service_role, proving the row exists and is merely
--     hidden.
--   · It passes because the step that set it up ran with more power than the person
--     would have. The fixtures use the project's own functions where the project has
--     them (pulse_accept_invite), and act as the person who would really be acting;
--     service_role is used only where the server itself would use it.
--
-- The cast:
--   dona      owner of clinic A              doutora   professional at A, treats Ana
--   outra     professional at A, treats nobody        recepcao  reception at A
--   vizinha   owner of clinic B, must never see A
--   Clinic C exists only to be deleted, to prove the triggers do not block cleanup.

\set ON_ERROR_STOP on

begin;

-- ── Helpers ───────────────────────────────────────────────────

-- Becomes a signed-in person, and proves it: a test that ran as service_role by
-- accident would pass for the worst possible reason.
create or replace function test_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  if current_setting('role') <> 'authenticated' then
    raise exception 'test_as: o papel ficou %, não authenticated', current_setting('role');
  end if;
  if auth.uid() is distinct from who then
    raise exception 'test_as: auth.uid() devolveu %, esperado %', auth.uid(), who;
  end if;
end $$;

-- Becomes the server. Only for what the server itself does.
create or replace function test_as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end $$;

create or replace function test_rows(q text) returns integer language plpgsql as $$
declare n integer;
begin
  execute 'select count(*)::int from (' || q || ') t' into n;
  return n;
end $$;

create or replace function test_is(label text, got integer, want integer) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FALHOU: % — esperado %, obtido %', label, want, got;
  end if;
  raise notice 'ok: %', label;
end $$;

-- The control for every "expects zero": counted as the server, so a zero above means
-- hidden, not absent.
create or replace function test_exists(label text, q text) returns void language plpgsql as $$
declare n integer; before text;
begin
  before := current_setting('role');
  perform set_config('role', 'service_role', true);
  n := test_rows(q);
  perform set_config('role', before, true);
  if n < 1 then
    raise exception 'FIXTURE VAZIA: % — o controle não encontrou linha nenhuma, então o teste de cima não provou nada', label;
  end if;
  raise notice 'controle: % (% linha(s) existem de verdade)', label, n;
end $$;

-- The statement must be refused, by a policy, a missing grant or a trigger.
create or replace function test_denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok: % (recusado: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % — a operação passou e não deveria', label;
end $$;

-- The statement runs but must touch nothing. This is the other way a write is
-- stopped, and it looks nothing like the first: with RLS on and no policy for that
-- command, the statement matches zero rows and reports success. test_denied would
-- call that a failure to protect, and be wrong; treating it as a pass without
-- counting rows would be worse, because a statement that quietly changed everything
-- also "succeeds". So the rows are counted, and the data is checked afterwards.
create or replace function test_touches(label text, stmt text, want integer) returns void
language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n is distinct from want then
    raise exception 'FALHOU: % — a instrução tocou % linha(s), esperado %', label, n, want;
  end if;
  raise notice 'ok: % (atingiu % linha(s))', label, n;
end $$;

-- At least one row matches. For the history, where counting exactly is the
-- wrong question: every edit leaves a revision, so several may hold the same
-- answer, and within one transaction they even share changed_at — now() is
-- the transaction's clock, not the statement's. What matters is that the
-- previous state is in there somewhere, not how many times it appears.
create or replace function test_some(label text, q text) returns void language plpgsql as $$
declare n integer;
begin
  n := test_rows(q);
  if n < 1 then
    raise exception 'FALHOU: % — nenhuma linha, esperava ao menos uma', label;
  end if;
  raise notice 'ok: % (% linha(s))', label, n;
end $$;

-- The statement must succeed. Used where a restriction could go too far.
create or replace function test_allowed(label text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'ok: %', label;
exception when others then
  raise exception 'FALHOU: % — a operação foi recusada e deveria passar (%)', label, sqlerrm;
end $$;

-- A fictitious account, the way the auth service would leave it: confirmed, with a
-- password nobody can use (the hash is not of any password).
--
-- security definer because creating an account is not something any role in this
-- script may do. On Supabase it happens outside SQL altogether, through the Auth
-- Admin API; here it is done by the owner of this function and by nobody else, which
-- keeps the rest of the file honest about what a signed-in person can reach.
create or replace function test_user(label text) returns uuid language plpgsql security definer as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
          label || '@exemplo.invalido', '$2a$10$teste.nao.e.uma.senha.valida.000000000000000000000000',
          now(), now(), now());
  return u;
end $$;

-- The clinic and its first owner: exactly what comecar/actions.ts does with the admin
-- client (organizations, then members with role owner and status active).
create or replace function test_clinic(clinic text, owner uuid) returns uuid
language plpgsql as $$
declare org uuid;
begin
  insert into organizations (name) values (clinic) returning id into org;
  insert into members (organization_id, user_id, name, role, status, joined_at)
  values (org, owner, initcap(clinic) || ' (dona)', 'owner', 'active', now());
  return org;
end $$;

-- An invitation, as the server writes it: the row exists, inactive, until the person
-- accepts it themselves.
create or replace function test_invite(org uuid, who uuid, as_role text, display text) returns void
language plpgsql as $$
begin
  insert into members (organization_id, user_id, name, role, status)
  values (org, who, display, as_role, 'invited');
end $$;

-- ── Fixtures ──────────────────────────────────────────────────
-- Identities first, then each clinic the way the product builds one. Everything
-- above is defined before the first change of role: creating a function needs CREATE
-- on the schema, which none of the product's roles has, and rightly so.

-- O caderninho de ids das fixtures. Lido por todos os papéis do teste, porque é
-- de onde cada bloco tira "quem" e "qual paciente"; não é dado do produto e não
-- participa de nenhuma asserção.
create temporary table t (k text primary key, v uuid);
grant all on t to authenticated, service_role;

select test_as_server();

insert into t (k, v) values
  ('dona', test_user('dona')), ('doutora', test_user('doutora')), ('outra', test_user('outra')),
  ('recepcao', test_user('recepcao')), ('vizinha', test_user('vizinha')), ('donaC', test_user('donac'));

insert into t (k, v) values
  ('orgA', test_clinic('clinica a', (select v from t where k = 'dona'))),
  ('orgB', test_clinic('clinica b', (select v from t where k = 'vizinha'))),
  ('orgC', test_clinic('clinica c', (select v from t where k = 'donaC')));

select test_invite((select v from t where k='orgA'), (select v from t where k='doutora'), 'professional', 'Doutora');
select test_invite((select v from t where k='orgA'), (select v from t where k='outra'),   'professional', 'Outra');
select test_invite((select v from t where k='orgA'), (select v from t where k='recepcao'),'reception',    'Recepção');

-- Each person accepts their own invitation, as themselves, through the project's
-- function. If pulse_accept_invite ever stops working, this file says so first.
select test_as((select v from t where k='doutora'));
select pulse_accept_invite((select v from t where k='orgA'), 'Doutora Fictícia');
select test_as((select v from t where k='outra'));
select pulse_accept_invite((select v from t where k='orgA'), 'Outra Fictícia');
select test_as((select v from t where k='recepcao'));
select pulse_accept_invite((select v from t where k='orgA'), 'Recepção Fictícia');

-- The clinic's own rows, written by the owner, through RLS.
select test_as((select v from t where k='dona'));
insert into procedures (id, organization_id, name, category, price, duration_min, return_days)
values (gen_random_uuid(), (select v from t where k='orgA'), 'Limpeza de pele', 'facial', 18000, 60, 30);
insert into patients (id, organization_id, name) values (gen_random_uuid(), (select v from t where k='orgA'), 'Ana Fictícia');
insert into t (k, v) values
  ('procA',    (select id from procedures where organization_id = (select v from t where k='orgA') limit 1)),
  ('patientA1',(select id from patients   where organization_id = (select v from t where k='orgA') limit 1));

-- Ana is doutora's patient, and nobody else's. The appointment names her: an
-- appointment with professional_id null would make Ana visible to every professional
-- (sees_patient, 0009:97) and section 3 would fail for a reason that is not a bug.
insert into appointments (id, organization_id, patient_id, procedure_id, professional_id, starts_at, duration_min)
values (gen_random_uuid(), (select v from t where k='orgA'), (select v from t where k='patientA1'),
        (select v from t where k='procA'), (select v from t where k='doutora'), now() + interval '1 day', 60);

-- Clinic B has its own patient, so that B is not empty either.
select test_as((select v from t where k='vizinha'));
insert into patients (id, organization_id, name) values (gen_random_uuid(), (select v from t where k='orgB'), 'Beatriz Fictícia');

-- The clinical rows, written by the professional who treats Ana.
select test_as((select v from t where k='doutora'));
insert into clinical_records (organization_id, patient_id, chief_complaint, notes)
values ((select v from t where k='orgA'), (select v from t where k='patientA1'), 'Manchas na face', 'Primeira avaliação.');
-- A sheet with both halves: the five fixed answers and a questionnaire of its
-- own, frozen into the sheet the day it was filled. Section 5 needs both.
insert into anamneses (organization_id, patient_id, allergies, goals, fields_snapshot, answers)
values (
  (select v from t where k='orgA'), (select v from t where k='patientA1'),
  'Nenhuma conhecida', 'Uniformizar o tom',
  '[{"key":"fumante","label":"Fuma?","kind":"boolean"},{"key":"pele","label":"Tipo de pele","kind":"choice","options":["seca","mista"]}]'::jsonb,
  '{"fumante": false, "pele": "mista"}'::jsonb
);
insert into t (k, v) values
  ('recordA1',  (select id from clinical_records where organization_id = (select v from t where k='orgA') limit 1)),
  ('anamneseA1',(select id from anamneses where organization_id = (select v from t where k='orgA') limit 1));

-- The owner publishes a form and a version of it.
select test_as((select v from t where k='dona'));
insert into anamnesis_forms (id, organization_id, name)
values (gen_random_uuid(), (select v from t where k='orgA'), 'Ficha geral');
insert into t (k, v) values ('formA', (select id from anamnesis_forms where organization_id = (select v from t where k='orgA') limit 1));
insert into anamnesis_form_versions (organization_id, form_id, version, fields)
values ((select v from t where k='orgA'), (select v from t where k='formA'), 1,
        '[{"key":"fumante","label":"Fuma?","kind":"boolean"}]'::jsonb);

-- Two files: one confirmed, one still waiting for its bytes. Written by the server,
-- which is who writes them (0016 grants insert to nobody else, on purpose).
select test_as_server();
insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes, uploaded_at)
values ((select v from t where k='orgA'), (select v from t where k='patientA1'), 'foto_antes',
        'org/a/patient/ana/confirmada.jpg', 'image/jpeg', 120000, now());
insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes)
values ((select v from t where k='orgA'), (select v from t where k='patientA1'), 'foto_depois',
        'org/a/patient/ana/pendente.jpg', 'image/jpeg', 130000);
insert into t (k, v) values
  ('fileOk', (select id from clinical_attachments where storage_path = 'org/a/patient/ana/confirmada.jpg'));

-- And one object in the bucket, so that section 8 means something.
insert into storage.objects (bucket_id, name, owner) values ('clinical', 'org/a/patient/ana/confirmada.jpg', null);

-- ── 1. Isolation between clinics ──────────────────────────────

select test_as((select v from t where k='vizinha'));
select test_is('vizinha não lê o prontuário de A',  test_rows('select 1 from clinical_records'), 0);
select test_exists('existe prontuário em A',        'select 1 from clinical_records');
select test_is('vizinha não lê a anamnese de A',    test_rows('select 1 from anamneses'), 0);
select test_exists('existe anamnese em A',          'select 1 from anamneses');
select test_is('vizinha não lê os anexos de A',     test_rows('select 1 from clinical_attachments'), 0);
select test_exists('existem anexos em A',           'select 1 from clinical_attachments');
select test_is('vizinha não lê os modelos de A',    test_rows('select 1 from anamnesis_forms'), 0);
select test_exists('existe modelo em A',            'select 1 from anamnesis_forms');
select test_is('vizinha não lê as versões de A',    test_rows('select 1 from anamnesis_form_versions'), 0);
select test_is('vizinha não lê os pacientes de A',
  test_rows(format('select 1 from patients where id = %L::uuid', (select v from t where k='patientA1'))), 0);

-- The composite keys, from the other side: a row of B may not point into A.
select test_denied('vizinha não cria anamnese em paciente de A',
  format('insert into anamneses (organization_id, patient_id) values (%L::uuid, %L::uuid)',
         (select v from t where k='orgB'), (select v from t where k='patientA1')));
select test_denied('vizinha não cria prontuário em paciente de A',
  format('insert into clinical_records (organization_id, patient_id, notes) values (%L::uuid, %L::uuid, ''invasão'')',
         (select v from t where k='orgB'), (select v from t where k='patientA1')));
-- And she still runs her own clinic.
select test_is('vizinha lê a própria paciente', test_rows('select 1 from patients'), 1);

-- ── 2. The front desk sees nothing clinical ───────────────────

select test_as((select v from t where k='recepcao'));
select test_is('recepção não lê prontuário', test_rows('select 1 from clinical_records'), 0);
select test_is('recepção não lê anamnese',   test_rows('select 1 from anamneses'), 0);
select test_is('recepção não lê anexos',     test_rows('select 1 from clinical_attachments'), 0);
select test_is('recepção não lê revisões',   test_rows('select 1 from clinical_record_revisions'), 0);
select test_is('recepção não lê modelos de anamnese', test_rows('select 1 from anamnesis_forms'), 0);
select test_denied('recepção não escreve anamnese',
  format('insert into anamneses (organization_id, patient_id) values (%L::uuid, %L::uuid)',
         (select v from t where k='orgA'), (select v from t where k='patientA1')));
select test_denied('recepção não escreve prontuário',
  format('insert into clinical_records (organization_id, patient_id, notes) values (%L::uuid, %L::uuid, ''não'')',
         (select v from t where k='orgA'), (select v from t where k='patientA1')));
-- And it still does its own job: without these two, the pair above could pass by
-- having locked the front desk out of the product altogether.
select test_is('recepção continua lendo a agenda',  test_rows('select 1 from appointments'), 1);
select test_is('recepção continua lendo pacientes', test_rows('select 1 from patients'), 1);

-- ── 3. A professional, only for their own patients ────────────

select test_as((select v from t where k='doutora'));
select test_is('doutora lê a anamnese da sua paciente',
  test_rows(format('select 1 from anamneses where patient_id = %L::uuid', (select v from t where k='patientA1'))), 1);
select test_is('doutora lê o prontuário da sua paciente',
  test_rows(format('select 1 from clinical_records where patient_id = %L::uuid', (select v from t where k='patientA1'))), 1);
select test_is('doutora lê o anexo confirmado',
  test_rows(format('select 1 from clinical_attachments where patient_id = %L::uuid', (select v from t where k='patientA1'))), 1);
select test_is('doutora lê os modelos da clínica', test_rows('select 1 from anamnesis_forms'), 1);

select test_as((select v from t where k='outra'));
select test_is('outra não lê a anamnese de quem não atende',
  test_rows(format('select 1 from anamneses where patient_id = %L::uuid', (select v from t where k='patientA1'))), 0);
select test_is('outra não lê o prontuário dessa paciente',
  test_rows(format('select 1 from clinical_records where patient_id = %L::uuid', (select v from t where k='patientA1'))), 0);
select test_is('outra não lê os anexos dessa paciente', test_rows('select 1 from clinical_attachments'), 0);
select test_is('outra não lê as revisões dessa paciente', test_rows('select 1 from anamnesis_revisions'), 0);
-- A professional does not shape the clinic's forms.
select test_denied('profissional não publica modelo',
  format('insert into anamnesis_forms (organization_id, name) values (%L::uuid, ''minha ficha'')',
         (select v from t where k='orgA')));

-- ── 4. Authorship is the database's, and history is nobody's ──

select test_as((select v from t where k='doutora'));
-- Authorship cannot be claimed: author_id is not a column the app may insert.
select test_denied('autoria não vem do pedido',
  format('insert into anamneses (organization_id, patient_id, author_id) values (%L::uuid, %L::uuid, %L::uuid)',
         (select v from t where k='orgA'), (select v from t where k='patientA1'), (select v from t where k='dona')));
select test_is('a anamnese ficou com a autoria de quem a escreveu',
  test_rows(format('select 1 from anamneses where id = %L::uuid and author_id = %L::uuid',
                   (select v from t where k='anamneseA1'), (select v from t where k='doutora'))), 1);

-- An edit leaves the previous state behind, written by the database.
update anamneses set allergies = 'dipirona' where id = (select v from t where k='anamneseA1');
select test_is('a edição gravou uma revisão',
  test_rows(format('select 1 from anamnesis_revisions where anamnesis_id = %L::uuid', (select v from t where k='anamneseA1'))), 1);
select test_is('a revisão guarda o estado anterior, não o novo',
  test_rows(format('select 1 from anamnesis_revisions where anamnesis_id = %L::uuid and snapshot->>''allergies'' = ''Nenhuma conhecida''',
                   (select v from t where k='anamneseA1'))), 1);
select test_is('a revisão guarda quem editou',
  test_rows(format('select 1 from anamnesis_revisions where anamnesis_id = %L::uuid and changed_by = %L::uuid',
                   (select v from t where k='anamneseA1'), (select v from t where k='doutora'))), 1);

-- The questions a sheet answered are frozen by the database as well, not only
-- by the server action: neither column is in 0014's grant, so no amount of
-- cleverness in a request can relabel what someone was asked.
select test_denied('profissional não reescreve as perguntas da ficha',
  format('update anamneses set fields_snapshot = ''[]''::jsonb where id = %L::uuid', (select v from t where k='anamneseA1')));
select test_denied('profissional não troca a versão que a ficha respondeu',
  format('update anamneses set version_id = null where id = %L::uuid', (select v from t where k='anamneseA1')));
select test_is('as perguntas da ficha continuam as mesmas',
  test_rows(format('select 1 from anamneses where id = %L::uuid and jsonb_array_length(fields_snapshot) = 2', (select v from t where k='anamneseA1'))), 1);

-- Editing an answer keeps the answer it replaced.
update anamneses set answers = '{"fumante": true, "pele": "mista"}'::jsonb
  where id = (select v from t where k='anamneseA1');
select test_some('a revisão guarda as respostas anteriores',
  format('select 1 from anamnesis_revisions where anamnesis_id = %L::uuid and snapshot->''answers''->>''fumante'' = ''false''',
         (select v from t where k='anamneseA1')));
select test_some('a revisão guarda também as perguntas daquele momento',
  format('select 1 from anamnesis_revisions where anamnesis_id = %L::uuid and jsonb_array_length(snapshot->''fields_snapshot'') = 2',
         (select v from t where k='anamneseA1')));
--
-- E o que o banco NÃO impede, dito aqui para não ser confundido com proteção:
-- `answers` é atualizável por necessidade, então um pedido que mandasse um
-- objeto vazio apagaria as respostas. Quem impede isso é a ação do servidor,
-- que relê as perguntas do próprio fields_snapshot da ficha
-- (lib/flow/clinical-actions.ts). Esta linha documenta o limite do schema.
select test_allowed('o banco aceita respostas vazias — quem barra é o servidor',
  format('update anamneses set answers = ''{}''::jsonb where id = %L::uuid', (select v from t where k='anamneseA1')));
-- E, mesmo assim, o que havia antes ficou guardado.
select test_some('a revisão preservou as respostas que foram apagadas',
  format('select 1 from anamnesis_revisions where anamnesis_id = %L::uuid and snapshot->''answers''->>''pele'' = ''mista''',
         (select v from t where k='anamneseA1')));

update clinical_records set notes = 'Reavaliação.' where id = (select v from t where k='recordA1');
select test_is('o prontuário editado gravou uma revisão',
  test_rows(format('select 1 from clinical_record_revisions where record_id = %L::uuid', (select v from t where k='recordA1'))), 1);
select test_is('a revisão do prontuário guarda o texto anterior',
  test_rows(format('select 1 from clinical_record_revisions where record_id = %L::uuid and snapshot->>''notes'' = ''Primeira avaliação.''',
                   (select v from t where k='recordA1'))), 1);

-- Not even the owner rewrites the past.
select test_as((select v from t where k='dona'));
select test_denied('dona não insere revisão à mão',
  format('insert into anamnesis_revisions (organization_id, anamnesis_id, snapshot) values (%L::uuid, %L::uuid, ''{}''::jsonb)',
         (select v from t where k='orgA'), (select v from t where k='anamneseA1')));
select test_denied('dona não altera revisão',  'update anamnesis_revisions set snapshot = ''{}''::jsonb');
select test_denied('dona não apaga revisão',   'delete from anamnesis_revisions');
select test_denied('dona não apaga prontuário','delete from clinical_records');
select test_denied('dona não apaga anamnese',  'delete from anamneses');
select test_denied('dona não apaga anexo',     'delete from clinical_attachments');
-- A published version is frozen by two different things, and they fail differently.
-- First: there is no UPDATE policy on the table, so for anyone signed in the
-- statement matches no row at all. It does not raise — it touches nothing, which is
-- why this is counted rather than caught.
select test_touches('dona não alcança versão publicada (RLS, zero linhas)',
  'update anamnesis_form_versions set fields = ''[]''::jsonb', 0);
select test_is('a versão publicada continua intacta',
  test_rows(format('select 1 from anamnesis_form_versions where form_id = %L::uuid and version = 1 and fields::text <> ''[]''',
                   (select v from t where k='formA'))), 1);
-- Second: the trigger, which is what stops the server itself. service_role bypasses
-- RLS, so without the trigger a careless line in a server action would rewrite a
-- signed sheet's questions. This is the assertion that actually exercises it.
select test_as_server();
select test_denied('nem o servidor altera versão publicada',
  'update anamnesis_form_versions set fields = ''[]''::jsonb');
select test_is('a versão publicada continua intacta depois disso',
  test_rows(format('select 1 from anamnesis_form_versions where form_id = %L::uuid and version = 1 and fields::text <> ''[]''',
                   (select v from t where k='formA'))), 1);

select test_as((select v from t where k='dona'));
-- Publishing another version is how a form changes, and it must still work.
select test_allowed('dona publica a versão 2',
  format('insert into anamnesis_form_versions (organization_id, form_id, version, fields) values (%L::uuid, %L::uuid, 2, ''[]''::jsonb)',
         (select v from t where k='orgA'), (select v from t where k='formA')));

-- ── 5. Uploads: pending, confirmed, and who may confirm ───────

select test_as((select v from t where k='doutora'));
select test_is('anexo sem bytes não aparece para a clínica',
  test_rows('select 1 from clinical_attachments where uploaded_at is null'), 0);
select test_exists('o anexo pendente existe mesmo',
  'select 1 from clinical_attachments where uploaded_at is null');
select test_is('o anexo confirmado aparece',
  test_rows('select 1 from clinical_attachments where uploaded_at is not null'), 1);
-- Confirming is the server's job. A clinician may not declare bytes that are not there.
select test_denied('profissional não confirma upload',
  format('update clinical_attachments set uploaded_at = now() where id = %L::uuid', (select v from t where k='fileOk')));
select test_denied('profissional não muda o caminho do arquivo',
  format('update clinical_attachments set storage_path = ''outro.jpg'' where id = %L::uuid', (select v from t where k='fileOk')));
select test_denied('profissional não reclassifica um consentimento',
  format('update clinical_attachments set kind = ''consentimento'' where id = %L::uuid', (select v from t where k='fileOk')));
-- What a clinician may change is the caption and which entry the file belongs to.
select test_allowed('profissional edita a legenda',
  format('update clinical_attachments set caption = ''Antes, luz natural'' where id = %L::uuid', (select v from t where k='fileOk')));

-- A consent is a consent only with a date and a name.
select test_as_server();
select test_denied('consentimento sem data e sem nome é recusado',
  format('insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes) values (%L::uuid, %L::uuid, ''consentimento'', ''org/a/patient/ana/termo.pdf'', ''application/pdf'', 1000)',
         (select v from t where k='orgA'), (select v from t where k='patientA1')));
select test_allowed('consentimento com data e nome é aceito',
  format('insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes, consent_signed_at, consent_signer, uploaded_at) values (%L::uuid, %L::uuid, ''consentimento'', ''org/a/patient/ana/termo.pdf'', ''application/pdf'', 1000, now(), ''Ana Fictícia'', now())',
         (select v from t where k='orgA'), (select v from t where k='patientA1')));
select test_denied('um documento comum não finge ser consentimento assinado',
  format('insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes, consent_signed_at, consent_signer) values (%L::uuid, %L::uuid, ''documento'', ''org/a/patient/ana/exame.pdf'', ''application/pdf'', 1000, now(), ''Ana'')',
         (select v from t where k='orgA'), (select v from t where k='patientA1')));
-- The same object cannot be claimed twice, here or from another clinic.
select test_denied('dois registros não reivindicam o mesmo arquivo',
  format('insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes) values (%L::uuid, %L::uuid, ''documento'', ''org/a/patient/ana/confirmada.jpg'', ''image/jpeg'', 10)',
         (select v from t where k='orgB'), (select v from t where k='patientA1')));

-- ── 6. The bucket answers to nobody signed in ─────────────────

select test_as((select v from t where k='dona'));
select test_is('dona não lista o bucket clínico',
  test_rows('select 1 from storage.objects where bucket_id = ''clinical'''), 0);
select test_exists('o objeto está mesmo no bucket',
  'select 1 from storage.objects where bucket_id = ''clinical''');
select test_as((select v from t where k='vizinha'));
select test_is('vizinha não lista o bucket clínico',
  test_rows('select 1 from storage.objects where bucket_id = ''clinical'''), 0);
select test_as_server();
select test_is('o bucket clínico é privado',
  test_rows('select 1 from storage.buckets where id = ''clinical'' and public = false'), 1);
--
-- Signed URLs cannot be exercised from SQL: they are made by the Storage API, not by
-- Postgres. What this file can prove is the floor under them — the bucket is private
-- and nobody signed in reads storage.objects — so the application-level test must
-- carry the rest, and it is not optional:
--   a) a signed URL is issued only after the server has checked, with the caller's
--      own session, that the attachment's row is visible to them;
--   b) the URL expires, and a stale one is refused;
--   c) a URL signed for clinic A's file is never issued to a member of clinic B;
--   d) no public URL is ever produced for this bucket (getPublicUrl must not appear
--      anywhere near it — contrast lib/flow/logo.ts, where it is correct).

-- ── 7. Deleting a clinic still works ──────────────────────────
-- The reason this section exists: a trigger that raised on delete would make an
-- organization impossible to remove, and comecar/actions.ts deletes the organization
-- when creating a clinic fails halfway. Clinic C is built with one of everything and
-- then dropped.

select test_as_server();
insert into procedures (id, organization_id, name, category, price, duration_min, return_days)
values (gen_random_uuid(), (select v from t where k='orgC'), 'Peeling', 'facial', 20000, 45, 30);
insert into patients (id, organization_id, name) values (gen_random_uuid(), (select v from t where k='orgC'), 'Carla Fictícia');
insert into t (k, v) values ('patientC1', (select id from patients where organization_id = (select v from t where k='orgC') limit 1));
insert into anamnesis_forms (id, organization_id, name) values (gen_random_uuid(), (select v from t where k='orgC'), 'Ficha C');
insert into t (k, v) values ('formC', (select id from anamnesis_forms where organization_id = (select v from t where k='orgC') limit 1));
insert into anamnesis_form_versions (organization_id, form_id, version, fields)
values ((select v from t where k='orgC'), (select v from t where k='formC'), 1, '[]'::jsonb);
insert into anamneses (organization_id, patient_id, goals)
values ((select v from t where k='orgC'), (select v from t where k='patientC1'), 'teste');
update anamneses set goals = 'teste 2' where organization_id = (select v from t where k='orgC');
insert into clinical_records (organization_id, patient_id, notes)
values ((select v from t where k='orgC'), (select v from t where k='patientC1'), 'nota');
update clinical_records set notes = 'nota 2' where organization_id = (select v from t where k='orgC');
insert into clinical_attachments (organization_id, patient_id, kind, storage_path, mime_type, bytes, uploaded_at)
values ((select v from t where k='orgC'), (select v from t where k='patientC1'), 'documento', 'org/c/doc.pdf', 'application/pdf', 10, now());

select test_exists('a clínica C tem versões publicadas',
  format('select 1 from anamnesis_form_versions where organization_id = %L::uuid', (select v from t where k='orgC')));
select test_exists('a clínica C tem revisões',
  format('select 1 from anamnesis_revisions where organization_id = %L::uuid', (select v from t where k='orgC')));

-- The delete itself. If a trigger raises, this line fails and says so.
select test_allowed('apagar a clínica C não é bloqueado pelos gatilhos',
  format('delete from organizations where id = %L::uuid', (select v from t where k='orgC')));

select test_is('nada da clínica C sobrou em anamneses',
  test_rows(format('select 1 from anamneses where organization_id = %L::uuid', (select v from t where k='orgC'))), 0);
select test_is('nada da clínica C sobrou em versões',
  test_rows(format('select 1 from anamnesis_form_versions where organization_id = %L::uuid', (select v from t where k='orgC'))), 0);
select test_is('nada da clínica C sobrou em revisões',
  test_rows(format('select 1 from anamnesis_revisions where organization_id = %L::uuid', (select v from t where k='orgC'))), 0);
select test_is('nada da clínica C sobrou em prontuário',
  test_rows(format('select 1 from clinical_records where organization_id = %L::uuid', (select v from t where k='orgC'))), 0);
select test_is('nada da clínica C sobrou em anexos',
  test_rows(format('select 1 from clinical_attachments where organization_id = %L::uuid', (select v from t where k='orgC'))), 0);
--
-- The bytes do not go with the rows: Postgres cascades its own tables, not the bucket.
-- Whatever deletes an organization has to empty the bucket's folder too, and that is a
-- server job, not a migration's. Noted here because this is where it becomes obvious.

-- ── 8. The app as deployed today still writes ─────────────────
-- 0015 revokes the broad insert and update on clinical_records and hands back a column
-- list. The question is not whether the new app fits that list — it was written to —
-- but whether the app running in production right now still does, because a migration
-- is applied before its deploy finishes everywhere, and for a while both are live.
--
-- lib/flow/actions.ts saveRecord, as it stands at c2b4309, inserts
--   organization_id, patient_id, chief_complaint, notes, recorded_at
-- and updates
--   chief_complaint, notes, recorded_at
-- and nothing else. These two statements are that, copied. If a later edit to
-- saveRecord adds a column, this test fails and the deployment plan has to change.

select test_as((select v from t where k='doutora'));
select test_allowed('o app de hoje ainda insere prontuário',
  format('insert into clinical_records (organization_id, patient_id, chief_complaint, notes, recorded_at) values (%L::uuid, %L::uuid, ''queixa'', ''nota'', now())',
         (select v from t where k='orgA'), (select v from t where k='patientA1')));
select test_allowed('o app de hoje ainda edita prontuário',
  format('update clinical_records set chief_complaint = ''outra'', notes = ''n2'', recorded_at = now() where id = %L::uuid',
         (select v from t where k='recordA1')));
select test_allowed('o app de hoje ainda lê o id que acabou de escrever',
  format('select id from clinical_records where id = %L::uuid', (select v from t where k='recordA1')));

rollback;

-- Nothing above is committed. If the script reaches here, every assertion passed.
