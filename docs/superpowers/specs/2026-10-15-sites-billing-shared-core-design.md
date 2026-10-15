# Assinaturas de Sites — Sub-projeto 1: Núcleo compartilhado

**Data:** 2026-10-15
**Branch:** `sites-billing` (ramificado de `pulse-billing-ready`, commit `b0b19d0`)
**Parte de:** evolução do mini-sistema de Assinaturas de Sites da Wuavy (painel administrativo), decomposto em 5 sub-projetos. Este é o primeiro; os demais (modelo de dados, cobranças únicas/links, cartão na assinatura recorrente, redesign iOS) têm specs próprias, mais tarde.

## Intenção

Reaproveitar, sem duplicar, a integração Mercado Pago que o Pulse acabou de validar contra a API real — em especial o padrão `changed/unconfirmed/refused` para mudanças que já podem ter sido aceitas do outro lado — no sistema de Assinaturas de Sites (hoje em `src/lib/maintenance/`). Hoje os dois produtos têm implementações quase idênticas de `statusFrom`, `PROVIDER_ID`, e o sistema de sites não tem a segurança pós-escrita que o Pulse acabou de ganhar.

**Fora de escopo aqui:** modelo de dados (serviços múltiplos, histórico de preço), cobranças únicas, Pix/boleto, troca de cartão da manutenção, redesign visual. Cada um é um sub-projeto à parte.

## Diagnóstico

- `src/lib/flow/mercadopago-notice.ts` e `mercadopago-environment.ts` (Pulse) já são puros — sem Supabase, sem fetch — e já contêm o padrão validado: `statusFrom`, `cancelBodies`/`retryOtherSpelling` (as duas grafias de "cancelled"), `cardChangeBody`, `confirmedStatus` (repete só a leitura, uma vez, depois de uma escrita aceita), `runCardChange` (o fluxo inteiro de troca de cartão, com `CardChange` de 4 estados).
- `src/lib/maintenance/plan.ts` e `billing.ts` têm uma reimplementação paralela: `statusFrom` próprio, `PROVIDER_ID` próprio, `MaintenanceStatus` (um union de 4 strings idêntico a `SubscriptionStatus` do Pulse).
- **Achado:** o cancelamento da manutenção manda `POST /preapproval/{id}` com `{status: "cancelled"}`. A API do Mercado Pago usa **PUT** para atualizar uma assinatura — confirmado contra a API real de teste no trabalho do Pulse. A manutenção nunca foi exercitada contra a API real nesse ponto; é provável que esteja silenciosamente errada ou dependente de um comportamento não documentado do Mercado Pago aceitando POST.
- O `mp()` de `maintenance/billing.ts` só tipa `"GET" | "POST"` — não aceita PUT.

## Arquitetura

```
src/lib/mercadopago/
  environment.ts   # decide, declaredMode, checkoutDecision, payerEmailFor, REFUSAL, isProductionDeploy
  notice.ts        # BillingStatus, Preapproval, Charge, statusFrom, latestCharge, verifyNotice,
                    # cancelBodies, retryOtherSpelling, cardChangeBody, PROVIDER_ID, CARD_TOKEN,
                    # CardChange, confirmedStatus, runCardChange, httpsUrl
```

Ambos os arquivos continuam puros: sem `server-only`, sem Supabase, sem preço fixo de produto, sem framework. `src/lib/flow/billing.ts` (Pulse) e `src/lib/maintenance/billing.ts` (sites) importam dali. Cada produto mantém seu próprio `mp()` (chamada HTTP com o token do servidor) e sua própria escrita no Supabase — as tabelas são diferentes (`subscriptions` vs. `maintenance_subscriptions`), e essa separação por produto continua intacta.

### Um tipo a menos

`SubscriptionStatus` (Pulse, em `src/lib/flow/access.ts`) e `MaintenanceStatus` (sites, em `src/lib/maintenance/plan.ts`) são o mesmo union: `"pending" | "active" | "past_due" | "cancelled"`. Vira `BillingStatus` em `src/lib/mercadopago/notice.ts`, reexportado como `SubscriptionStatus` por `access.ts` e como `MaintenanceStatus` por `plan.ts` — quem já importa um nome ou outro não muda nada.

## Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `src/lib/mercadopago/environment.ts` | Novo (movido de `flow/mercadopago-environment.ts`, sem mudança de conteúdo) |
| `src/lib/mercadopago/notice.ts` | Novo (movido de `flow/mercadopago-notice.ts`, sem mudança de conteúdo) + `BillingStatus` |
| `src/lib/flow/billing.ts` | Imports atualizados para `@/lib/mercadopago/*`. Nenhuma mudança de comportamento. |
| `src/lib/flow/access.ts` | `SubscriptionStatus` vira um reexport de `BillingStatus`. |
| `src/lib/flow/mercadopago-environment.ts`, `mercadopago-notice.ts` | Removidos (conteúdo movido). |
| `src/lib/maintenance/plan.ts` | Remove `statusFrom`, `MAINTENANCE_STATUSES`/`MaintenanceStatus` locais; reexporta de `@/lib/mercadopago/notice`. Mantém `PLAN`, `parsePrice`, `brl`, `reais`, `dateLabel`, `isEarning`, `chargeFailed` (específicos da manutenção). |
| `src/lib/maintenance/billing.ts` | `mp()` passa a aceitar `"PUT"`. `cancelSubscription` usa `cancelBodies()` + `retryOtherSpelling` via PUT (como o Pulse), e a releitura final usa `confirmedStatus`. `PROVIDER_ID` local removido, importado do módulo compartilhado. |

## Fluxo do cancelamento, depois

1. Admin clica "Cancelar cobrança" em `/manutencao/admin/[client]` → server action `cancel()`.
2. `cancelSubscription(providerId)`: para cada corpo de `cancelBodies()`, `PUT /preapproval/{id}`; um 400 tenta a outra grafia (`retryOtherSpelling`); qualquer outra recusa sobe como está.
3. Escrita aceita → `confirmedStatus(() => syncSubscription(id), wait)`: lê de volta, e se a leitura falhar (429, indisponibilidade), espera e tenta mais uma vez. Sem resposta nas duas, devolve `null`.
4. A tela da manutenção não muda neste sub-projeto: ela já só revalida a página depois de `cancel()`, sem mostrar o retorno da action. O ganho é que a releitura agora tenta de novo antes de desistir, em vez de propagar um erro cru que a action hoje só registra no console. Um aviso explícito de "não confirmado" na tela fica para o sub-projeto 4/5, quando o painel ganha mais controle sobre a assinatura.

## Erros

Antes da escrita (PUT) ser aceita, uma falha é uma falha e sobe como está — igual ao Pulse. Depois da escrita aceita, nada é relatado como falha: no pior caso (releitura sem resposta nas duas tentativas), o chamador recebe `null`/`unconfirmed`, nunca um erro que pareça "a operação falhou".

## Testes

- `tests/card-change.test.mjs`, `tests/mercadopago-notice.test.mjs`, `tests/mercadopago-environment.test.mjs`: caminho de import atualizado para `src/lib/mercadopago/notice.ts` / `environment.ts`. Nenhum teste muda de conteúdo.
- Novo: `tests/maintenance-billing.test.mjs` — prova que `maintenance/billing.ts`'s `cancelSubscription` manda PUT (não POST) com `cancelBodies()`, e que a leitura final passa por `confirmedStatus` (mesmo estilo de fakes injetados do `card-change.test.mjs`, sem rede).
- `tests/clinical.test.mjs` e os demais testes do Pulse continuam passando sem alteração (nada do Prontuário ou do rebrand é tocado).
- `tsc --noEmit`, ESLint e `next build` no worktree isolado, como de praxe.

## Risco e reversão

Mudança mecânica + uma correção de verbo HTTP. O risco real está em não ter como testar o cancelamento da manutenção contra a API real do Mercado Pago de teste nesta spec (fica para quando o ambiente de teste da manutenção for validado, se ainda não foi — a auditoria anterior tratou só do Pulse). O plano de implementação deve incluir rodar `cancelSubscription` contra a API de teste pelo menos uma vez, à mão, antes de considerar a correção do verbo comprovada.

Reversão: a branch `sites-billing` é isolada; descartá-la (`git worktree remove` + `git branch -D`) não afeta `pulse-billing-ready`, `pulse-rebrand-3d` nem `main`.
