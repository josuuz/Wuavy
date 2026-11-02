# Clinavy — assinatura: investigação, correções e o que depende do Mercado Pago

Base da investigação: `origin/main` em `d0d3083` mais o commit `aeb88e2`
(correção preliminar do iPad, branch `fix-assinatura-ipad`). O `main` local
estava parado em `b0b19d0`; **o estado publicado é `d0d3083`**, e o commit
`37953d0` citado como "última main conhecida" é bem anterior — é o commit que
trocou o Card Brick pelo checkout hospedado, em **30/10**.

Nada aqui escreveu no Supabase ou no Mercado Pago de produção. A única coisa lida
em produção foi o esquema do banco, só leitura (seção 7); a 0023 foi aplicada
unicamente no projeto de TESTE.
Nenhum e-mail de cliente, dado de cartão ou conteúdo clínico aparece neste
documento: onde um valor real seria necessário, há um marcador entre `< >`
para quem conduzir o atendimento preencher.

---

## 1. Causa do erro de e-mail (resolvida no código)

**Sintoma:** no checkout hospedado, "Seu e-mail não corresponde ao da
assinatura".

**Causa:** o checkout hospedado de assinaturas identifica quem paga pelo
`payer_email` gravado na assinatura (`POST /preapproval`). Quem abre o
`init_point` precisa estar logado no Mercado Pago **com a conta daquele
e-mail**. O Clinavy enviava sempre `session.user.email` — o e-mail da conta do
Supabase Auth — sem nenhuma forma de a pessoa declarar outro. Quando a conta do
Mercado Pago da cliente usa outro endereço, não havia saída pela tela: era por
isso que criar uma segunda conta parecia a única alternativa (e não resolve,
porque o problema nunca esteve na conta do Clinavy).

O `payer_email` é documentado como obrigatório e como o campo que vincula a
assinatura a um e-mail. A mensagem de erro em si não está documentada; a
confirmação do comportamento vem de relatos convergentes de integradores mais
a experiência real da cliente — não de uma página oficial.

**Correção:** o pagador passou a ser um dado da **linha** de assinatura
(coluna nova `payer_email`, migration `0023`), declarável pela pessoa na
própria tela. Isso não burla validação alguma: manda exatamente o que o Mercado
Pago valida, e ele continua recusando quem entrar com outra conta.

Por que na linha, e não calculado na hora: a chave de idempotência da criação é
o id da linha, e a regra do projeto é "o mesmo corpo para a mesma referência"
(`src/lib/flow/subscription-payload.ts`). Se o pagador viesse do código, uma
retomada depois de a pessoa trocar de e-mail reusaria a mesma chave com outro
corpo. Guardado na linha, o corpo de uma linha nunca muda.

Trocar de pagador, então, **encerra a tentativa pendente no Mercado Pago** e
faz nascer uma linha nova. Se o encerramento não for confirmado, nenhuma linha
nova nasce — duas assinaturas recorrentes vivas é o único erro que não se pode
cometer aqui.

### Por que isto não permite vinculação indevida

- **O `payer_email` nunca resolve identidade nem linha.** O webhook e a
  sincronização acham a linha por `provider_subscription_id` ou por
  `external_reference` (o id da nossa linha). O e-mail só aparece na criação,
  na auditoria de suporte e na tela — verificado por busca no código.
- **Declarar um e-mail só muda quem o Mercado Pago aceita como pagador**, e ele
  continua validando: quem não entrar com aquela conta segue recusado. A
  assinatura é sempre da clínica de quem a criou, seja quem for o pagador.
- **Só o servidor escreve o pagador.** O papel `authenticated` não tem política de
  insert/update/delete em `subscriptions` (provado em
  `supabase/propostas/clinavy-assinatura/pgspike/prova-0023.mjs`).
- **A tela lê o pagador da própria linha, sob a RLS.** Uma versão anterior
  expunha um leitor por id com o cliente admin, que devolvia o e-mail de
  *qualquer* linha a *qualquer* chamador (todo export de um arquivo `"use
  server"` vira endpoint). Foi achado em revisão e removido;
  `tests/pulse-payer-email.test.mjs` agora trava a lista de exports.
- **Nunca reaproveita um checkout pendente de outro e-mail:** a tentativa é
  encerrada no Mercado Pago antes de qualquer linha nova existir.

**O que fecha o caminho de uma troca de pagador (cada item tem teste que cai sem ele):**

