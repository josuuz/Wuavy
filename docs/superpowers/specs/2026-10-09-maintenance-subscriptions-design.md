# Assinaturas de manutenção de sites — R$ 40/mês

**Data:** 2026-10-09 · **Estado:** especificação, não aplicada ao banco

## O que existe hoje

Nada deste sistema. A única integração com o Mercado Pago no repositório é a
cobrança do **Wuavy Pulse** (`src/lib/flow/billing.ts`, `/api/mercadopago/webhook`,
migração `0003`), a R$ 297/mês, que esta especificação **não toca**. O valor de
R$ 149 citado no pedido não aparece em nenhum arquivo: a troca para R$ 40 é,
portanto, o valor com que o sistema nasce, não uma substituição de código.

## O serviço

**Manutenção Essencial — R$ 40/mês**, cobrado automaticamente todo mês depois
que o cliente autoriza.

Incluído: manutenção básica do site, correções técnicas e até **uma pequena
alteração por mês**.
Não incluído: domínio, hospedagem paga e mudanças maiores (novas páginas,
redesign, novas funcionalidades) — orçadas à parte.

O administrador pode definir um **valor personalizado** por cliente; R$ 40 é o
padrão.

## Decisões (e por quê)

### 1. Autorização pelo checkout hospedado do Mercado Pago

O cliente não tem conta na Wuavy. A página de assinatura é nossa e vende o
plano com a identidade do site; o **cartão** é entregue ao Mercado Pago.

Criamos uma assinatura sem plano associado (`POST /preapproval`, `status:
"pending"`, `auto_recurring` mensal com o valor do cliente) e mandamos o
cliente ao `init_point` que o Mercado Pago devolve. Ele autoriza lá e volta
ao `back_url`, que é a mesma página — que então lê o estado de volta do
Mercado Pago.

Alternativa descartada: o Card Payment Brick, como no Pulse. Ele coloca os
campos do cartão em iframes dentro da nossa página (mais superfície de risco,
e já conhecido por atritos de tema e de chaves de teste) sem ganho aqui, onde
não há sessão nem app a desbloquear no mesmo instante.

### 2. Webhook próprio, por assinatura

Cada `/preapproval` nosso leva o seu `notification_url`:
`/api/mercadopago/manutencao/webhook`. O webhook do Pulse continua recebendo
só o que é do Pulse, e **nenhuma linha dele muda**.

A validação é a mesma e vem de um lugar só: `verifySignature` de
`src/lib/flow/billing.ts`, importado (leitura, sem alteração). Nenhum aviso é
acreditado pelo corpo: a assinatura HMAC é checada, e só então o estado é
**lido de volta** do Mercado Pago com o nosso token e escrito. O mesmo aviso
duas vezes escreve a mesma coisa.

### 3. Painel com a autenticação que já existe

O painel usa o Supabase Auth do projeto mais uma lista de e-mails autorizados
em `WUAVY_ADMIN_EMAILS`. Sem senha nova, sem tabela de papéis, sem
dependência nova. Quem não está na lista não vê nada além da porta.

### 4. Tabelas próprias, só o servidor escreve

`maintenance_clients`, `maintenance_subscriptions`, `maintenance_payments`
(migração `0013`). RLS ligado e **sem políticas**: nenhuma chave de navegador
lê essas linhas. Todo acesso passa pelo servidor com a service role — a
página do cliente por um token aleatório na URL, o painel pela sessão de
administrador.

## Dados

```
maintenance_clients
  id, name, site_url, email, whatsapp, notes
  plan_name     default 'Manutenção Essencial'
  price_cents   default 4000          -- R$ 40, o padrão; o admin pode mudar
  token         unique, aleatório     -- o link individual do cliente
  created_at, archived_at

maintenance_subscriptions
  id, client_id → maintenance_clients
  provider 'mercadopago'
  provider_subscription_id  unique    -- o preapproval
  status  pending | active | past_due | cancelled
  amount_cents                        -- o valor cobrado nesta assinatura
  started_at, current_period_end, created_at, updated_at

maintenance_payments
  id, subscription_id → maintenance_subscriptions
  provider_payment_id  unique         -- a cobrança autorizada
  amount_cents, status, charged_at, created_at
```

Um cliente tem no máximo uma assinatura não cancelada (índice único parcial).

**Receita recorrente (MRR)** = soma de `amount_cents` das assinaturas
`active` e `past_due`. **Vencimentos** = `current_period_end`, como o Mercado
Pago informa a próxima cobrança.

## Telas

Grupo de rotas novo, `src/app/(care)` — fora do `(app)`, para a manutenção
não herdar o manifesto PWA nem o tema do Pulse. O `proxy.ts` ganha uma
passagem para `/manutencao` (hoje tudo que não é `/pulse` é reescrito para
`/[locale]`).

- `/manutencao/<token>` — a página do cliente. Preto, Paper, Signal, Mona
  Sans: a identidade do site. O plano, o valor, o que entra e o que não
  entra, e um botão que leva ao Mercado Pago. De volta, mostra onde a
  assinatura está. `robots: noindex`.
- `/manutencao/admin` — clientes, receita recorrente, próximos vencimentos,
  pagamentos recentes; criar cliente (nome, site, e-mail, valor) e copiar o
  link.
- `/manutencao/admin/<id>` — um cliente: assinatura, histórico de pagamentos,
  link, valor, arquivar.

## Erros

- Mercado Pago sem credenciais: a página diz que a assinatura online está
  sendo preparada e aponta o WhatsApp. Nada quebra.
- Mercado Pago recusa ou cai: a linha `pending` fica, com a mesma chave de
  idempotência (o id da linha), então repetir não cria uma segunda assinatura.
- Token desconhecido: 404.
- Aviso de uma assinatura que o Mercado Pago não conhece (teste do painel):
  200, sem retentativa.

## Testes

`npm run check` (typecheck, lint, build) e as telas abertas no navegador nos
três estados: sem credenciais, com cliente novo, com assinatura ativa. Os
fluxos de cartão de verdade exigem chaves `TEST-` do Mercado Pago, que não
estão no `.env.local` — ficam para quando estiverem.

## Fora do escopo

Cobrança do Pulse, e-mails automáticos de cobrança, nota fiscal, Pix ou
boleto (não cobram sozinhos todo mês), e o pt-PT desta página.
