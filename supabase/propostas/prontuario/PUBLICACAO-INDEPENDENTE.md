# Publicar o Prontuário sem publicar o rebrand

> **Executado em 2026-10-13.** O que segue é o caminho que foi seguido, com o
> resultado de cada verificação.
>
> Uma coisa a mais entrou na branch, e vale saber por quê: **`main` não tinha o
> `0013_maintenance.sql`** (ele só existia em `pulse-rebrand-3d`), mas produção
> já tinha a 0013 aplicada desde 2026-10-09. Com esse buraco, o
> `supabase db push` se recusa a rodar — "Remote migration versions not found in
> local migrations directory" — e se recusaria em toda publicação futura a
> partir de `main`. O arquivo foi incluído: ele **não muda nada no banco** (a
> 0013 já estava registrada em `schema_migrations`, e o push aplicou só
> 0014–0016), não traz código da manutenção nenhum, e deixa o histórico de
> migrations do repositório igual ao de produção.

## Por que dá para separar

O Prontuário **não está em nenhum commit**. Ele é inteiramente trabalho não
commitado, e os arquivos que ele toca não foram tocados pelo rebrand:

| Arquivo | Em `main` | Em `pulse-rebrand-3d` | Conclusão |
| --- | --- | --- | --- |
| `views/ClinicalRecords.tsx` | existe | **idêntico ao de main** | a alteração local serve nos dois |
| `demo/ui.module.css` (as 14 classes que o Prontuário usa) | todas existem | todas existem | nada depende do rebrand |
| `src/lib/flow/clinical*.ts`, `views/clinical/` | não existem | não existem | arquivos novos, sem conflito |
| `database.types.ts` | sem os tipos novos | com WhatsApp/manutenção | ver a ressalva abaixo |

Os imports do Prontuário, conferidos um a um: `../../forms`, `../../store`,
`../../ui.module.css`, `./clock`, `./roles`, `./session`, `./write`,
`@/lib/flow/format`, `@/lib/flow/types`, `@/lib/supabase/database.types`,
`react`. **Nenhum** aponta para `spell/`, para o personagem ou para `three`.

E o personagem 3D não corre risco nenhum de ir junto: em `main` não existe
`Pulse.tsx`, `Pulse3D.tsx` nem `public/pulse.glb`. O rebrand inteiro — 3D e 2D —
está nos 11 commits que `pulse-rebrand-3d` tem a mais. Publicar a partir de
`main` deixa a aparência do site exatamente como está hoje no ar.

## O que vai, e o que fica de fora

Vai, e só isto:

```
src/components/flow/demo/views/clinical/      (Anamnesis.tsx, Shelf.tsx, ClinicalFile.module.css)
src/components/flow/demo/views/ClinicalRecords.tsx
src/lib/flow/clinical.ts
src/lib/flow/clinical-actions.ts
src/lib/supabase/database.types.ts            (só o pedaço da anamnese — ver abaixo)
tests/clinical.test.mjs
supabase/propostas/                           (documentação; opcional)
```

Fica de fora, e é o ponto em que um `git add -A` estragaria tudo:

```
package.json, package-lock.json   as 11+ dependências que só src/components/spell/ usa
src/components/spell/             não é importado por nada
components.json                   configuração do shadcn, idem
brand/, Wuavy_Pulse_Kit_Claude/, Wuavy_Pulse_Aura_Referencias.zip, "pulse aura modelo 3d.png"
src/components/flow/Pulse.tsx, Pulse.module.css   a mudança 3D→2D do personagem
tests/pulse-glasses.test.mjs
.mcp.json, .impeccable/hook.cache.json, supabase/.temp/cli-latest
```

Por isso cada `git add` abaixo nomeia caminhos. Nunca `-A`, nunca `.`.

### A ressalva do `database.types.ts`

O arquivo local carrega **duas** coisas: os tipos da anamnese (o Prontuário) e os
tipos de WhatsApp e manutenção, que vieram dos commits do rebrand. Copiar o
arquivo inteiro para um ramo de `main` levaria junto tipos de funcionalidades que
ninguém pediu para publicar.

