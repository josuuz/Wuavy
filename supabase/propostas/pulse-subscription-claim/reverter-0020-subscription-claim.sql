-- Reversão de 0020_pulse_subscription_claim.sql.
--
-- Isto É um rollback de schema: tira 4 colunas, um índice e troca o check
-- constraint de volta ao que a 0003 tinha. Diferente de
-- reverter-0015-privilegios.sql (que só devolvia um GRANT), aqui há perda de
-- dados de verdade se alguma linha já usa o que está sendo revertido.
--
-- PRÉ-REQUISITO, NÃO OPCIONAL: se existir qualquer linha com
-- status = 'rejected' — sozinha, OU formando par com uma linha viva
-- ('pending'/'active'/'past_due') no MESMO organization_id, que é
-- exatamente o caso que a 0020 existe para permitir (uma clínica tenta de
-- novo depois de uma recusa) — este script FALHA ao recriar o check
-- constraint antigo (que não lista 'rejected'). Falha é o comportamento
-- certo: recriar o constraint antigo em silêncio apagando o significado
-- dessas linhas seria perder, sem aviso, a diferença entre "nunca chegou a
-- existir no Mercado Pago" e "cancelada depois de meses cobrados" que a 0020
-- existe para preservar (ver o cabeçalho da própria 0020). Antes de rodar
-- isto numa base com dados reais: decidir o que fazer com as linhas
-- 'rejected' (reclassificar para 'cancelled' perde a distinção; apagá-las
-- perde o histórico que recordSubscriptionRefusal grava de propósito) — essa
-- decisão de produto não é tomada por este script.
--
-- TAMBÉM NÃO OPCIONAL: isto é um rollback de SCHEMA, não só de dados. A
-- aplicação publicada precisa já estar na versão anterior a esta correção
-- antes de rodar isto — código ainda em produção que leia/escreva
-- creation_claimed_at, creation_blocked_at, last_refusal_http_status,
-- last_refusal_detail, ou que grave status = 'rejected'
-- (lib/mercadopago/create-subscription.ts, recordSubscriptionRefusal em
-- lib/flow/billing.ts) vai passar a falhar no banco assim que este script
-- confirmar. A ordem certa é: reverter o deploy do código primeiro, só
-- depois rodar isto.
--
-- OPERACIONAL: os dois ALTER TABLE abaixo tomam um lock ACCESS EXCLUSIVE em
-- subscriptions pela duração da transação — checkout e processamento de
-- webhook ficam bloqueados até o commit (ou o rollback). Rodar numa janela
-- de baixo tráfego; `set local lock_timeout = '5s';` antes do BEGIN, se
-- quiser falhar rápido em vez de esperar atrás de uma transação alheia.
--
-- O que a 0020 fez:
--   alter table subscriptions
--     add column creation_claimed_at timestamptz,
--     add column creation_blocked_at timestamptz,
--     add column last_refusal_http_status integer,
--     add column last_refusal_detail text;
--   alter table subscriptions drop/add constraint subscriptions_status_check
--     -- agora inclui 'rejected'
--   drop/create index subscriptions_one_live_per_clinic
--     -- agora também exclui 'rejected', não só 'cancelled'
--   create index subscriptions_blocked on subscriptions (creation_blocked_at) where creation_blocked_at is not null;
--
-- O que havia antes (0003):
--   create unique index subscriptions_one_live_per_clinic on subscriptions (organization_id)
--     where organization_id is not null and status <> 'cancelled';
--   check (status in ('pending', 'active', 'past_due', 'cancelled'))
--   (sem as 4 colunas, sem o índice subscriptions_blocked)

begin;

-- 1. O check constraint volta a não aceitar 'rejected'. Esta linha é a que
-- falha, de propósito, se qualquer linha já estiver com status = 'rejected'
-- (ver PRÉ-REQUISITO acima) — e precisa vir ANTES do índice (passo 2): toda
-- forma de dado que violaria o índice antigo (uma linha 'rejected' sozinha,
-- ou pareada com uma linha viva no mesmo organization_id) contém por
-- definição uma linha 'rejected', então checar o constraint primeiro
-- intercepta os dois casos no mesmo ponto documentado. Na ordem inversa, o
-- caso pareado — exatamente o que a 0020 existe para permitir — violaria o
-- índice antes de chegar aqui, com um erro diferente do que este script
-- documenta (achado da revisão independente).
alter table subscriptions drop constraint subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'cancelled'));

-- 2. O índice ajustado volta ao que a 0003 definia. Se o passo 1 passou, não
-- há mais nenhuma linha 'rejected' na tabela, então este índice não pode
-- encontrar um par que o antigo predicado (status <> 'cancelled', sem
-- excluir 'rejected') veria como duplicado.
drop index subscriptions_one_live_per_clinic;
create unique index subscriptions_one_live_per_clinic on subscriptions (organization_id)
  where organization_id is not null and status <> 'cancelled';

-- 3. O índice de linhas bloqueadas, e as 4 colunas, só existiam para a 0020.
-- IF EXISTS aqui (e só aqui) é de propósito: este índice não guarda nenhum
-- significado de dado como as colunas e o check constraint acima guardam —
-- se já não existir por algum motivo, não há nada a proteger ao pular, e os
-- outros DROPs deste script continuam sem IF EXISTS porque devem, sim,
-- falhar alto se o estado não for o esperado.
drop index if exists subscriptions_blocked;
alter table subscriptions
  drop column creation_claimed_at,
  drop column creation_blocked_at,
  drop column last_refusal_http_status,
  drop column last_refusal_detail;

commit;

-- Conferência (deve devolver zero linhas e a definição antiga do índice):
--   select column_name from information_schema.columns
--    where table_name = 'subscriptions'
--      and column_name in ('creation_claimed_at','creation_blocked_at','last_refusal_http_status','last_refusal_detail');
--   select indexdef from pg_indexes where indexname = 'subscriptions_one_live_per_clinic';
--
-- Para voltar ao estado publicado depois, reaplique 0020_pulse_subscription_claim.sql.
