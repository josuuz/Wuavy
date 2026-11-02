// Mede o diálogo de assinatura num WebKit escolhido, com e sem a correção
// (height: auto no .sheetInner do diálogo compacto), em seis tamanhos de tela.
//
//   node tests/browser/ipad-dialog/medir.mjs [pasta-onde-o-playwright-está-instalado]
//
// O projeto NÃO depende do Playwright. Instale-o numa pasta à parte, na versão
// cujo WebKit você quer medir, e passe a pasta (ver COMO-RODAR.md). Cada versão
// do Playwright traz um WebKit: o navegador diz qual é, e o script imprime.
//
// Sai com código 1 se, COM a correção, o diálogo não abrir ou ficar pequeno
// demais (menos de 300px) — esse é o sintoma: um diálogo de ~46px mostrando só
// o cabeçalho.
import { createRequire } from "node:module";
import { resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const { webkit } = createRequire(dir + "/")("playwright");
const base = process.env.HARNESS ?? "http://localhost:3124/harness.html";

const TAMANHOS = [
  { nome: "iPad paisagem 1180x820", viewport: { width: 1180, height: 820 } },
  { nome: "iPad paisagem 1024x768", viewport: { width: 1024, height: 768 } },
  { nome: "iPad retrato  810x1080", viewport: { width: 810, height: 1080 } },
  { nome: "iPad retrato  768x1024", viewport: { width: 768, height: 1024 } },
  { nome: "iPhone        390x844 ", viewport: { width: 390, height: 844 } },
  { nome: "desktop      1440x900 ", viewport: { width: 1440, height: 900 } },
];

async function medir(browser, tamanho, url) {
  const context = await browser.newContext({ viewport: tamanho.viewport, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(450); // a entrada do diálogo leva 260ms
  const medida = await page.evaluate(() => {
    const dialogo = document.getElementById("dialogo");
    const cta = dialogo.querySelector("[data-checkout]").getBoundingClientRect();
    const caixa = dialogo.getBoundingClientRect();
    return {
      aberto: dialogo.open,
      altura: Math.round(caixa.height),
      ctaVisivel: cta.height > 0 && cta.bottom <= caixa.bottom + 1 && cta.top >= caixa.top - 1,
    };
  });
  await context.close();
  return medida;
}

const browser = await webkit.launch();
console.log(`WebKit ${browser.version()}`);
let falhas = 0;
for (const tamanho of TAMANHOS) {
  const com = await medir(browser, tamanho, base);
  const sem = await medir(browser, tamanho, base + "?regressao=1");
  const colapsou = com.altura < 300;
  if (!com.aberto || colapsou) falhas += 1;
  const efeito = sem.altura !== com.altura ? "  << a correção muda o resultado" : "";
  console.log(
    `${tamanho.nome}  com a correção: ${com.altura}px, botão visível: ${com.ctaVisivel} | sem: ${sem.altura}px, botão visível: ${sem.ctaVisivel}${efeito}`,
  );
}
await browser.close();
console.log(falhas ? `FALHA: o diálogo corrigido colapsou em ${falhas} tamanho(s)` : "OK: o diálogo corrigido abre inteiro em todos os tamanhos");
process.exit(falhas ? 1 : 0);