- **Só o responsável pela clínica troca o pagador.** Trocar cancela a tentativa
  pendente da *clínica* no Mercado Pago; um membro comum é recusado no servidor.
- **Limite de quatro tentativas por hora**, contando TODAS as linhas criadas, inclusive
  as recusadas na criação (que custam uma chamada ao Mercado Pago). Vale para a troca
  de pagador e para o "Assinar" simples quando ele vai criar uma linha nova. Retomar a
  mesma tentativa (o mesmo pagador) nunca é limitado: nada é criado.
- **Pagamento aprovado na corrida:** depois de cancelar a tentativa antiga, se uma
  cobrança foi aprovada nela — ou se a busca de cobranças falhou de um jeito que não
  permite saber (5xx, queda de rede) — NENHUMA assinatura nova é criada: o mês pago
  continua valendo e uma segunda assinatura cobraria em dobro. Um 400 da busca é o
  Mercado Pago dizendo que ainda não há cobrança nenhuma, o caso comum, e segue aberto.
- **Reserva em andamento:** o pagador de uma linha só muda se ninguém a está criando
  (`creation_claimed_at` nulo); o banco e o Mercado Pago nunca divergem sobre ele.
- **Leitura que falha fecha:** ver a seção 5.

**Riscos residuais, deliberadamente não corrigidos:**

1. Uma pessoa logada pode declarar o e-mail de um **terceiro** como pagador, e o
   Mercado Pago pode escrever a esse endereço. Exige conta no Clinavy, e o
   terceiro não é cobrado: teria de entrar na conta dele. Todo membro ativo da clínica
   lê esse e-mail (a política de leitura é por linha); convém tratá-lo como dado
   pessoal na retenção (LGPD).
2. **Corrida de segunda ordem:** o pagamento no checkout antigo concluído exatamente
   entre a leitura e o cancelamento *e* a leitura de confirmação logo depois falhando
   de forma que o código lê como "sem cobrança". Exige duas coincidências de uma ida e
   volta de rede cada; o mês pago, se existir, continua honrado.
3. **Duzentas linhas.** A leitura das assinaturas traz até 200 linhas de uma
   pessoa/clínica e, se enchê-las, trata como falha (fecha): acesso não se decide com
   uma leitura que talvez esconda a linha que o concede. Com o limite de quatro por
   hora isso exigiria dezenas de horas de tentativas seguidas do próprio responsável, e
   a saída é limpar as linhas antigas e canceladas (o painel mostra quais).

---

## 2. As recusas: o que o código mostra, e o que só o Mercado Pago pode dizer

### O que é possível afirmar

As 9 tentativas de R$ 297 entre **16/10 e 01/11** atravessam **dois mecanismos
diferentes**, e isso muda a leitura:

| Período | Mecanismo | Onde o cartão era digitado |
|---|---|---|
| 16/10 → 29/10 | **Card Brick** | no Clinavy (token gerado no navegador) |
| 30/10 → 01/11 | **Checkout hospedado** (`init_point`) | no domínio do Mercado Pago |

A divisão importa porque as duas falham em lugares distintos:

- no **Card Brick**, a tentativa chegava a gerar um pagamento no Mercado Pago;
  uma recusa ali tem `status_detail` e, em princípio, passou por autorização;
- no **checkout hospedado**, uma incompatibilidade de identidade (problema 1
  acima) barra a pessoa **antes de qualquer autorização** — nenhuma transação
  é enviada ao emissor.

Isso é consistente, sem contradição, com as duas informações que pareciam se
excluir: o Nubank dizer que *a transação não chegou ao banco* e o Mercado Pago
responder com a mensagem genérica de recusa pelo emissor. Para as tentativas a
partir de 30/10, "não chegou ao banco" é exatamente o que se espera de um
bloqueio de identidade no checkout — e a mensagem genérica do suporte não
distingue isso de uma recusa real.

**Isto é uma hipótese coerente com a evidência disponível, não um diagnóstico
provado.** Provar exige os `status_detail` das 9 tentativas, que não estão
acessíveis daqui.

### Lacuna de diagnóstico, corrigida

As colunas `last_refusal_http_status` e `last_refusal_detail` existem desde a
migration `0020` e **nunca eram exibidas em lugar nenhum** — uma recusa só
podia ser lida num log temporário da Vercel, que já expirou. O painel
`/clinavy/admin` passou a mostrá-las, e ganhou **busca por e-mail do cliente**:
antes só era possível consultar por id da linha ou id de pagamento, que é
justamente o que o suporte não tem quando o atendimento começa.

