-- Reversão dos privilégios que a 0015 estreitou em clinical_records.
--
-- NÃO é um rollback. Nada é apagado aqui: nenhuma tabela, nenhuma coluna,
-- nenhuma linha. O único efeito é devolver a `authenticated` a permissão de
-- escrever em clinical_records do jeito que a 0007 tinha deixado.
--
-- Quando usar: só se o aplicativo publicado passar a receber "permission denied
-- for table clinical_records" ou "column ... of relation ... does not exist" ao
-- salvar uma evolução. Em teoria isso não acontece — as colunas que a 0015
-- libera cobrem tudo o que o código em produção escreve —, mas é a única parte
-- da proposta que tira um direito que já existia, e por isso tem volta escrita.
--
-- O que a 0015 fez (seção 5):
--   revoke insert, update on clinical_records from anon, authenticated;
--   grant insert (id, organization_id, patient_id, recorded_at, chief_complaint,
--                 notes, appointment_id, procedure_id) ... to authenticated;
--   grant update (recorded_at, chief_complaint, notes, appointment_id,
--                 procedure_id) ... to authenticated;
--
-- O que havia antes (0007, linhas 51–52): insert e update no nível da tabela
-- para `authenticated`, sem delete, e nada para `anon`.

begin;

-- Em Postgres, revogar um privilégio "on table" revoga também os privilégios de
-- coluna correspondentes. É assim que as listas da 0015 saem do ACL.
revoke insert, update on clinical_records from authenticated;

-- E volta o que a 0007 tinha concedido: a tabela inteira, menos delete.
grant insert, update on clinical_records to authenticated;

-- `anon` fica de fora de propósito: a 0007 já tinha feito
-- `revoke all on clinical_records from anon`, então a 0015 não tirou nada dele
-- e não há nada para devolver. Conceder algo a `anon` aqui seria abrir uma
-- porta que nunca esteve aberta.

commit;

-- Conferência (deve listar INSERT e UPDATE sem coluna, para authenticated):
--   select grantee, privilege_type
--     from information_schema.table_privileges
--    where table_name = 'clinical_records' and grantee = 'authenticated'
--    order by privilege_type;
--   select grantee, column_name, privilege_type
--     from information_schema.column_privileges
--    where table_name = 'clinical_records' and grantee = 'authenticated';
--
-- Para voltar ao estado publicado depois, reaplique só a seção 5 da
-- 0015_clinical_evolution.sql. Ela é idempotente.
