# Cobranças travadas sem Preference recuperável — procedimento operacional

Para quem administra o painel (`/cobrancas/lancamentos`), quando uma cobrança
aparece como **"Travada — reconciliar"** e o botão **"Investigar e recuperar,
se encontrar"** não resolve sozinho.

## O que "travada" significa

A cobrança teve uma tentativa de criação de Preference no Mercado Pago cujo
resultado ficou incerto — ou nunca foi possível confirmar que uma Preference
foi criada, ou ela foi criada mas o id não chegou a ser salvo aqui. Enquanto
estiver travada, **nenhuma nova tentativa automática de cobrar é feita**: é
assim de propósito, para nunca arriscar duas Preferences para a mesma
cobrança.

## Passo 1 — sempre primeiro: clicar em "Investigar e recuperar, se encontrar"

Esse botão procura, no Mercado Pago, uma Preference para esta referência
(`GET /checkout/preferences/search`) e, se achar exatamente uma, válida (a
referência, o valor e a moeda batem), recupera sozinho — sem criar nada
novo. A tela mostra o resultado na hora: ou "Encontramos a Preference... Ela
não está mais travada", ou a razão exata de continuar travada.

**Isto resolve a maioria dos casos.** Só continue para os passos abaixo se a
tela continuar dizendo que a cobrança está travada depois de investigar.

## Passo 2 — ler a mensagem exibida, ela já diz o que falta

| Mensagem mostrada | O que fazer |
|---|---|
| "Mais de uma Preference encontrada..." | Duas ou mais Preferences existem para esta referência. Abra o painel do Mercado Pago, confirme qual delas corresponde a esta cobrança pelo valor e pela data, e cole o id certo no campo "Salvar" (reconciliação manual). |
| "...referência não confere" / "...valor não bate" / "...não está em reais" | A Preference encontrada não é desta cobrança, ou tem um valor diferente. Não use o id que apareceu — procure a Preference certa no Mercado Pago. |
| "Não foi possível consultar... Tente de novo mais tarde" | Falha temporária na comunicação com o Mercado Pago. Espere alguns minutos e clique em investigar de novo. |
| "Existe pelo menos um pagamento registrado... mesmo sem a Preference aparecer" | Um pagamento real existe para esta referência. **Trate como prioridade**: confirme no painel do Mercado Pago (seção Pagamentos/Atividade) e reconcilie com o id da Preference associada a esse pagamento. |
| "...mais antiga que a janela de busca... (90 dias)" | O Mercado Pago só garante a busca por referência nos últimos 90 dias. Uma cobrança mais velha que isso não pode ser confirmada por este caminho — vá direto ao passo 3. |

## Passo 3 — quando a investigação automática não resolve

1. Abra o painel do Mercado Pago (conta da Wuavy) e procure, na seção de
   Pagamentos, qualquer transação na data aproximada da cobrança, pelo valor
   (os centavos ajudam a filtrar) e, se possível, pelo nome/e-mail do
   cliente.
2. Se encontrar uma Preference ou pagamento que bate: cole o **id da
   Preference** (não o id do pagamento) no campo "Salvar" da reconciliação
   manual. O sistema confere de novo o valor e a referência antes de aceitar
   — um id errado é recusado, não aceito às cegas.
3. Se não encontrar nada, mesmo olhando manualmente: abra um chamado com o
   suporte do Mercado Pago, informando a referência (`external_reference` =
   o id da cobrança, visível na tela) e a data/hora aproximada. Peça
   confirmação explícita de que nenhuma Preference ou pagamento existe para
   essa referência.
4. **Não existe, hoje, nenhum botão ou comando que libere esta cobrança para
   uma nova tentativa de criação.** Isto é deliberado: a ausência de
   evidência, por si só, nunca prova que nada foi criado (o Mercado Pago não
   oferece uma forma de confirmar isso com 100% de certeza além dos
   caminhos acima). Se o suporte do Mercado Pago confirmar por escrito que
   nada existe, a liberação manual direta no banco de dados (fora do
   aplicativo) é a única via nesta fase — e deve ficar registrada (data,
   quem autorizou, print/protocolo do suporte) para auditoria.

## O que nunca fazer

- Não tente "forçar" uma nova cobrança criando uma linha nova para o mesmo
  cliente/valor sem antes confirmar, por um dos caminhos acima, que a
  tentativa anterior não resultou em nenhuma Preference real — o cliente
  pode acabar com duas cobranças válidas para o mesmo serviço.
- Não cole no campo de reconciliação um id de **pagamento**; o campo espera
  o id da **Preference** (`GET /checkout/preferences/{id}` precisa
  encontrá-lo).
