# Cupons de Representantes — Wuavy Cobranças

**Data:** 2026-10-27
**Branch:** `billing-coupons` (ramificada de `sites-billing`, commit `70e50a3`)
**Worktree:** `C:\Users\User\wuavy-billing-coupons`
**Parte de:** Wuavy Cobranças (`/cobrancas`), ao lado de Clientes, Serviços e Lançamentos (migrations 0018/0019, ainda não mescladas em `main`).

**Correção pós-validação (2026-10-27):** a migration é `0022`, não `0020` como o texto abaixo ainda diz em alguns lugares. `0020` e `0021` já estão de fato aplicadas no projeto de teste (`wazxofdzvzfgonmwsdhs`) pela branch `fix/pulse-subscription-reconciliation`, sem relação com cupons — achado pela checagem remota (`supabase migration list --project-ref wazxofdzvzfgonmwsdhs`) antes de qualquer aplicação. O arquivo já foi renomeado; esta nota é só para quem lê o texto original abaixo.

## Intenção

Representantes comerciais da Wuavy (ex.: Bruna, código `BRU10`) divulgam um cupom.
O cliente fala com a Wuavy pelo WhatsApp e cita o código; a administradora confere
o cupom no painel, gera a cobrança já com o desconto aplicado, e o resultado fica
atribuído ao representante. Sem resgate público, sem login de representante, sem
comissão automática — só o controle de quem indicou o quê e quanto isso já rendeu.

