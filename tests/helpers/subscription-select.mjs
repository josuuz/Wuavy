/*
  A lista EXATA de colunas que lib/flow/session.ts lê de subscriptions para decidir o
  acesso. O teste contra o Postgres de verdade (pulse-payer-email-real.test.mjs) a usa
  para provar que a consulta que o app faz de fato funciona no PostgREST real — não uma
  parecida. E tests/pulse-read-failure-access.test.mjs confere que session.ts ainda
  contém ESTA string, para as duas nunca divergirem em silêncio.
*/
export const SUBSCRIPTION_SELECT =
  "id, status, organization_id, provider_subscription_id, payer_email, created_at, current_period_end, creation_blocked_at, legacy_access_transition, legacy_transition_cleared_at, first_payment_confirmed_at";
