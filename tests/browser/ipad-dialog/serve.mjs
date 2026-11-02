// Serve o diálogo de assinatura com o DOM REAL do componente Subscribe
// (src/components/flow/demo/FlowDemo.tsx) e o CSS COMPILADO do projeto embutido,
// no escopo real do tema ([data-pulse], data-pulse-theme="light"). Sem next
// start, sem sessão, sem rede: a rota real /clinavy/demo exige login.
//
//   /harness.html               o CSS do projeto como está
//   /harness.html?regressao=1   devolve a regra do painel lateral (height: 100%
//                               no .sheetInner, de 768px para cima), ou seja,
//                               o diálogo SEM a correção
//
// Pré-requisito: `npm run build` (o CSS compilado vem de .next/static/chunks).
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHUNKS = fileURLToPath(new URL("../../../.next/static/chunks/", import.meta.url));
const css = readdirSync(CHUNKS)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(CHUNKS + f, "utf8"))
  .join(String.fromCharCode(10));
const prefix = /(ui-module__[A-Za-z0-9]+__)modal/.exec(css)?.[1];
if (!prefix) throw new Error("CSS do diálogo não encontrado em .next/static/chunks — rode `npm run build` antes.");
const c = (name) => prefix + name;
const PORT = Number(process.env.PORT ?? 3124);

const page = (regressao) => `<!doctype html>
<html lang="pt-BR" data-pulse-theme="light"${regressao ? " data-regressao" : ""}>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diálogo de assinatura</title>
<style>${css}</style>
<style>
body{margin:0}
/* A regra do painel lateral, devolvida só de 768px para cima, como no CSS real. */
@media (min-width:768px){html[data-regressao] .${c("modal")} .${c("sheetInner")}{height:100%}}
</style></head><body>
<div data-pulse>
<dialog id="dialogo" class="${c("modal")}" data-pulse-surface="sheet" aria-label="Clinavy">
 <div class="${c("sheetInner")}">
  <header class="${c("sheetHead")}">
   <span class="${c("offerCrown")}"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M4.6 9.2 8.4 13 12 6.6l3.6 6.4 3.8-3.8-1.5 8.3H6.1Z" fill="none" stroke="currentColor"/></svg></span>
   <div><p class="${c("kicker")}">Assinatura</p><h2 class="${c("sheetTitle")}">Clinavy</h2></div>
   <button type="button" class="${c("close")}">Fechar</button>
  </header>
  <div class="${c("offerPrice")}">
   <p class="${c("price")}"><strong>R$ 297</strong><span>/mês</span></p>
   <p class="${c("priceText")}">Transforme dados da sua clínica em oportunidades de crescimento.</p>
  </div>
  <ul class="${c("includes")}" aria-label="O que a assinatura inclui">
   <li>Pacientes, vendas e orçamentos</li><li>Agenda, faltas e retornos</li><li>Procedimentos e estoque ligados</li>
   <li>Motor de oportunidades com receita potencial</li><li>Mensagens prontas para enviar pelo WhatsApp</li>
  </ul>
  <ul class="${c("soonList")}" aria-label="Chega em breve ao plano">
   <li><span class="${c("soon")}">Em breve</span>Automações inteligentes</li>
   <li><span class="${c("soon")}">Em breve</span>Clinavy AI</li>
   <li><span class="${c("soon")}">Em breve</span>Rastreamento de receita recuperada</li>
  </ul>
  <section class="${c("method")}" aria-labelledby="fp">
   <h3 id="fp" class="${c("label")}">Forma de pagamento</h3>
   <div class="${c("methodOption")}"><p class="${c("methodName")}">Cartão de crédito <span class="${c("methodBadge")}">Recomendado</span></p><p class="${c("methodNote")}">Cobrança automática de R$ 297/mês.</p></div>
   <p class="${c("fine")}">Pix e boleto não fazem a cobrança automática de cada mês; por isso a assinatura é no cartão.</p>
  </section>
  <div class="${c("modalActions")}">
   <a href="#" class="${c("primary")} ${c("offerCta")}" data-checkout="">Assinar Clinavy — R$ 297/mês</a>
   <button type="button" class="${c("quiet")}">Continuar explorando a demo</button>
  </div>
 </div>
</dialog>
</div>
<script>document.getElementById("dialogo").showModal()</script>
</body></html>`;

createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(page(new URL(req.url, "http://x").searchParams.has("regressao")));
}).listen(PORT, () => console.log(`diálogo em http://localhost:${PORT}/harness.html (CSS ${prefix}…)`));