A separação é limpa porque as adições não se cruzam. O recorte certo é o diff
contra o HEAD atual, que contém só a anamnese:

```bash
git diff HEAD -- src/lib/supabase/database.types.ts > prontuario-types.patch
# no ramo novo, cortado de main:
git apply prontuario-types.patch
```

Conferido: aplica limpo em `main` (`git apply --check` sem reclamação) e o
`tsc --noEmit` fica limpo depois.

## A sequência

Nada disto foi executado. Começa depois da autorização, e só depois do backup
validado do `RECUPERACAO.md`.

```bash
# 1. Um ramo cortado de main, sem nenhum dos 11 commits do rebrand
git switch -c prontuario main

# 2. Os arquivos do Prontuário, um a um
git add src/components/flow/demo/views/clinical \
        src/components/flow/demo/views/ClinicalRecords.tsx \
        src/lib/flow/clinical.ts src/lib/flow/clinical-actions.ts \
        tests/clinical.test.mjs supabase/propostas
git apply prontuario-types.patch
git add src/lib/supabase/database.types.ts

# 3. Conferir o que entrou ANTES de commitar
git status --porcelain
git diff --cached --stat        # nada de spell/, brand/, package.json, Pulse*.tsx

# 4. Commit e push do ramo
```

O trabalho local **não se perde**: `git switch -c` leva as alterações não
commitadas junto, e o que não for adicionado continua no diretório de trabalho
quando se volta para `pulse-rebrand-3d`.

Se preferir não mexer no diretório onde o servidor de desenvolvimento está
rodando, faça tudo numa árvore separada: `git worktree add ../prontuario main`,
copie os arquivos para lá e commite ali. Foi assim que a verificação abaixo foi
feita.

## A ordem no dia da publicação

1. Backup validado (`RECUPERACAO.md`, seção do backup).
2. **Migrations 0014–0016 primeiro**, com o código antigo ainda no ar. São
   aditivas: o aplicativo publicado hoje continua funcionando sem conhecê-las —
   isso está demonstrado no `RECUPERACAO.md`, nível 1.
3. Conferir no painel que as tabelas novas existem e que uma evolução ainda
   salva, com o código antigo.
4. Só então publicar o ramo `prontuario`.
5. Depois: abrir uma paciente, ver o Prontuário, montar o questionário da
   clínica, registrar uma anamnese, editar, sair e entrar de novo.

Se algo der errado no passo 4, o nível 1 do `RECUPERACAO.md` resolve em segundos
e não encosta no banco.

## O que foi verificado, e como

Uma árvore cortada de `main` (`git worktree add --detach … main`), com os
arquivos do Prontuário e o patch de tipos aplicados, `npm ci` próprio, fora da
pasta do servidor de desenvolvimento:

| Verificação | Resultado |
| --- | --- |
| `npx next build` | passou, todas as rotas, sem aviso novo |
| `npx tsc --noEmit` | limpo |
| `node --test tests/clinical.test.mjs` | 11/11 |
| Todas as classes de `ui.module.css` que o Prontuário usa existem em `main` | 14/14 |
| Layout a 390 px no build de produção | cartão sem overflow (325/325), documento 390/390, abas rolando 220 px por dentro |
| Anamnese renderizada no build de `main` | 4 fichas, autoria, contagem de revisões, botão Editar |
| Edição no build de produção (Supabase de testes) | "Alterações salvas.", revisões 2 → 3, demais campos intactos |

## Uma observação de produto, não um impedimento

Uma clínica recém-publicada **não tem questionário nenhum**. Isso é de propósito:
a dona monta o dela em "Formulários da clínica". Enquanto não montar, a
"Nova anamnese" ainda funciona — os cinco campos fixos (histórico de saúde,
alergias, medicamentos, contraindicações, objetivos) aparecem sempre, e a ficha é
gravada com `version_id` nulo. Vale avisar a clínica piloto, para que o primeiro
uso não pareça uma tela quebrada.
