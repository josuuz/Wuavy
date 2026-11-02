# Clinavy — assinatura: publicação em produção (ordem exata, conferências e reversão)

**Nada aqui foi executado em produção.** Este é o roteiro para quando houver
autorização explícita, separada, para (a) aplicar a migration 0023 em produção e
(b) fazer commit, push, merge e deploy. Quem executar precisa de cada uma das duas.

Projetos: produção **`trwrulahqytfbmoxajnc`**; TESTE `wazxofdzvzfgonmwsdhs`
(onde a 0023 já foi aplicada e provada). `supabase/.temp` e o `.env.local` da
árvore principal apontam para a PRODUÇÃO: use sempre `--project-ref` explícito.

**Flags verificadas na CLI instalada (v2.119.0)**, porque uma delas não é óbvia:
- `migration list` e `db push` aceitam `--project-ref <ref>` sozinhos.
- `db query` **não** aceita `--project-ref` sozinho: exige `--linked --project-ref <ref>`
  (sem `--linked` a CLI recusa com `DbQueryMutuallyExclusiveFlagsError`). Com os dois,
  o `<ref>` manda, mesmo em uma árvore sem `supabase/.temp`. A saída é JSON
  (`{"rows":[…]}`), com um aviso de "dados não confiáveis" que não faz parte das linhas.
- Nenhum desses comandos precisa de `.env.local`: usam o login da própria CLI.

Nos comandos abaixo, `$P` é a referência da produção:
```
P=trwrulahqytfbmoxajnc
```

---

## 0. A regra que decide a ordem

**A 0023 entra na produção ANTES do código.**

- Código novo contra banco sem a coluna: toda leitura de assinaturas falha, e o
  código agora **fecha** nesse caso (não libera). Resultado: enquanto a migration
  não entra, QUALQUER clínica — inclusive as que pagam — vê o app em
  "não conseguimos confirmar sua assinatura" (somente leitura), e ninguém consegue
  assinar. É o preço de não ter mais o fail-open; é só ordem de publicação.
- Código antigo contra banco com a coluna: **funciona**. Nunca escreve a coluna e
  nenhuma consulta antiga a lista (provado: `prova-0023.mjs`, "a coluna é opcional",
  e a compatibilidade rodada de verdade no TESTE).

Por isso a migration pode ir primeiro sem derrubar nada, e o deploy só vai depois
de a coluna estar conferida.

## 1. Pré-condições (todas, antes de qualquer comando contra a produção)

1. **Autorização** explícita para aplicar a 0023 em produção e, separadamente,
   para commit/push/merge/deploy.
2. **O histórico REAL de migrations da produção**, só leitura. A sondagem de
   objetos que já foi feita (PostgREST, sem escrita) indicou que 0017–0022 estão
   presentes e `payer_email` está ausente (consulta à coluna → HTTP 400 / 42703),
   mas isso é inferência a partir de objetos — um índice como o da 0021 não se vê
   por ali — e **não substitui** o histórico:
   ```
   npx supabase migration list --project-ref trwrulahqytfbmoxajnc
   ```
   Esperado: 0001–0022 nas duas colunas (local e remoto) e a **0023 só local**.
   Qualquer outra diferença → **parar** e decidir com a pessoa responsável.
   (Lido em 2026-11-01, somente leitura: era exatamente isso. Leia de novo na hora de
   aplicar; o histórico pode ter mudado.)
3. **O `db push` aplica TODAS as pendentes**, não só a 0023. Rode primeiro:
   ```
   npx supabase db push --project-ref trwrulahqytfbmoxajnc --dry-run
   ```
   A lista tem de ser **exatamente** `0023_clinavy_subscription_payer_email.sql`.
   Se vier mais alguma, não aplique. (O push também recusa rodar se o remoto tem
   versões que a pasta local não tem — ver `PUBLICACAO-INDEPENDENTE.md` do Prontuário.)
4. **O que existe em produção sobre a tabela**, só leitura (a revisão de banco leu as
   migrations, não o que o painel do Supabase possa ter criado):
   Uma consulta por vez, cada uma com `--linked --project-ref $P` (ver a nota de flags no topo):
   ```
   npx supabase db query --linked --project-ref $P "select polname, polcmd from pg_policy where polrelid = 'public.subscriptions'::regclass"   # só SELECT
   npx supabase db query --linked --project-ref $P "select tgname from pg_trigger where tgrelid = 'public.subscriptions'::regclass and not tgisinternal"   # nenhum
   npx supabase db query --linked --project-ref $P "select count(*) from subscriptions"   # anote
   ```
   Uma política de escrita, um trigger ou uma view dependente que ninguém conhece é motivo
   para parar e olhar antes de aplicar.
