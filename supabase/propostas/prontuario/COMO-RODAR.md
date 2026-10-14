# Como rodar a proposta do Prontuário

> **Aplicado em produção em 2026-10-13.** As migrations 0014–0016 foram
> aplicadas no projeto `trwrulahqytfbmoxajnc` por `supabase db push`, e estão
> registradas em `supabase_migrations.schema_migrations`.
>
> **As cópias que valem agora são as de `supabase/migrations/`.** Os três `.sql`
> desta pasta ficam como registro congelado da proposta: qualquer correção
> futura vai em `supabase/migrations/`, não aqui. O `pgspike/run.mjs` lê os
> arquivos desta pasta, então as duas cópias precisam ser mexidas juntas se
> alguma vez divergirem.

O que segue descreve como exercitar a proposta num banco descartável — ainda
vale para reproduzir os testes, e continua valendo a regra de nunca rodar o
`teste-isolamento.sql` fora de um banco descartável.

## Nunca

- Não rodar nada disto no banco de produção (`trwrulahqytfbmoxajnc`).
- `teste-isolamento.sql` escreve em `auth.users`. Ele só existe para banco descartável.

## Ambiente descartável

Duas opções. A primeira não depende de rede nem de conta.

### A. Supabase local

```bash
cd "C:/Users/User/Wuavy web"
supabase start                 # sobe Postgres, Auth e Storage em contêineres
supabase db reset              # aplica 0001…0013 do zero
```

`supabase start` imprime a `DB URL`, algo como
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Guarde:

```bash
export LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

### B. Branch do Supabase

Uma branch é um banco separado, descartável, com as migrations aplicadas. Custa
dinheiro enquanto existe e precisa ser apagada no fim. A URL sai no painel.

## Aplicar a proposta

Copie os três arquivos para a pasta de migrations **de uma cópia do repositório**,
não da sua cópia de trabalho, ou aplique direto por `psql`:

```bash
P="$TEMP/claude/.../scratchpad/proposta-prontuario"   # ajuste ao caminho real
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$P/0014_anamnesis.sql"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$P/0015_clinical_evolution.sql"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$P/0016_clinical_attachments.sql"
```

A ordem importa: a 0016 aponta para a chave que a 0015 cria.

## Rodar o teste

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$P/teste-isolamento.sql"
```

Sai uma linha `ok:` por asserção e uma `controle:` por verificação de que a
fixture não está vazia. Qualquer falha levanta exceção e, com `ON_ERROR_STOP=1`,
para ali. O arquivo termina em `rollback`, então o banco fica como estava —
inclusive as contas fictícias.

Para ver só o que falhou:

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$P/teste-isolamento.sql" 2>&1 | grep -E "FALHOU|FIXTURE VAZIA"
```

Silêncio aí significa que tudo passou.

## Ler a saída com desconfiança

O arquivo foi escrito contra as duas formas de um teste de RLS mentir:

- **Passar porque a linha não existe.** Cada asserção que espera zero tem um
  controle logo abaixo, contado como `service_role`, que falha com
  `FIXTURE VAZIA` se não houver nada para esconder.
- **Passar porque o passo rodou com poder demais.** `test_as()` confere o papel
  e o `auth.uid()` antes de deixar o teste seguir. `service_role` só aparece
  onde o próprio servidor agiria.

## O que o SQL não alcança

A seção 6 prova o piso: o bucket é privado e ninguém autenticado lê
`storage.objects`. As URLs assinadas são feitas pela API de Storage, não pelo
Postgres, e precisam de um teste no servidor:

- a URL só é emitida depois de o servidor conferir, com a sessão de quem pede,
  que a linha do anexo é visível para essa pessoa;
- a URL expira, e uma vencida é recusada;
- uma URL assinada para um arquivo da clínica A nunca chega a alguém da B;
- `getPublicUrl` não aparece em lugar nenhum perto deste bucket.

A seção 7 também deixa uma ponta: apagar uma organização cascateia as tabelas do
Postgres, **não** o bucket. Esvaziar a pasta é trabalho do servidor.

## Depois

```bash
supabase stop        # local
```

Numa branch, apague a branch.
