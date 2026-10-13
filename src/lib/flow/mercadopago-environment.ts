/*
  Em que ambiente a cobrança da manutenção pode falar com o Mercado Pago, e
  com quais credenciais.

  O formato da chave não diz nada: o Access Token de uma conta de teste
  também começa com APP_USR-, igual ao de produção. Por isso o ambiente não
  é adivinhado pela chave. Ele é declarado (MERCADOPAGO_ENV=test) e conferido
  contra onde o código roda (VERCEL_ENV), e na dúvida a cobrança fecha:

  - Produção na Vercel (VERCEL_ENV=production): só credenciais reais.
    MERCADOPAGO_ENV=test ali é um erro de configuração, e a cobrança recusa
    em vez de misturar credenciais de teste com clientes de verdade.
  - Qualquer outro lugar (a máquina de desenvolvimento, `next start` local, um
    deploy de Preview): só credenciais de teste. Sem MERCADOPAGO_ENV=test e
    sem o e-mail do comprador de teste, a cobrança recusa. É isso que impede
    um token de produção esquecido num .env.local de gerar uma cobrança real.

  A conferência é sobre a declaração, não sobre a chave: ela impede o erro
  comum (variável faltando, ambiente trocado), mas não consegue saber se quem
  declarou "test" colou, de fato, um token de teste. Quem cadastra a chave
  responde por isso, e o comprador de teste obrigatório limita o estrago: o
  Mercado Pago só aceita cartões de teste para ele.

  Puro e sem acesso a rede: recebe o ambiente como argumento, para ser testado.
*/

export type Env = Record<string, string | undefined>;

export type Refusal =
  | "no-credentials"
  | "invalid-env"
  | "test-in-production"
  | "live-outside-production"
  | "no-test-payer"
  | "test-key-in-live";

export type Decision = { allowed: true; mode: "test" | "live" } | { allowed: false; reason: Refusal };

const flag = (value: string | undefined) => (value ?? "").trim().toLowerCase();

/** Esta execução é o deploy de produção da Vercel. Nenhum outro lugar é. */
export const isProductionDeploy = (env: Env) => flag(env.VERCEL_ENV) === "production";

/**
 * O que a configuração diz ser a conta do Mercado Pago em uso. Vazio é "live"
 * (a produção não declara nada); "test" e "live" são as duas declarações. Qualquer
 * outra coisa ("sandbox", "tset", "production") não é nenhuma das duas, e adivinhar
 * que é "live" abriria a cobrança por causa de um erro de digitação.
 */
export const declaredMode = (env: Env): "test" | "live" | "invalid" => {
  const declared = flag(env.MERCADOPAGO_ENV);
  return declared === "" || declared === "live" ? "live" : declared === "test" ? "test" : "invalid";
};

/** Se a cobrança pode falar com o Mercado Pago agora, e em que modo. */
export function decide(env: Env): Decision {
  if (!env.MERCADOPAGO_ACCESS_TOKEN?.trim()) return { allowed: false, reason: "no-credentials" };

  const mode = declaredMode(env);
  if (mode === "invalid") return { allowed: false, reason: "invalid-env" };
  if (isProductionDeploy(env)) {
    return mode === "test" ? { allowed: false, reason: "test-in-production" } : { allowed: true, mode: "live" };
  }
  if (mode !== "test") return { allowed: false, reason: "live-outside-production" };
  if (!env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim()) return { allowed: false, reason: "no-test-payer" };
  return { allowed: true, mode: "test" };
}

/**
 * A decisão para o checkout do Pulse, que usa a chave pública no navegador:
 * além de `decide`, uma chave pública "TEST-" (essa sim prova ser de teste)
 * não convive com um ambiente declarado como real. A cobrança da manutenção
 * não usa a chave pública e continua decidindo só por `decide`.
 */
export function checkoutDecision(env: Env): Decision {
  const decision = decide(env);
  const testKey = (env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "").trim().startsWith("TEST-");
  return decision.allowed && decision.mode === "live" && testKey ? { allowed: false, reason: "test-key-in-live" } : decision;
}

/**
 * O e-mail do pagador que vai ao Mercado Pago. Em teste, sempre o do comprador
 * de teste (o Mercado Pago só aceita esse numa conta de teste). Em produção, o
 * do cliente, e o e-mail de teste é ignorado mesmo que alguém o tenha deixado
 * configurado.
 */
export function payerEmailFor(env: Env, email: string): string {
  const decision = decide(env);
  return decision.allowed && decision.mode === "test" ? (env.MERCADOPAGO_TEST_PAYER_EMAIL as string).trim() : email;
}

/** O que dizer a quem administra quando a cobrança está fechada. */
export const REFUSAL: Record<Refusal, string> = {
  "no-credentials": "Mercado Pago não configurado: faltam as credenciais.",
  "invalid-env": "Cobrança fechada: MERCADOPAGO_ENV só aceita \"test\" ou \"live\" (ou vazio). Qualquer outro valor é recusado.",
  "test-in-production": "Cobrança fechada: MERCADOPAGO_ENV=test na produção. Credenciais de teste não podem estar aqui.",
  "live-outside-production": "Cobrança fechada fora da produção: declare MERCADOPAGO_ENV=test e use as credenciais de uma conta de teste.",
  "no-test-payer": "Cobrança fechada em teste: falta MERCADOPAGO_TEST_PAYER_EMAIL, o e-mail do comprador de teste.",
  "test-key-in-live": "Checkout fechado: a chave pública é de teste (TEST-), mas o ambiente declarado é real.",
};
