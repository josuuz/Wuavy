# Recuperação do Prontuário (migrations 0014–0016)

> **Aplicado em produção em 2026-10-13**, com backup validado antes (abaixo).
> Os níveis de recuperação deste documento passam a valer de verdade.

O princípio que ordena tudo abaixo: **anamnese preenchida é prontuário de
paciente.** Uma reversão que apaga essas linhas não é reversão, é perda de
registro clínico. Por isso os dois primeiros níveis — os que resolvem
praticamente qualquer problema real — não apagam nada, e o que apaga está num
arquivo separado que se recusa a rodar sozinho.

| Nível | O que faz | Apaga dados? | Autorização |
| --- | --- | --- | --- |
| 1 | Volta a versão do aplicativo | Não | A mesma da publicação |
| 2 | Devolve os privilégios da 0015 | Não | A mesma da publicação |
| 3 | Restaura o banco de um backup | Sim, o que veio depois do backup | Nova, por escrito |
| 4 | Remove as tabelas da proposta | Sim, as anamneses | Nova, por escrito, específica |

---

## Antes de publicar: o backup

O projeto de produção (`trwrulahqytfbmoxajnc`) está no plano gratuito, que não
dá backup automático restaurável nem point-in-time recovery. **O backup é
manual e é pré-requisito da publicação**, não uma formalidade.

### O caminho com `pg_dump` (precisa de Docker)

```bash
cd "C:/Users/User/Wuavy web"
supabase db dump --linked -f "backup-antes-0014.sql"          # esquema
supabase db dump --linked --data-only -f "backup-antes-0014-dados.sql"
```

`supabase db dump` roda o `pg_dump` dentro de um contêiner: **sem Docker ele
não funciona**, e a máquina onde a publicação de 2026-10-13 foi feita não tem
Docker nem `psql`. Por isso foi usado o caminho abaixo.

### O caminho sem Docker, que foi o usado (2026-10-13)

Exporta todas as tabelas por PostgREST com a `service_role`, as contas pelo
Admin API e o inventário dos buckets. O esquema não precisa de dump: ele é
reproduzível a partir de `supabase/migrations/`, e o próprio teste abaixo prova
que produção não tem nenhuma coluna que as migrations não criem.

```bash
node dump.mjs "C:/Users/User/wuavy-backups/prod-antes-0014-<carimbo>"
```

Guarde a pasta fora do repositório: ela contém dados de paciente, e o
`.gitignore` não a cobre.

**Um backup só vale depois de restaurado em outro lugar.** A validação roda num
Postgres em memória (PGlite), sem rede e sem encostar em produção: aplica
`bootstrap.sql` + as migrations do repositório, restaura o backup com os
gatilhos desligados (como `pg_dump --disable-triggers`) e exige que tudo bata.

```bash
cd supabase/propostas/prontuario/pgspike
npm install
node restore-check.mjs "C:/Users/User/wuavy-backups/prod-antes-0014-<carimbo>"
```

O que ele exigiu, e o que respondeu no backup de 2026-10-13 às 13:58 UTC:

| Verificação | Resultado |
| --- | --- |
| contas restauradas | 7/7 |
| contagens idênticas, tabela por tabela | 26 tabelas, 48 linhas |
| deriva de esquema entre produção e as migrations | nenhuma |
| chaves estrangeiras sem órfãos sobre os dados restaurados | 46/46 |

Se qualquer uma falhar, o backup não serve e a publicação não acontece.

### O que este backup não cobre

Ele guarda **dados**, não o banco inteiro. Restaurar a partir dele (nível 3)
recria as linhas, mas não as senhas das contas (o Admin API não devolve o hash)
nem o conteúdo dos arquivos de Storage — só o inventário deles. Para um nível 3
fiel ainda é preciso um `pg_dump`, e portanto Docker ou a senha do banco. Os
níveis 1 e 2, que resolvem praticamente qualquer problema real da publicação,
não encostam em dado nenhum.

---

## Nível 1 — Reversão do aplicativo

**Resolve: qualquer defeito na tela nova.** É a primeira coisa a fazer, sempre.

Na Vercel, em Deployments, escolha o deploy anterior e use *Instant Rollback*
(ou *Promote to Production*). Leva segundos e não encosta no banco.

Isso funciona porque **as três migrations são aditivas para o código antigo**:

- A 0014 e a 0016 só criam objetos novos. O código publicado hoje não conhece
  nenhum deles e não os lê.
- A 0015 acrescenta duas colunas anuláveis a `clinical_records`
  (`appointment_id`, `procedure_id`). Um `select *` do código antigo passa a
  trazer duas colunas a mais e as ignora; os `insert` e `update` dele escrevem
  exatamente dentro das listas que a 0015 libera.
- O gatilho `pulse_z_record_revision` continua guardando o estado anterior de
  cada evolução editada, inclusive pelo código antigo. Isso não atrapalha: só
  acrescenta linhas em `clinical_record_revisions`.

