-- Wuavy Pulse 0021: uma assinatura viva por PESSOA antes de existir clínica
-- (organization_id null) — a mesma garantia que subscriptions_one_live_per_clinic
-- (0003, ajustada em 0020) já dá depois que a clínica existe, só que ela nunca
-- cobria o caminho mais comum de um cliente novo: "o pagamento vem antes da
-- clínica existir" (comentário da própria 0003). Achado da revisão
-- independente (ecc:database-reviewer) sobre a correção de concorrência de
-- 0020: claimSubscriptionCreation reserva por linha (rowId), não por pessoa —
-- duas chamadas concorrentes de subscribe() para quem ainda não tem clínica
-- liam a mesma ausência de assinatura, cada uma inseria a sua própria linha
-- nova, e as duas reivindicavam livremente, cada uma a sua: nada no banco
-- impedia duas assinaturas reais e recorrentes no Mercado Pago para a mesma
-- pessoa. Não aplicada ainda: validar primeiro só no projeto de TESTE
-- (wazxofdzvzfgonmwsdhs) antes de qualquer aplicação em produção.
--
-- Additive: só um índice novo, nenhuma coluna, nenhum dado tocado. Reversão
-- é só `drop index`, sem risco de perda de dado (ver rodapé).
--
-- Mesma exclusão de 0020: 'rejected' nunca é "viva" (uma recusa libera a
-- pessoa para tentar de novo), nem 'cancelled'. Sem a exclusão de 'rejected'
-- aqui, a PRÓPRIA correção de 0020 (uma recusa nunca bloqueia, libera para
-- nova tentativa) quebraria de novo bem aqui: a segunda tentativa, depois de
-- uma recusa, não conseguiria nem inserir a própria linha nova.
create unique index subscriptions_one_live_per_user on subscriptions (user_id)
  where organization_id is null and status not in ('cancelled', 'rejected');

-- Reversão (sem perda de dado possível — é só um índice):
--   drop index subscriptions_one_live_per_user;
