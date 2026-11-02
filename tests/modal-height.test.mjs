/*
  O diálogo de assinatura no Safari: a regra que o impede de colapsar.

  O defeito (relatado pela primeira cliente, num iPad): o diálogo abria
  "minúsculo, mostrando praticamente só o cabeçalho". Medido em WebKit real
  (Playwright), com o CSS compilado do projeto e o DOM do componente Subscribe:

    WebKit 15.4, 16.4, 17.0, 17.4, 18.0, 18.2, 18.4 e 26.0
      sem a regra:  o diálogo colapsa para 46px de altura
      com a regra:  788px (iPad paisagem) ou 819–826px (retrato)
    WebKit 27.2: sem diferença — o motor deixou de ter o problema.

  A causa: de 768px para cima o painel lateral dá `height: 100%` ao
  .sheetInner. O diálogo compacto (.modal) tem `height: fit-content`, então
  essa porcentagem não tem referência, e o WebKit a resolve como a altura do
  preenchimento sozinho. O .sheetInner tem overflow-y: auto, e o que sobra é
  cortado: fica a faixa do cabeçalho.

  Só aparece no navegador, então nenhum teste de lógica o veria. Este teste não
  mede o layout; ele garante que a regra que o evita continua escrita. Se alguém
  a remover num refactor de CSS, a suíte avisa antes de um cliente descobrir.
  Como reproduzir a medição: tests/browser/ipad-dialog/COMO-RODAR.md.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/components/flow/demo/ui.module.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** O corpo da primeira regra com este seletor exato, fora de qualquer @media. */
function topLevelRule(selector) {
  const stripped = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const match = new RegExp(`(?:^|\\n)${selector.replace(/[.\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(stripped);
  return match ? match[1] : null;
}

test("o painel lateral dá height: 100% ao .sheetInner de 768px para cima (a premissa do defeito)", () => {
  const media = /@media \(min-width: 768px\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(media, "o bloco de 768px do painel lateral existe");
  const rule = /\.sheetInner\s*\{([^}]*)\}/.exec(media[1]);
  assert.ok(rule, ".sheetInner dentro do bloco de 768px");
  assert.match(rule[1], /height:\s*100%/, "se esta regra mudar, o defeito e a correção abaixo precisam ser reavaliados juntos");
});

test("o .sheetInner do diálogo compacto volta a ter altura automática", () => {
  const rule = topLevelRule(".modal .sheetInner");
  assert.ok(rule, "a regra '.modal .sheetInner' existe");
  assert.match(rule, /(^|[;\s])height:\s*auto\s*;/, "sem 'height: auto' o diálogo colapsa para ~46px no Safari (WebKit 15.4 a 26.0)");
});

test("o diálogo compacto continua com altura de conteúdo e limite de tela", () => {
  const rule = topLevelRule(".modal");
  assert.ok(rule, "a regra '.modal' existe");
  assert.match(rule, /height:\s*fit-content/, "é a altura de conteúdo que torna a porcentagem do filho sem referência");
  assert.match(rule, /max-height:\s*calc\(100dvh\s*-\s*2rem\)/, "o limite que faz o conteúdo longo rolar por dentro");
});