### Evidência nova: a venda de R$ 20 aprovada em 31/10

A cliente pagou R$ 20 pelo Checkout Pro em 31/10 (pagamento aprovado, cartão Nubank;
o número do pagamento e o final do cartão ficam fora deste documento, que vai para o
git). Isso muda o quadro, dentro de limites:

- **O cartão está bom** e foi aceito pela conta recebedora e pelo emissor. A
  hipótese "o cartão dela tem algum problema" cai.
- **Pelo código, os três produtos usam a mesma conta vendedora:** a assinatura
  do Clinavy, a manutenção e as Cobranças (Checkout Pro) leem o mesmo
  `MERCADOPAGO_ACCESS_TOKEN` (`flow/billing.ts`, `maintenance/billing.ts`,
  `billing/charges.ts`). Isto é **inferência do código, não medição**: a prova é o
  `collector_id`, que só a API devolve.
- **A venda não prova que assinatura recorrente de R$ 297 esteja liberada:**
  produto, valor e fluxo de identidade são outros, e o Mercado Pago pode aplicar
  regras de risco diferentes a recorrência e a valores maiores.
- **O que a comparação mede:** se o e-mail enviado como `payer_email` nas
  assinaturas é o da conta que pagou os R$ 20, e o `status_detail` de cada
  tentativa.

**Bloqueador, sem improviso:** o Access Token de produção só existe na Vercel; não
há cópia local, e a leitura **não foi feita**. A ferramenta está pronta, testada
(só `GET`, sem e-mail nem token na saída) e documentada em
`supabase/propostas/clinavy-assinatura/COMO-RODAR.md`, etapa 2. Quem a roda é
você, e a saída pode ser colada sem risco.

### O que precisa do Mercado Pago (escalonamento)

Pedido único, a ser aberto com o suporte:

> Conta recebedora: `<id da conta / e-mail da conta vendedora>`
> Período: 16/10/2026 a 01/11/2026
> Valor: R$ 297,00 · recorrência mensal · moeda BRL
>
> 1. Lista das tentativas de pagamento de R$ 297 neste período, com, para cada
>    uma: `payment_id`, `status`, **`status_detail`**, `live_mode`,
>    `payment_method_id`, `date_created` e o `preapproval_id` associado.
> 2. Para cada `preapproval` envolvido: `status`, `payer_email` registrado e se
>    houve alguma `authorized_payment`.
> 3. Confirmação explícita de **quais tentativas chegaram a ser enviadas ao
>    emissor para autorização** e quais foram barradas antes disso pelo próprio
>    Mercado Pago (validação de identidade do pagador, antifraude, ou restrição
>    de conta).
> 4. Existe, hoje, qualquer restrição ativa na conta recebedora — de
>    integração, de antifraude ou de limite — que afete assinaturas
>    (`/preapproval`)?
>
> Contexto: integração de assinaturas sem plano associado, criada com
> `status: "pending"` e sem `card_token_id`, e a pessoa conclui no `init_point`.
> Em pelo menos uma tentativa o checkout respondeu "Seu e-mail não corresponde
> ao da assinatura", o que sugere divergência entre o `payer_email` da
> assinatura e a conta usada no checkout.

Com os `payment_id` em mãos, o painel `/clinavy/admin` já resolve o resto
sozinho: ele consulta `GET /v1/payments/{id}` e mostra `status_detail` e
`live_mode` — este último é a prova de que o id pertence (ou não) à conta real.

---

## 3. "Não foi possível processar seu pagamento. Use outro meio de pagamento."

Esta mensagem é do próprio Mercado Pago, exibida no domínio dele, e cobre mais
de uma situação: identidade do pagador, recusa do emissor, restrição financeira
da conta e falha técnica dele. **Não é possível distinguir qual delas ocorreu a
partir daqui** — nenhum dado dessa tela chega ao Clinavy.

O que fica disponível para separar os casos:

- se a tentativa gerou `preapproval`, o painel mostra o status real e se houve
  cobrança aprovada;
- se nem gerou, a recusa de criação agora aparece na linha
  (`last_refusal_*`), o que antes só existia em log.

A pergunta 3 do escalonamento acima é exatamente a que resolve isto.

Nenhuma tentativa nova com cartão real foi feita nesta investigação.

