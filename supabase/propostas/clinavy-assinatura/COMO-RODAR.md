# Clinavy — assinatura: o que rodar, em que ordem, e o que cada resultado quer dizer

Três coisas. A 1 é local; a 2 é somente leitura; a 3 escreveu SÓ no projeto de TESTE,
com autorização. Nada aqui escreve em produção — a publicação tem o seu próprio
roteiro, em `PUBLICACAO.md`.

| # | O quê | Toca algo remoto? | Estado |
|---|---|---|---|
| 1 | Prova local da migration 0023 (Postgres em memória) | não | **feita**, 13/13 |
| 2 | Leitura comparativa no Mercado Pago real | sim, só GET | **precisa do seu token** |
| 3 | Aplicar e validar a 0023 no projeto de TESTE | sim, escreve no TESTE | **feita em 2026-11-01**, 12/12 |

---

## 1. Prova local da 0023 (feita)

```bash
cd supabase/propostas/clinavy-assinatura/pgspike
npm install
npm run prova
```

Sobe um Postgres de verdade em memória (PGlite), com o andaime do Supabase
(papéis `anon`/`authenticated`/`service_role`, `auth.uid()` por JWT) e todas as
migrations do repositório. Prova que a 0023:

- aplica por cima de um banco **que já tem assinaturas** sem alterar nenhuma;
- deixa as linhas de antes com `payer_email` nulo, e o código de antes continua
  inserindo sem a coluna;
- o CHECK recusa e-mail com qualquer espaço em branco (inclusive tabulação),
  curto demais (<3) e longo demais (>254), e aceita nulo e o limite exato;
- não afeta as garantias de unicidade das 0020/0021;
- **a RLS não muda**: a pessoa lê só o pagador da própria linha; `anon` não lê
  nada; `authenticated` continua **sem** poder inserir, alterar ou apagar;
- a reversão (`drop column`) funciona, leva a restrição junto e preserva a
  assinatura; reaplicar depois também funciona.

**O que isto NÃO prova:** o ambiente. É o SQL, num Postgres fiel, mas não é o
projeto de TESTE do Supabase. Por isso a etapa 3 existe.

---

## 2. Comparar a venda aprovada com as assinaturas (precisa do seu token)

O Access Token do Mercado Pago de produção só existe na Vercel; não há cópia
local e **nenhuma ferramenta daqui o lê**. Esta leitura é feita por você, na sua
máquina, e o token nunca passa por mais ninguém.

```powershell
# Só nesta janela do PowerShell. Cole o token da conta REAL (Mercado Pago →
# Seu negócio → Configurações → Credenciais → Produção → Access Token).
$env:MERCADOPAGO_ACCESS_TOKEN = "<cole aqui>"

node supabase/propostas/clinavy-assinatura/mp-leitura.mjs --venda <id-do-pagamento-aprovado> --desde 2026-10-16 --ate 2026-11-02

Remove-Item Env:MERCADOPAGO_ACCESS_TOKEN   # e feche a janela
```

**O que ele garante, e o teste `tests/mp-leitura.test.mjs` prova:** só faz `GET`
(se qualquer outro método sair, o teste falha); não grava o token; não imprime
e-mail, nome, documento, cartão nem o corpo de um erro — de uma identidade só
sai um sim/NÃO. Pode colar a saída inteira no atendimento.

### Como ler a saída

**"Venda aprovada → não encontrada com este token."** O token é de outra conta,
ou é de teste lendo uma venda real. Pare: nada abaixo vale. (Lembrete: o prefixo
`APP_USR-` não distingue conta real de conta de teste.)

**"collector_id … é a conta deste token: sim"** e, em cada assinatura/pagamento,
**"mesma conta vendedora da venda: sim"** → as recusas e a venda aprovada são da
**mesma conta vendedora**. Isso afasta "credenciais/conta errada" como causa. Um
**NÃO** em qualquer linha significa que há duas contas vendedoras envolvidas, e
o diagnóstico muda por completo.