**Fora de escopo nesta etapa:** sistema de afiliados, comissão financeira, login de
representante, cupom em cobrança recorrente (não existe ainda — ver "Separação de
recorrência" abaixo).

## Diagnóstico

`/cobrancas` já existe e resolve sozinho boa parte do que o cupom precisa:

- `billing_clients`, `billing_services` (migration 0018) e `billing_charges`/
  `billing_payments` (migration 0019): cobrança única por Checkout Pro, valor
  congelado na criação, status sincronizado do Mercado Pago (nunca do navegador).
- `billing_charges.kind` tem `check (kind in ('once'))` — **cobrança recorrente não
  existe neste sistema hoje.** Isso resolve de graça a regra "desconto só na
  primeira cobrança": não há como um cupom reaplicar automaticamente a nada, porque
  nada se repete automaticamente.
- `maintenance_subscriptions` (manutenção) e `subscriptions` (Pulse) são tabelas
  completamente separadas, sem FK nem código compartilhado com `billing_*`. Cupons
  não vão ganhar nenhum caminho até elas — é assim que a regra "não alterar
  assinaturas já existentes nem os preços fundadores do Pulse" fica garantida pela
  própria estrutura, não por uma verificação em tempo de execução.
- `lancamentos/actions.ts::addCharge` já valida tudo no servidor antes de inserir
  (cliente, serviço, preço via `parsePrice`) — o mesmo ponto onde o cupom entra.

## Modelo de dados (migration 0020, aditiva)

```
billing_representatives
  id, name, whatsapp, notes, active, created_at
  -- só `active` (como billing_services) — não `archived_at`: as duas juntas
  -- (como em billing_clients) permitiriam o estado contraditório active=true
  -- com archived_at preenchido. Quando foi desativado já fica em
  -- billing_coupon_audit, sem precisar de uma segunda coluna aqui.

billing_coupons
  id, representative_id → billing_representatives
  code (unique, normalizado em caixa alta)
  discount_type ('percent' | 'fixed')
  discount_percent smallint        -- 1–100, só quando discount_type = 'percent'
  discount_fixed_cents integer     -- centavos, só quando discount_type = 'fixed'
  -- exatamente um dos dois preenchido, pelo check de discount_type — o nome
  -- de cada coluna já diz a unidade, como todo outro valor em dinheiro deste
  -- projeto (amount_cents, default_price_cents, discount_cents): nunca um
  -- "discount_value" ambíguo entre reais, centavos ou fração.
  first_payment_only boolean default true   -- ver "Separação de recorrência"
  valid_from, valid_until (null = sem validade)
  max_uses (null = ilimitado)
  active, created_at, updated_at

billing_coupon_services
  coupon_id, service_id      -- vazio = vale para qualquer serviço

billing_coupon_audit
  id, admin_email, representative_id, coupon_id, action, detail, created_at
  -- só mudanças de cadastro (criar/editar/desativar). O uso de um cupom já fica
  -- registrado de forma permanente na própria billing_charges (abaixo) — duplicar
  -- isso aqui seria o mesmo dado em dois lugares.

billing_charges  (ALTER, duas colunas novas)
  + coupon_id → billing_coupons (on delete set null; nunca é de fato apagado)
  + discount_cents integer not null default 0
```

`amount_cents` continua significando exatamente o que significa hoje: o valor final
e congelado que o Mercado Pago cobra. `discount_cents` é só o quanto foi abatido
para chegar lá — `amount_cents + discount_cents` é o valor original do orçamento.
Nada em `createPreference`, no webhook ou na sincronização de pagamento muda.

## Cálculo e validação — sempre no servidor

O formulário manda `client_id`, `service_id`, `description`, `price` (o valor do
orçamento, exatamente como hoje) e, novo, `coupon_code` (opcional). **Nenhum campo
de desconto ou valor final vem do navegador.** `addCharge` busca o cupom pelo
código, recalcula tudo e só então grava. Pontos de recusa, antes de criar a linha:

1. Cupom não existe, inativo, ou fora de `valid_from`/`valid_until`.
2. Serviço escolhido não está entre os elegíveis do cupom (cupom sem nenhum
   serviço cadastrado em `billing_coupon_services` = vale para todos). Uma cobrança
   sem serviço (descrição livre) só aceita um cupom sem restrição de serviço.
3. **Serviço com `kind = 'recurring'`: cupom recusado.** Mesmo cobrança recorrente
   não existindo em `billing_charges` hoje, o catálogo rotula alguns serviços como
   "Recorrente" (ex.: manutenção, tráfego pago) — aplicar um cupom aí criaria a
   impressão de um desconto que se repetiria todo mês, o que esta etapa não entrega.
4. Desconto calculado ≥ valor do orçamento: recusado (nunca abatido/limitado em
   silêncio — a administradora vê a mensagem e ajusta).
5. Limite de uso (`max_uses`) atingido — ver a seguir.

## `max_uses` sob cobranças simultâneas

A regra, como combinada: cobrança **pendente** reserva o cupom temporariamente e
essa reserva expira sozinha; **aprovada** conta como uso permanente; **reembolso
não libera** a vaga de volta.

```
usosEfetivos(cupom, agora) =
    nº de billing_charges com este coupon_id e
      status = 'approved'
    + status = 'refunded'
    + (status = 'pending' E created_at > agora − 48h)
```

Isso é função pura sobre as linhas já existentes (sem contador novo para manter
sincronizado, sem passo de "liberar" em lugar nenhum): uma reserva pendente some da
contagem sozinha depois de 48h, sem precisar de nenhum job em segundo plano — e
este projeto não tem nenhum. `addCharge` recusa a criação quando `usosEfetivos >=
max_uses`, antes de inserir a linha.

**Sobre a segurança de verdade sob concorrência:** uma contagem lida e depois usada
numa decisão (`SELECT` seguido de `INSERT`) tem, em teoria, uma janela de corrida —
duas requisições no mesmíssimo instante poderiam ler a mesma contagem e as duas
passarem. Fechar essa janela de verdade exigiria travar a linha do cupom
(`SELECT ... FOR UPDATE` dentro de uma função do Postgres que também fizesse o
`INSERT`), o que significa criar a primeira *stored procedure* deste projeto só
para isso. Dado que `/cobrancas` é operado por uma única pessoa, uma cobrança por
vez, pelo formulário — não é um checkout público com milhares de tentativas por
segundo — a decisão aqui é não pagar esse custo agora: o pior cenário real de uma
corrida é uma cobrança extra criada no limiar exato do limite, nunca dinheiro
perdido (o que de fato vale, `amount_cents`, só é cobrado se o Mercado Pago aprovar
depois). Fica registrado como limite assumido, não como lacuna não vista — revisitar
se este painel algum dia tiver mais de uma pessoa operando ao mesmo tempo.

## Separação de recorrência

Verificado ponto a ponto contra a regra "desconto só na primeira cobrança, sem
tocar assinatura recorrente ou preço fundador":

- `billing_charges.kind` só aceita `'once'` — não existe uma segunda cobrança
  automática à qual um desconto pudesse "vazar".
- `maintenance_subscriptions.amount_cents` e `subscriptions.amount_cents` (Pulse)
  nunca são lidos nem escritos por nada deste projeto — zero FK, zero import.
- `first_payment_only` entra no schema desde já (default `true`) para que os
  cupons criados agora já carreguem a intenção certa, mas **não tem nenhuma lógica
  de verdade para aplicar nesta etapa** — não existe "segunda cobrança" de uma série
  para distinguir da primeira. Passa a valer no dia em que `billing_charges` ganhar
  `kind = 'recurring'` (uma etapa futura, fora deste escopo).

## Painel `/cobrancas/representantes`

Cadastro de representantes + cupons (criar, editar, ativar/desativar — nunca
apagar) e, por representante, um painel de resultados com os números separados por
significado, sem repetir o mesmo cliente duas vezes:

| Número | De onde vem |
|---|---|
| Cupons ativos | `count(*)` dos cupons do representante com `active = true` |
| Indicações registradas | `count(*)` de `billing_charges` com `coupon_id` de um cupom deste representante, qualquer status — um evento por cobrança criada |
| Cobranças pendentes | idem, `status = 'pending'` |
| Vendas confirmadas | idem, `status = 'approved'` |
| Clientes convertidos | `count(distinct client_id)` entre as aprovadas — **nunca `count(*)`**, para não contar o mesmo cliente duas vezes se ele comprar de novo com o mesmo cupom |
| Faturamento atribuído | `sum(amount_cents)` entre as aprovadas |
| Descontos concedidos | `sum(discount_cents)` entre as aprovadas |

`refunded` entra em "usos efetivos" (acima, trava o cupom) mas **sai** de
faturamento/conversão/desconto concedido — o dinheiro voltou, não é receita, ainda
que a vaga do cupom continue gasta. Os dois cálculos são deliberadamente
independentes.

Desativar um representante desativa os cupons dele junto: um `UPDATE` de verdade
em `billing_coupons.active`, não uma condição calculada na hora. **Reativar o
representante não reativa os cupons de volta** — cada um só volta a valer se a
administradora reativar aquele cupom especificamente. Assimetria deliberada: a
administradora pode ter desativado um cupom por um motivo próprio (promoção
vencida) sem relação com o representante, e uma reativação em massa destruiria
essa decisão em silêncio. Criar ou reativar um cupom sob um representante inativo
é recusado ("reative o representante primeiro") — isso mantém sempre verdadeiro
"cupom ativo ⇒ representante ativo", então a busca do cupom em `addCharge` só
precisa conferir `billing_coupons.active`, nunca um join a mais.

Nada disso apaga uma linha: `billing_charges.coupon_id` e tudo que já foi
faturado continuam legíveis exatamente como estavam, representante e cupom
desativados ou não — a mesma garantia que `billing_clients`/`billing_services` já
dão hoje (arquivar, nunca apagar).

## Compartilhamento

**Correção pós-revisão (2026-10-27):** a primeira versão deste texto, abaixo,
conflava dois pedidos diferentes do briefing original em um só e descrevia um
link que o código nunca implementou. Separando:

1. *"Gerar uma mensagem de WhatsApp pronta para o representante compartilhar"*
   — obrigatório. É isto que existe: por cupom (um representante pode ter mais
   de um — "associar cupons a cada representante", no plural), um texto na voz
   do representante (`shareMessage`) e um botão que abre uma conversa com **o
   próprio representante** (`waLink(representative.whatsapp, message)`) para a
   administradora mandar esse texto pronto a ele. `CopyLink` também mostra o
   texto, para colar em qualquer canal.
2. *"Opcionalmente, gerar um link de indicação da Wuavy que prepare o contato
   por WhatsApp com o código preenchido"* — explicitamente opcional no pedido
   original, e **não construído nesta etapa**. Exigiria um segundo texto, na
   voz de um cliente em potencial (não do representante), apontando para o
   WhatsApp da própria Wuavy — um artefato genuinamente separado do primeiro,
   não a mesma mensagem com outro número. Fica para quando/se for pedido.

Nenhum clique em nada disto é registrado como indicação — só a administradora
criar a cobrança com o cupom é que gera uma indicação de verdade.

## Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0020_billing_coupons.sql` | Novo. Três tabelas + `alter table billing_charges` (duas colunas). Aditiva, RLS ligado sem política (mesmo padrão de 0013/0018/0019). Não aplicada — revisar antes de rodar. |
| `src/lib/billing/coupons.ts` | Novo. Puro primeiro: `computeDiscount`, `effectiveUses`, elegibilidade de serviço — testável sem rede nem banco, no espírito de `create-charge.ts`. Depois, a camada com Supabase: `lookupCoupon`, `createRepresentative`, `createCoupon`, `listRepresentatives` etc. |
| `src/app/(care)/cobrancas/representantes/page.tsx` + `actions.ts` | Novo. Mesmo padrão de autenticação e formulário de `clientes/` e `servicos/`. |
| `src/components/billing/RepresentativeForm.tsx`, `CouponForm.tsx` | Novo. |
| `src/app/(care)/cobrancas/lancamentos/actions.ts` | `addCharge`: novo campo opcional `coupon_code`; valida e recalcula antes do insert; grava `coupon_id`/`discount_cents`. |
| `src/components/billing/ChargeForm.tsx` | Campo "Cupom (opcional)"; painel de resultado mostra original → desconto → final. |
| `clientes/page.tsx`, `servicos/page.tsx`, `lancamentos/page.tsx` | Novo link "Representantes" na navegação já existente (sem extrair componente — seguindo a duplicação que o próprio projeto já escolheu nas outras três páginas). |

## Testes

- `tests/billing-coupons.test.mjs`: `computeDiscount` (percentual, fixo, desconto
  maior que o valor, serviço fora da elegibilidade, serviço recorrente recusado),
  `effectiveUses` (aprovada conta, reembolso conta, pendente fresca conta, pendente
  velha não conta, rejeitada/cancelada nunca conta).
- `tests/billing-coupons-stats.test.mjs`: o cálculo de "clientes convertidos"
  deduplica um cliente que aparece em duas cobranças aprovadas.
- `tsc --noEmit`, ESLint e `next build` no worktree isolado, antes de considerar
  pronto — nenhum deploy nem push.

## Risco e reversão

Mudança aditiva: nenhuma coluna ou tabela existente perde significado, nenhum
serviço externo (Mercado Pago, Supabase de produção) é tocado — a migration fica
escrita, não aplicada, até autorização separada. Risco real está só na janela de
concorrência do `max_uses`, documentada e aceita acima. Reversão: `billing-coupons`
é isolada; descartar a branch não afeta `sites-billing`, `pulse-rebrand-3d` nem
`main`.