---

## 4. As duas contas: procedimento somente-leitura

Nada foi lido, alterado, unido ou apagado em produção. O procedimento abaixo é
para quem tiver autorização executar, **na ordem**, e as três primeiras etapas
não escrevem nada.

1. **Levantar o quadro.** Em `/clinavy/admin`, buscar por `<e-mail da conta 1>`
   e depois por `<e-mail da conta 2>`. A busca mostra, para cada e-mail: as
   contas (`user_id`) encontradas, as clínicas, a **contagem** de pacientes,
   prontuários e agendamentos de cada clínica, e todas as assinaturas com
   status, pagador enviado ao Mercado Pago e recusa registrada. Nenhum
   prontuário é aberto.
2. **Decidir qual conta é a definitiva pelo dado clínico, não pela
   assinatura.** A conta que fica é a que tem a clínica com os prontuários — é
   o dado que não se recria. Assinatura se refaz; prontuário não.
3. **Conferir se existe assinatura paga em alguma das duas.** Para cada linha
   com `provider_subscription_id`, abrir a linha no painel: ele mostra o estado
   real no Mercado Pago agora e se há cobrança aprovada. Só uma cobrança
   `approved` é prova de pagamento.
4. **Se a conta definitiva não tem assinatura e a outra também não** (o cenário
   mais provável, dado que as 9 tentativas foram recusadas): não há nada a
   transferir. A cliente entra na conta definitiva e assina por ali,
   declarando o e-mail da conta do Mercado Pago dela na própria tela. A conta
   extra fica como está — sem clínica e sem assinatura, ela não cobra nada e
   não atrapalha.
5. **Se houver uma assinatura paga na conta errada**: não unir contas. Cancelar
   nada. Abrir chamado e decidir com autorização explícita, porque mover uma
   assinatura entre contas mexe em dinheiro já cobrado.

**Nunca:** apagar uma conta, apagar uma linha de assinatura, ou editar o valor
de uma assinatura existente no Mercado Pago — a última quebraria a garantia de
preço das cinco clínicas fundadoras (R$ 297/mês), que funciona exatamente
porque o valor guardado dentro da assinatura nunca é alterado.

**Limite da busca por e-mail.** O e-mail da conta vive em `auth.users`, que a
busca não lê (não há Admin API aqui). Ele só aparece em `members.email` (quem já
tem clínica) e em `payer_email` (assinaturas feitas depois da 0023). Logo, **uma
conta que nunca criou clínica, com tentativas anteriores à 0023, não é achada
pelo e-mail** — e é exatamente a segunda conta da cliente. Para ela: copie o id da
conta em Supabase → Authentication → Users (busca por e-mail) e use o campo
"id da conta" do painel (`/clinavy/admin?user=<id>`), que mostra as tentativas, a
recusa registrada e a ausência de clínica.

---

## 5. Perda de acesso ao tentar pagar (resolvida no código)

**Causa raiz:** `getSubscription()` devolvia **a linha mais recente** e
`clinicAccess()` só olhava para ela. As migrations `0020`/`0021` impedem duas
assinaturas *vivas*, mas nem `cancelled` nem `rejected` contam como vivas —
então uma tentativa nova (`pending`) nasce ao lado de uma assinatura real e
vira "a linha atual". Abrir o checkout e desistir no Mercado Pago jogava a
clínica em só-consulta, inclusive sobre um mês já pago.

**Correção:** quem decide o acesso passou a ser a melhor **prova financeira**
entre todas as linhas da clínica (`standingRow`, em `src/lib/flow/access.ts`),
nunca a mais nova. Na ordem:

1. uma assinatura que libera (`active`/`past_due`) — escrita só a partir do que
   o Mercado Pago respondeu;
2. uma cancelada cujo mês já pago ainda corre (`paidThrough`), valendo a que
   vai mais longe — a data vem de uma cobrança **confirmada**;
3. a proteção de transição legada, enquanto ela vale (migration `0017`);
4. não havendo nenhuma das três, a linha mais recente: a tentativa em curso.

Nenhum dos três primeiros critérios inventa acesso — todos exigem prova que só
o Mercado Pago escreve. Uma clínica nova sem pagamento cai sempre no caso 4.