5. **Backup** da tabela que a 0023 altera (`subscriptions`), **sem Docker e sem copiar
   segredo para lugar nenhum**. O `dump.mjs` do Prontuário NÃO serve aqui: ele lê o
   `.env.local` da raiz do repositório onde está o script, e a worktree não tem esse
   arquivo (copiar a chave de serviço da produção para uma pasta em `AppData/Temp` é
   exatamente o que não se faz). Em vez disso, o `db query` usa o login da CLI:
   ```
   B=C:/Users/User/wuavy-backups/<data>-0023     # fora do repositório e fora de Temp
   mkdir -p "$B"
   npx supabase db query --linked --project-ref $P "select * from subscriptions order by created_at, id" > "$B/subscriptions.json"
   npx supabase db query --linked --project-ref $P "select count(*) as total from subscriptions" > "$B/contagem.json"
   sha256sum "$B"/*.json > "$B/SHA256.txt"
   ```
   Conferir que o número de objetos em `rows` de `subscriptions.json` é igual ao `total` de
   `contagem.json` (é a contagem que o passo 2.3 compara). O arquivo contém e-mails de
   clientes e ids do Mercado Pago: guarde-o fora do repositório e não o envie a ninguém.
   A 0023 não altera nenhuma linha; o backup é para a reversão e para comparar. Se
   também quiser as demais tabelas, o `dump.mjs` só roda a partir de uma árvore que
   TENHA o `.env.local` (a principal), por decisão de quem tem acesso a ele — não é
   necessário para esta migration.
6. **Janela**: nenhum dump nem transação longa aberta em `subscriptions`. O `ALTER`
   espera o lock exclusivo atrás de qualquer transação aberta; a migration tem
   `lock_timeout = '5s'` e **falha limpa** (55P03, nada aplicado) se não conseguir.
   Repetir é seguro.
7. **A árvore de código** que vai subir é a dos patches revisados, com
   `npm test`, `tsc`, `eslint` e o build verdes, e o build do preview da Vercel verde
   (o build local pode ser impedido pelo bloqueio ao Google Fonts).
8. **O Preview da Vercel NÃO está isolado por padrão** (conferido em 2026-11-01 com
   `vercel env ls`, que lista só nomes e alvos, nunca valores). Para uma branch nova:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` são **uma única
     variável** marcada "Preview, Production": o Preview aponta para o MESMO Supabase da
     produção. Quem entrar na URL de preview autentica contra os usuários reais.
   - `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_ENV` existem só
     em Production e em Previews de branches específicas (`sites-billing`,
     `fix/pulse-subscription-reconciliation`, `pulse-rebrand-2d`). Uma branch nova não
     as herda: nenhuma escrita administrativa e nenhuma cobrança são possíveis a partir dela,
     mas a leitura via RLS, sim, contra dados reais, e o build pode falhar ou degradar sem
     essas variáveis.
   - Antes do push, com autorização própria, criar para a branch
     `fix/clinavy-assinatura-pagador` as variáveis de Preview apontando para o projeto de
     TESTE (`wazxofdzvzfgonmwsdhs`) e para as credenciais de teste do Mercado Pago
     (`vercel env add <NOME> preview fix/clinavy-assinatura-pagador`), como já foi feito
     para as outras branches. Sem isso, o preview é só um teste de build, não de
     comportamento: não faça nele nenhum fluxo de assinatura.

## 2. Ordem de execução

### 2.1 Aplicar a 0023 em produção
```
npx supabase db push --project-ref trwrulahqytfbmoxajnc
```
Dura segundos: `ADD COLUMN` anulável sem default não reescreve a tabela; o
`CHECK` varre as poucas linhas; o `REVOKE` é só catálogo. Nenhum índice, nenhuma
linha tocada.

### 2.2 Conferir no banco (somente leitura)
Cada consulta com `npx supabase db query --linked --project-ref $P "<sql>"`:
```sql
select column_name, data_type, is_nullable from information_schema.columns
 where table_name = 'subscriptions' and column_name = 'payer_email';             -- text, YES
