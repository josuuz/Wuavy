# O diálogo de assinatura em WebKit (Safari)

Mede se o diálogo de assinatura do Clinavy abre inteiro no motor do Safari.
Não faz parte do `npm test` (o projeto não depende do Playwright, e o motor é
baixado à parte); a trava que roda sempre é `tests/modal-height.test.mjs`, que
só confere que a regra do CSS continua escrita.

## O que foi medido (WebKit real, Playwright)

CSS compilado do projeto + o mesmo DOM do componente `Subscribe`, no tema real.

| WebKit | sem `height: auto` | com `height: auto` |
|---|---|---|
| 15.4, 16.4, 17.0, 17.4, 18.0, 18.2, 18.4, **26.0** | diálogo colapsa para **46px** (só o cabeçalho) | 736–826px, botão de assinar visível |
| 27.2 | sem diferença (o motor deixou de ter o problema) | idem |

O defeito só existe de **768px para cima** (iPad, desktop, iPhone deitado), que é
onde o painel lateral dá `height: 100%` ao `.sheetInner`. No iPhone em retrato
não há diferença, como no CSS real.

**Limite:** é o WebKit do Playwright no Windows, o mesmo motor de layout do
Safari, não um iPad físico. Quem pode fechar a lacuna é a própria cliente, abrindo
a tela depois da publicação.

## Como repetir

```bash
# 1. o CSS compilado (de dentro do repositório)
npm run build

# 2. o Playwright e o WebKit desejado, FORA do projeto
mkdir ~/pw-webkit && cd ~/pw-webkit && npm init -y
npm i playwright@1.46.1          # WebKit 18.0 — outras versões: ver abaixo
npx playwright install webkit

# 3. o diálogo, na porta 3124 (de volta ao repositório)
node tests/browser/ipad-dialog/serve.mjs &

# 4. a medição
node tests/browser/ipad-dialog/medir.mjs ~/pw-webkit
```

Versões do Playwright e o WebKit de cada uma (o navegador imprime a sua):
`1.19` → 15.4 · `1.30` → 16.4 · `1.36` → 17.0 · `1.42` → 17.4 · `1.46` → 18.0 ·
`1.49` → 18.2 · `1.52` → 18.4 · `1.55` → 26.0.

`medir.mjs` sai com código 1 se, **com** a correção, o diálogo ficar pequeno
demais. Para ver o defeito, abra `http://localhost:3124/harness.html?regressao=1`.

## Outra limitação do diálogo, ainda de pé

Com ~850px de conteúdo e o `max-height` de `calc(100dvh - 2rem)`, em iPad
paisagem 1024×768 o botão "Assinar" fica **abaixo da dobra** (o diálogo rola por
dentro). Não é o defeito acima, e não foi alterado aqui.
