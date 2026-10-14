-- ⚠ DESTRUTIVO — NÃO RODAR SEM AUTORIZAÇÃO ESCRITA E SEPARADA ⚠
--
-- Este arquivo apaga anamneses preenchidas. Ele existe para que, se um dia for
-- preciso, a ordem correta já esteja escrita — e não para ser a reversão
-- normal. A reversão normal é voltar a versão do aplicativo (RECUPERACAO.md,
-- nível 1) e, no máximo, devolver os privilégios da 0015 (nível 2). Nenhuma das
-- duas apaga nada.
--
-- Não rode nada daqui se qualquer uma destas for verdadeira:
--   · existe anamnese preenchida que ninguém autorizou destruir;
--   · não há backup validado, restaurado e conferido em outro banco;
--   · a autorização é a mesma da publicação. Tem que ser uma autorização nova,
--     para esta operação, por escrito, com data.
--
-- Antes: pare o aplicativo (ou volte-o a uma versão que não leia estas tabelas),
-- tire o backup do nível 3 do RECUPERACAO.md e confira a contagem de linhas:
--
--   select count(*) from anamneses;
--   select count(*) from anamnesis_revisions;
--   select count(*) from clinical_attachments;
--   select count(*) from clinical_record_revisions;
--
-- A ordem abaixo importa. Os gatilhos saem antes das tabelas que eles escrevem:
-- derrubar clinical_record_revisions com o gatilho de pé quebra toda edição de
-- evolução — a tabela já publicada e em uso — e não só o que a proposta criou.

\echo 'Este arquivo nao deve ser executado inteiro. Leia os comentarios.'
\quit

-- ── 1. Os gatilhos primeiro ───────────────────────────────────
drop trigger if exists pulse_z_record_revision on clinical_records;
drop trigger if exists pulse_z_anamnesis_revision on anamneses;
drop trigger if exists pulse_anamnesis_stamp on anamneses;
drop trigger if exists pulse_anamnesis_version_frozen on anamnesis_form_versions;
drop trigger if exists pulse_attachment_stamp on clinical_attachments;

-- ── 2. O que a 0016 criou ─────────────────────────────────────
-- Os arquivos no bucket NÃO saem com a tabela. Remova-os pelo painel ou pela
-- API de Storage antes, ou o bucket fica com objetos órfãos que ninguém
-- consegue mais relacionar a uma paciente.
drop table if exists clinical_attachments;
drop function if exists pulse_attachment_stamp();
-- delete from storage.buckets where id = 'clinical';  -- só com o bucket vazio

-- ── 3. O que a 0014 criou (AQUI MORREM AS ANAMNESES) ──────────
drop table if exists anamnesis_revisions;
drop table if exists anamneses;
drop table if exists anamnesis_form_versions;
drop table if exists anamnesis_forms;
drop function if exists pulse_keep_anamnesis();
drop function if exists pulse_anamnesis_stamp();
drop function if exists pulse_versions_are_frozen();

-- ── 4. O que a 0015 criou ─────────────────────────────────────
drop table if exists clinical_record_revisions;
drop function if exists pulse_keep_record();
drop index if exists clinical_records_appointment;
-- As duas colunas abaixo podem ter dados escritos pelo aplicativo novo.
-- Removê-las apaga a ligação entre uma evolução, a consulta e o procedimento.
alter table clinical_records drop column if exists appointment_id;
alter table clinical_records drop column if exists procedure_id;
drop index if exists clinical_records_org_id;

-- ── 5. E os privilégios, pela reverter-0015-privilegios.sql ───
-- Rode aquele arquivo; não repita o conteúdo dele aqui.