A regra dos pilotos autorizados é a transição legada da migration `0017`, e ela
**já é explícita e auditável**: só vale quando a clínica já existe e nunca teve
nenhuma linha; e termina de dois jeitos registrados em coluna — uma cobrança
aprovada de verdade (`first_payment_confirmed_at`) ou uma decisão
administrativa (`legacy_transition_cleared_at` / `_by` / `_reason`). Nunca por
tempo, nunca por palpite.

A criação de clínica antes olhava só o `status` da assinatura, e um `status` não é
prova de pagamento. Agora ela exige evidência financeira positiva (seção 7), e
essa regra vale **apenas** para criar uma clínica nova.

---

## 6. iPad: reproduzido e corrigido em WebKit real; não testado em aparelho físico

> **Correção de uma versão anterior deste documento.** Ele dizia que a correção
> `aeb88e2` era "um no-op" e que o defeito não fora reproduzido. Isso estava
> errado: eu havia medido só o WebKit **mais novo**, que já não tem o problema.
> Medido em uma escada de versões, o defeito aparece em todas as anteriores.

**Sintoma da cliente:** o diálogo de assinatura abre "minúsculo, mostrando
praticamente só o cabeçalho".

**Reproduzido.** CSS compilado do projeto + o mesmo DOM do componente `Subscribe`
(`FlowDemo.tsx`), no tema real, em WebKit real (Playwright):

| WebKit | sem a correção | com `height: auto` |
|---|---|---|
| 15.4 · 16.4 · 17.0 · 17.4 · 18.0 · 18.2 · 18.4 · **26.0** | diálogo de **46px**: só "Assinatura / Clinavy / Fechar" | 736–826px, botão de assinar visível (exceto 1024×768, ver abaixo) |
| 27.2 | sem diferença | idem |

Testado em iPad paisagem (1180×820 e 1024×768), iPad retrato (810×1080 e
768×1024), iPhone retrato (390×844) e desktop (1440×900). O defeito aparece em
**todas as larguras de 768px para cima** — iPad nas duas orientações e desktop —
e **não** no iPhone em retrato, como o CSS prevê.

**Causa.** De 768px para cima o painel lateral dá `height: 100%` ao
`.sheetInner`. O diálogo compacto (`.modal`) tem `height: fit-content`, então a
porcentagem não tem referência, e o WebKit a resolve como o preenchimento
sozinho. O `.sheetInner` tem `overflow-y: auto`, e o que sobra é cortado — fica a
faixa do cabeçalho. É exatamente o que `aeb88e2` descreve.

**Correção:** `.modal .sheetInner { height: auto }` (`aeb88e2`). Está comprovada
nas oito versões acima. Fica com uma trava na suíte (`tests/modal-height.test.mjs`)
que falha se a regra for removida, porque o defeito só aparece no navegador.

**O que isto não é:** um iPad físico. É o WebKit do Playwright no Windows, o mesmo
motor de layout do Safari. A confirmação final é a cliente abrir a tela depois da
publicação. A medição se repete com `tests/browser/ipad-dialog/COMO-RODAR.md`.

**Quem mais isso afetava.** Qualquer Safari até a versão 26.0 — iPad, iPhone
deitado (largura ≥768px) e Mac — não só a cliente. Só o WebKit mais novo do
Playwright deixou de ter o defeito.

### Outra coisa que apareceu, e que não foi alterada

O conteúdo do diálogo tem ~850px e o `max-height` é `calc(100dvh - 2rem)`. Em iPad
paisagem 1024×768 o botão "Assinar" fica **abaixo da dobra** — o diálogo rola por
dentro. Não é o defeito acima (o diálogo abre inteiro), e no Safari real, com a
barra do navegador, a janela é ainda menor. Fica registrado como decisão de
design pendente, não tratada aqui.

---

## 7. Falha de leitura não é "sem assinatura" (fail-closed), e o que as revisões deixaram

**O defeito (fail-open).** `lib/flow/access.ts` trata "nenhuma linha" como clínica de
antes das assinaturas, que mantém o uso total. `getSubscriptions()` engolia o erro de
leitura (`data` nulo → lista vazia): uma coluna ainda inexistente por um deploy fora
de ordem, uma queda ou um timeout liberavam acesso total a quem não tinha direito
comprovado. Registrar o erro não bastava.