Depois do rollback, confira na clínica: abrir uma paciente, salvar uma
evolução, reabrir. Se salvar, acabou aqui.

## Nível 2 — Devolver os privilégios da 0015

**Resolve: `permission denied for table clinical_records` ao salvar evolução.**

Só a seção 5 da 0015 tira um direito que já existia: ela troca o `insert` e o
`update` de tabela inteira (que a 0007 deixou) por listas de colunas. Essa é a
única parte não aditiva da proposta, e é a única com volta escrita:

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f reverter-0015-privilegios.sql
```

Não apaga nada: um `revoke` e um `grant`. Depois dele, `authenticated` volta a
poder escrever em qualquer coluna de `clinical_records`, como antes da
publicação. Para voltar ao estado publicado, reaplique a seção 5 da
`0015_clinical_evolution.sql` — ela é idempotente.

O arquivo deixa `anon` de fora de propósito: a 0007 já tinha revogado tudo
dele, então a 0015 não tirou nada e não há o que devolver.

## Nível 3 — Restaurar o banco do backup

**Resolve: corrupção de dados.** Não resolve defeito de tela — para isso é o
nível 1. Exige autorização nova, porque **tudo o que foi escrito depois do
backup se perde**: consultas marcadas, evoluções, conversas, pagamentos.

1. Ponha o aplicativo em manutenção, ou tire o deploy do ar. Restaurar com
   gente escrevendo produz um banco que não corresponde a nenhum momento.
2. Meça o que vai se perder, antes:
   `select max(created_at) from appointments;` e o mesmo em `clinical_records`
   e `conversations`.
3. Restaure primeiro numa cópia descartável (`supabase start`) e confira as
   contagens. Só depois, em produção.
4. Restaure em produção a partir do dump validado.
5. Confira: entrar com uma conta real, abrir uma paciente, ver o histórico.

## Nível 4 — Operações destrutivas

Estão em `destrutivo-remover-prontuario.sql`, que começa com `\quit` e por isso
não roda nem se alguém mandar o arquivo inteiro para o `psql`. **Apagam
anamneses preenchidas.**

Exigem, cada vez: autorização nova, por escrito, específica para a operação —
não vale a autorização da publicação — e um backup validado pelo nível 3.

O que elas fazem, e por que a ordem importa:

- Os gatilhos saem antes das tabelas que escrevem. Derrubar
  `clinical_record_revisions` com `pulse_z_record_revision` de pé quebra **toda
  edição de evolução**, que é funcionalidade já publicada e em uso, e não só o
  que a proposta trouxe.
- Os arquivos do bucket `clinical` não saem junto com `clinical_attachments`.
  Apagar a tabela antes dos objetos deixa arquivos órfãos que ninguém mais
  consegue ligar a uma paciente.
- `drop table anamneses` leva junto `anamnesis_revisions` pela chave
  estrangeira com `on delete cascade`. Não existe desfazer.

---

## O que foi validado, e onde

| Verificação | Onde | Resultado |
| --- | --- | --- |
| 0001–0016 aplicam em sequência | PGlite descartável (`pgspike`) | aplicam |
| Isolamento entre clínicas, papéis, revisões | PGlite (`teste-isolamento.sql`) | 74/74 |
| Fluxo real de ponta a ponta | Supabase de testes (`wazxofdzvzfgonmwsdhs`) | 31/31 |
| `reverter-0015-privilegios.sql` devolve o estado da 0007 | PGlite (`pgspike/recuperacao.mjs`) | 13/13 |
| Reaplicar a seção 5 volta ao estado publicado | PGlite (`pgspike/recuperacao.mjs`) | idem |

A validação da reversão roda num Postgres em memória, sem rede: aplica
0001–0013, fotografa o ACL de `clinical_records`, aplica 0014–0016, fotografa
de novo, roda a reversão e exige que o ACL volte a ser **idêntico** ao de antes
da 0015. Produção e o projeto de testes não são tocados.

```bash
cd supabase/propostas/prontuario/pgspike
npm install          # só @electric-sql/pglite; node_modules não vai para o repositório
node recuperacao.mjs
```

O que ele mostrou, textualmente — o ACL da tabela antes da 0015 e depois da
reversão, idêntico nos dois momentos:

```
authenticated=arwm/postgres      (e nenhum privilégio de coluna)
```

e, entre os dois, o estado que a 0015 instala:

```
authenticated=rm/postgres
  id, organization_id, patient_id  → a        (insert)
  recorded_at, chief_complaint, notes, appointment_id, procedure_id → aw
```

Também ficou provado ali que a 0014 e a 0016 não encostam nesse ACL (são
aditivas), que a reversão deixa as sete tabelas do prontuário de pé, e que
reaplicar a seção 5 reproduz o estado publicado exatamente.