select conname from pg_constraint where conname = 'subscriptions_payer_email_shape';   -- 1 linha
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'subscriptions' and grantee in ('anon','authenticated');     -- só SELECT
select count(*) total, count(*) filter (where payer_email is null) sem_pagador from subscriptions;  -- iguais
```

### 2.2b O PostgREST enxerga a coluna? (antes do deploy)
O app lê `payer_email` por ele. Se o cache de esquema ainda não recarregou, a leitura falha
e o código novo fecha TODAS as clínicas. Sem chave de serviço e sem copiar segredo: a
chave publicável é pública, e o Node lê o `.env.local` da árvore principal só na memória
(`--env-file`), sem imprimir nem copiar nada:
```
node --env-file="C:/Users/User/Wuavy web/.env.local" -e "fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/subscriptions?select=payer_email&limit=1',{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}}).then(async r=>console.log(r.status, (await r.text()).slice(0,200)))"
```
Coluna conhecida: **200** (lista vazia, a RLS não mostra linhas a quem não entrou) ou um
erro de permissão (401/403, 42501). Coluna ainda desconhecida pelo PostgREST: **400** com
código `42703` (foi assim que a coluna ausente foi vista antes). Se vier 400/42703 depois
da migration, rodar `npx supabase db query --linked --project-ref $P "notify pgrst, 'reload schema'"`
e repetir. Só sem 400/42703 o deploy pode ir.

### 2.3 Conferir que nada mudou
`select count(*) from subscriptions` igual ao do backup. As linhas de antes têm
`payer_email` null (o código as trata como "use o e-mail da conta", que foi o que
elas enviaram).

### 2.4 Só então: commit, push, merge, deploy
Com a coluna conferida. O código novo funciona de imediato.

### 2.5 Conferências depois do deploy (nenhuma cobra, cria ou cancela nada real)
1. `/clinavy/assinar` abre com uma conta de teste da própria Wuavy; o
   formulário mostra o e-mail da conta e, para o responsável, o campo de pagador.
2. Uma clínica que já paga continua com o uso normal (entrar com uma conta da
   Wuavy que tenha assinatura ativa, não com a de cliente).
3. Painel `/clinavy/admin`, auditoria por e-mail (somente leitura): sem a faixa
   "alguma leitura não respondeu".
4. Logs da Vercel nas primeiras horas: procure `getSubscriptions: ler as
   assinaturas`. Uma ocorrência isolada é uma queda; **várias seguidas** são o
   sinal de coluna ausente ou de banco fora — o app está fechado por segurança, e a
   causa é a do passo 0.
5. **Reconciliar as assinaturas existentes** (ação "reconciliar" do painel, que lê o Mercado
   Pago e grava o estado real). A prova `first_payment_confirmed_at` só passou a ser gravada
   para toda linha com este código; as linhas pagas antes do deploy a ganham na próxima
   sincronização, e as canceladas só por webhook. É um caso estreito, e fecha com isso.
   Isto ESCREVE em produção (no estado das linhas, a partir do que o Mercado Pago disse):
   faça só nas linhas com `provider_subscription_id`, e só com a autorização desta etapa.
6. Só depois, pedir à cliente que tente assinar e, se o Mercado Pago recusar com
   "Seu e-mail não corresponde", usar o campo de pagador.

## 3. Reversão

| Problema | O que fazer | Perde dados? |
|---|---|---|
| O código novo se comporta mal | Na Vercel, **promover o deploy anterior**. Não mexe no banco; o código antigo roda com a coluna. | Não |
| A migration falhou no meio | Nada: roda numa transação, não fica meia-aplicada. Se foi o `lock_timeout`, repetir fora de um dump. | Não |
| Precisa desfazer a coluna (improvável) | **Primeiro** reverter o código (linha acima), **depois** salvar `select id, user_id, organization_id, status, payer_email from subscriptions where payer_email is not null;`, **depois** `set lock_timeout = '5s'; alter table subscriptions drop column payer_email; reset lock_timeout;` (leva a restrição junto; o `drop` também pede lock exclusivo). O `grant` só se a revogação precisar voltar. | Só os pagadores declarados que diferem do e-mail da conta |

**O rollback mais simples é só o código, deixando a coluna**: ela é anulável, inofensiva para
o código antigo e não perde dado. Derrubar a coluna só se houver um motivo próprio.

Nunca reverter o banco com o código novo no ar (o `select` de `payer_email` falharia e todas
as clínicas cairiam em somente leitura): uma tentativa pendente já enviada
reenviaria, na retomada, o e-mail da conta sob a mesma chave de idempotência com
corpo diferente.

## 4. O que esta publicação não faz

- Não muda o valor (R$ 297/mês) nem a regra dos primeiros clientes: o preço de uma
  assinatura existente nunca é editado (`lib/flow/subscription-payload.ts`).
- Não explica nem corrige as recusas do Mercado Pago: a causa real delas depende de
  `status_detail`, que só o token da conta real lê (`mp-leitura.mjs`, seção 2 do
  `COMO-RODAR.md`).
- Não foi testada em um iPad físico: a correção do diálogo foi provada em WebKit
  real (15.4, 17.4, 26.0), não em aparelho.
- A regra de evidência de pagamento vale para **criar uma clínica nova**
  (`/comecar`); ela não retira o uso de nenhuma clínica que já existe.