**Como ficou.** A leitura LANÇA (`SubscriptionReadError`), inclusive quando a página
enche o limite de 200 linhas (a linha que dá acesso pode estar além dela). Quem decide
acesso fecha: `getClinicAccess` devolve `UNVERIFIED_ACCESS` (somente leitura, sem agir
para fora, `subscriptionStatus: null`), `homePath` manda para a demo, a página de
assinar mostra "ainda não confirmamos" (nunca o formulário, que abriria um segundo
pagamento), e as ações de escrita, mensagens e integrações usam `denialMessage`, que
**não manda assinar de novo**. Uma leitura que funciona e volta vazia segue sendo uma
clínica de antes das assinaturas. Provado em `tests/pulse-read-failure-access.test.mjs`
rodando o `session.ts` de verdade contra um Supabase falso cuja tabela falha.

**Pagamento só com prova positiva.** Criar uma clínica nova (`comecar`) exige
`paymentEvidence === "confirmed"`: cobrança aprovada e processada lida no Mercado Pago.
"none" ("o Mercado Pago ainda não confirmou") e "unavailable" ("não conseguimos
confirmar agora") não criam. Não retira o uso de clínicas existentes.

**Pagador e concorrência.** O e-mail do pagador é por linha (`payer_email`, 0023) e só o
responsável pela clínica o declara (`canDeclarePayer` na tela, `NOT_OWNER` no servidor).
Trocar de pagador encerra a tentativa pendente no Mercado Pago ANTES de criar a nova, e
se a cobrança foi aprovada durante a troca, ou a busca de cobranças falhou (5xx), **nenhuma
assinatura nova nasce** (cobraria em dobro): fica "não resolvido" para uma pessoa decidir.
Há limite de 4 tentativas por hora por clínica (as recusadas contam). A corrida do 23505
perdida para uma linha já enviada com OUTRO pagador diz o que houve em vez de retomar a
conta errada; uma linha travada para reconciliação nunca é alterada.

**Revisões independentes.** Três passagens do `/code-review` e duas do revisor de banco
(`ecc:database-reviewer`) acharam, ao todo, problemas reais que foram corrigidos e
cobertos por teste (entre eles: uma função exportada de "use server" que era um IDOR; o
`.or()` montado com texto do usuário na auditoria; o CHECK que deixava passar tabulação;
a busca de cobranças que falhava sendo lida como "sem cobrança"; o pagador perdido na
corrida do 23505). Os testes novos foram submetidos a mutação (a correção removida faz o
teste falhar).

**Riscos residuais, ditos sem rodeio.**
- A `0023` junta, no mesmo arquivo, a coluna, o CHECK e o `revoke`. Separar o `revoke`
  exigiria revalidar no TESTE; foi mantido junto, com a prova de que a escrita do
  `authenticated` já era negada pela RLS (as duas travas são independentes).
- O `set lock_timeout = '5s'` não é revertido ao fim da migration (a revisão sugeriu um
  `reset lock_timeout;` final). Vale até a conexão do `db push` fechar, inclusive para o
  registro do histórico; se o lote falha, o `set` é desfeito junto. Efeito prático nulo hoje,
  e o texto aplicado no TESTE é byte a byte o que irá à produção — isso foi preferido a editá-lo.
- O histórico de migrations da produção não foi lido; a sondagem de objetos indica
  0017–0022 presentes e `payer_email` ausente. A leitura real do histórico é
  pré-condição em `supabase/propostas/clinavy-assinatura/PUBLICACAO.md`.
- Achados BAIXOS da segunda revisão de banco, **não** aplicados (sem risco hoje, listados para
  decisão): mover a checagem de `first_payment_confirmed_at` para antes do cancelamento no
  ramo `pending` (inatingível na prática, pois pendente não tem cobrança aprovada); o UPDATE do
  pagador não confere `status` (uma linha que acabou de virar `rejected` por outra requisição
  pode ser reclamada — a mesma classe de corrida que já existia); o teto de 200 linhas fecha o
  acesso se atingido (exige ~50 h seguidas de trocas de pagador, com o limite de 4 por hora);
  falta um índice por `organization_id` que cubra as linhas encerradas (irrelevante com dezenas
  de linhas; `create index concurrently` numa migration futura).
- Aplicado desta passada: a retomada do mesmo pagador numa linha anterior à coluna reenvia o
  e-mail da LINHA, não o digitado (outra caixa de letras seria outro corpo sob a mesma chave de
  idempotência), com teste e mutação.
- Falta o iPad físico, e a comparação da venda aprovada com as recusas (precisa do token
  do Mercado Pago, `mp-leitura.mjs`). A causa real das recusas não está estabelecida.