**"o e-mail que enviamos (payer_email) é o da conta que pagou a venda: NÃO"** →
a assinatura foi criada nomeando um e-mail que não é o da conta do Mercado Pago
que pagou os R$ 20. É exatamente a condição do erro "Seu e-mail não corresponde
ao da assinatura". Com a 0023 no ar, a cliente declara o e-mail certo na tela.
**"sim"** nessa linha → a identidade não explica aquela tentativa; procure no
`status_detail`. (Se a cliente pagou os R$ 20 como visitante, sem conta do
Mercado Pago, o e-mail dela pode nem constar: a leitura dirá "informou e-mail:
indeterminado", e a comparação não se aplica.)

**"pagador no MP: NÃO"** → o Mercado Pago não associou aquela assinatura a
nenhuma conta. "Indeterminado" em "mesma conta de pagador" significa só que falta
o `payer_id` para comparar — **não** significa que seja outra conta.

**`status_detail`** (de cada cobrança e de cada pagamento de R$ 297). A tabela
oficial é a do próprio Mercado Pago; leia ali o significado exato de cada código.
Duas leituras úteis, a confirmar na tabela oficial:

- `cc_rejected_high_risk`: segundo a documentação do Mercado Pago, recusa pela
  prevenção a fraude dele. Se for isso, a decisão é **do Mercado Pago**, não do
  banco — compatível com o Nubank dizer que a transação não chegou. Só o
  suporte do Mercado Pago pode revertê-la.
- `cc_rejected_other_reason` e afins: o motivo vem do emissor ou é genérico.

**"PAGAMENTOS DE R$ 297 NO PERÍODO: 0"** com assinaturas existentes → as
tentativas do checkout hospedado não chegaram a virar pagamento. É coerente com
uma barreira de identidade, mas não prova sozinho: cruze com a coluna de
identidade acima.

**"LEITURAS QUE FALHARAM"** → o relatório está incompleto; releia depois.

### O que isto não resolve

Uma venda única de R$ 20 aprovada prova que a conta recebe e que o cartão da
cliente funciona **para aquele produto e aquele valor**. Não prova que
assinaturas recorrentes de R$ 297 estejam liberadas na conta: o Mercado Pago
pode aplicar regras de risco diferentes a recorrência e a valores maiores, e
isso só ele confirma. Se a identidade bater (acima) e ainda assim houver recusa
por risco, o caminho é o escalonamento em
`docs/clinavy-assinatura-investigacao.md`, seção 2.

---

## 3. A 0023 no projeto de TESTE (feita em 2026-11-01)

Aplicada **só** em `wazxofdzvzfgonmwsdhs`, depois de confirmar a identidade do
projeto e que a 0023 era a única migration pendente (`db push --dry-run`). Produção
(`trwrulahqytfbmoxajnc`) não foi tocada.

O que foi provado, no Postgres e no PostgREST de verdade:

- **Dados preservados:** a contagem e a impressão digital das linhas de antes
  (sem a coluna nova) são idênticas antes e depois; `payer_email` é null em todas.
- **A consulta do app:** `select` com a lista exata de colunas de
  `tests/helpers/subscription-select.mjs` falhava com 42703 antes e responde 200 depois.
- **CHECK:** recusa espaço em branco, vazio, curto e longo demais; aceita 254 caracteres
  e um endereço comum (a tabulação e a quebra de linha são provadas na prova local).
- **RLS e privilégios:** `authenticated` e `anon` leem a própria linha e não escrevem
  (nem o pagador, nem o status), e o `service_role` escreve normalmente.
- **Compatibilidade:** inserir sem a coluna (o que o código antigo faz) segue valendo.

Para repetir (opt-in com `WUAVY_RUN_REAL_E2E=1`, só contra o TESTE; a trava de rede
recusa a produção): `tests/pulse-payer-email-real.test.mjs`.

Reverter, se algo destoar: `alter table subscriptions drop column payer_email;` —
preserva todas as assinaturas (ver a ordem correta de reversão em `PUBLICACAO.md`).

---

## Publicação

O roteiro completo — ordem, pré-condições, conferências e reversão — está em
**`PUBLICACAO.md`**. O resumo que não pode se perder: **a 0023 antes do código**, e o
`db push` aplica TODAS as pendentes, então o `--dry-run` tem de listar só a 0023.
