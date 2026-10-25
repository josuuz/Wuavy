-- Wuavy Pulse 0020: reserva atômica, bloqueio para reconciliação e um
-- estado local para "recusada na criação" em subscriptions — a mesma lacuna,
-- e a mesma correção, já aplicada às Cobranças (0019: creation_claimed_at/
-- creation_blocked_at em billing_charges). Lá a revisão de idempotência
-- achou o risco antes da primeira aplicação; aqui ele já aconteceu de
-- verdade: um UPDATE sem conferir erro (lib/flow/billing.ts) podia deixar
-- uma assinatura criada no Mercado Pago sem o id salvo nesta tabela, e o
-- código apagava a linha como se nada tivesse sido criado.
--
-- Additive: duas colunas novas, duas colunas de diagnóstico, um valor novo
-- no check de status, e o índice de "uma assinatura viva por clínica"
-- ajustado para não contar a recusada. Não aplicada ainda: validar primeiro
-- só no projeto de TESTE (wazxofdzvzfgonmwsdhs) antes de qualquer aplicação
-- em produção.

-- A reserva atômica antes de chamar o Mercado Pago, e o bloqueio depois de
-- um resultado incerto (timeout, 5xx, ou a assinatura aceita mas sem
-- conseguir salvar o id mesmo depois de tentar de novo) — mesma semântica
-- de billing_charges (0019), mesmo mecanismo em
-- lib/mercadopago/create-subscription.ts (claimDecision, runPersistRetry).
alter table subscriptions
  add column creation_claimed_at timestamptz,
  add column creation_blocked_at timestamptz,
  -- O que o Mercado Pago respondeu na última tentativa recusada: nunca dado
  -- de cartão, token ou credencial — só o código HTTP e a causa que o
  -- próprio Mercado Pago descreveu (body.cause[].description). Para suporte
  -- financeiro conseguir ver o motivo sem depender de um log temporário da
  -- Vercel. Null sempre que esta linha nunca foi recusada.
  add column last_refusal_http_status integer,
  add column last_refusal_detail text;

-- 'rejected': recusada na criação, a assinatura nunca chegou a existir no
-- Mercado Pago — um estado só nosso, que nunca vem de statusFrom() (lib/
-- mercadopago/notice.ts). Diferente de 'cancelled', que é o que o Mercado
-- Pago relata para uma assinatura que EXISTIU e foi cancelada, inclusive
-- depois de meses pagos de verdade. Confundir as duas (lendo "cancelled"
-- como prova de "recusada, nada cobrado") foi a causa de a tela de
-- checkout poder mostrar "Nada foi cobrado" também para uma assinatura que
-- chegou a cobrar antes de ser cancelada.
alter table subscriptions drop constraint subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'active', 'past_due', 'cancelled', 'rejected'));

-- O índice de "uma assinatura viva por clínica" (migration 0003) contava
-- qualquer status <> 'cancelled' como viva — o que incluiria 'rejected' e
-- quebraria a segunda tentativa de uma clínica já existente depois de uma
-- recusa (duas linhas 'rejected' para o mesmo organization_id violariam a
-- unicidade). Recusada nunca é "viva": fica de fora do mesmo jeito que
-- cancelada.
drop index subscriptions_one_live_per_clinic;
create unique index subscriptions_one_live_per_clinic on subscriptions (organization_id)
  where organization_id is not null and status not in ('cancelled', 'rejected');

create index subscriptions_blocked on subscriptions (creation_blocked_at) where creation_blocked_at is not null;
