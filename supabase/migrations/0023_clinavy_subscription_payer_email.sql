-- Wuavy Clinavy 0023: o e-mail do pagador no Mercado Pago, por linha de
-- assinatura.
--
-- Por que existe: o checkout hospedado de assinaturas identifica quem paga
-- pelo payer_email gravado na assinatura. Quem abre o init_point tem de estar
-- no Mercado Pago com a conta DAQUELE e-mail, ou o próprio Mercado Pago
-- recusa, com "Seu e-mail não corresponde ao da assinatura". Enquanto o
-- payer_email era sempre o e-mail da conta do Clinavy (session.user.email),
-- uma pessoa cuja conta do Mercado Pago usa outro endereço não tinha saída
-- nenhuma pela tela: foi o que aconteceu com a primeira cliente, que chegou a
-- criar uma segunda conta tentando contornar.
--
-- Por que na LINHA, e não derivado em tempo de execução: a chave de
-- idempotência da criação é o id da linha (lib/flow/billing.ts,
-- createSubscription) e a regra é "o mesmo corpo para a mesma referência" —
-- uma retomada reenvia a criação com a mesma chave. Se o pagador viesse do
-- código, uma retomada depois de a pessoa trocar de e-mail reusaria a chave
-- com outro corpo, que é exatamente o risco que lib/flow/subscription-
-- payload.ts existe para evitar. Guardado na linha, o corpo de uma linha
-- nunca muda; trocar de pagador encerra a tentativa pendente no Mercado Pago
-- e faz nascer uma linha nova (assinar/actions.ts, subscribeWithPayerEmail).
--
-- O que muda no banco: uma coluna anulável, uma restrição CHECK e uma
-- revogação de privilégio. Nenhuma linha existente é alterada, e nenhum índice
-- é criado. As linhas de antes ficam com payer_email null, e o código as trata
-- como "use o e-mail da conta", que é exatamente o que elas enviaram quando
-- foram criadas — nenhuma assinatura existente muda de comportamento.
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do deploy do código. O código novo
-- faz select e insert de payer_email; sem a coluna, a leitura das assinaturas
-- falha (e o código fecha o acesso, em vez de liberar — session.ts), e toda
-- tentativa de assinar falha. O contrário é seguro: código antigo contra o schema
-- novo funciona, porque nunca escreve a coluna e nenhum select antigo a lista.
--
-- NÃO APLICADA em produção. Validar primeiro só no projeto de TESTE
-- (wazxofdzvzfgonmwsdhs), como 0020 e 0021.

-- O risco do ALTER não é a duração (a tabela é pequena e nada é reescrito), é a
-- FILA: ele espera o lock exclusivo atrás de qualquer transação aberta na tabela
-- — um dump, uma sessão parada no SQL editor — e todo o tráfego em subscriptions
-- enfileira atrás dele. Se não conseguir em 5 segundos, falha, e pode ser repetido.
-- Não aplicar durante um dump.
set lock_timeout = '5s';

alter table subscriptions add column payer_email text;

-- O servidor valida a forma do e-mail antes de gravar (assinar/actions.ts);
-- isto é a segunda linha de defesa, para um valor que chegue por outro caminho
-- (um script administrativo, uma correção manual) não entrar torto: nenhum
-- espaço em branco e dentro do tamanho máximo de um endereço (254).
--
-- ADD CONSTRAINT sem NOT VALID varre a tabela inteira; todas as linhas têm
-- payer_email null, que a restrição aceita, e a tabela é pequena. Os dois
-- comandos seguram o lock exclusivo até o fim da transação.
--
-- `!~ '\s'`, e não `= btrim(...)`: btrim só tira espaços, então uma tabulação
-- ou uma quebra de linha passava (achado da prova-0023.mjs). Ainda assim `\s`
-- é ASCII e depende do locale: espaços Unicode (NBSP, ZWSP) podem passar. É
-- rede de segurança, não validação — a validação é a do servidor.
alter table subscriptions add constraint subscriptions_payer_email_shape
  check (payer_email is null or (payer_email !~ '\s' and char_length(payer_email) between 3 and 254));

-- Quem lê a coluna: a política "own or own clinic's" (0003) é por linha, então
-- a pessoa e QUALQUER membro ativo da clínica (dono, recepção, profissional)
-- leem o payer_email da assinatura dela. É o e-mail que a pessoa informou ao
-- Mercado Pago; pode ser de um terceiro (a contadora, por exemplo), então
-- convém tratá-lo como dado pessoal na retenção (LGPD).
--
-- Quem ESCREVE: só o servidor (service_role). Hoje isso se sustenta num fato só:
-- a ausência de política de insert/update/delete para o papel authenticated. A
-- revogação abaixo é a segunda trava — o mesmo padrão de 0005, 0015 e 0016 —
-- para que uma política `for all` colocada por engano um dia (ou criada pelo
-- painel) não abra a escrita numa tabela de cobrança. Nenhum código usa o
-- cliente do usuário para escrever em subscriptions: todos os escritores usam o
-- cliente administrativo, que não é afetado (service_role tem os seus próprios
-- privilégios).
revoke insert, update, delete on subscriptions from anon, authenticated;

comment on column subscriptions.payer_email is
  'O e-mail registrado como payer_email ao criar esta assinatura no Mercado Pago (em ambiente de teste, o Mercado Pago recebe o comprador de teste, não este). Null nas linhas criadas antes desta coluna: para elas vale o e-mail da conta, que foi o que elas enviaram. Nunca é lido como identidade de login — quem autentica é o Supabase Auth.';

-- ── Reversão ─────────────────────────────────────────────────────────────
-- ANTES do deploy ter escrito nada, não há perda: tudo é null.
-- DEPOIS do deploy, toda linha nova grava payer_email (inclusive o e-mail da
-- própria conta), e o drop apaga os pagadores DECLARADOS que diferem dele. Numa
-- tentativa pendente com provider_subscription_id, a retomada passaria a enviar o
-- e-mail da conta sob a mesma chave de idempotência, com corpo diferente. Por
-- isso a ordem é: primeiro reverter o CÓDIGO, depois o banco, e salvar antes:
--   select id, user_id, organization_id, status, payer_email
--     from subscriptions where payer_email is not null;
-- Então:
--   alter table subscriptions drop column payer_email;   -- leva a restrição junto
--   grant insert, update, delete on subscriptions to authenticated;  -- só se a revogação precisar voltar
