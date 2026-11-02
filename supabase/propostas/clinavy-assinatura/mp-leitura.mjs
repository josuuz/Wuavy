// Compara, SOMENTE POR LEITURA, uma venda aprovada com as assinaturas recorrentes
// de um período, no Mercado Pago real.
//
//   MERCADOPAGO_ACCESS_TOKEN=... node supabase/propostas/clinavy-assinatura/mp-leitura.mjs \
//       --venda <id-do-pagamento-aprovado> --desde 2026-10-16 --ate 2026-11-02
//
// O QUE ELE FAZ — e só isto:
//   - só GET. Há uma única função que fala com a rede e ela fixa method: "GET";
//     tests/mp-leitura.test.mjs falha se qualquer outro método sair.
//   - não cria, não cancela, não cobra, não altera nada, em lugar nenhum.
//   - não grava o token: ele vem da variável de ambiente e só vai no cabeçalho
//     Authorization. Rode-o você mesmo; ele não precisa passar por mais ninguém.
//
// O QUE ELE NUNCA IMPRIME: e-mail, nome, documento, número de cartão, token.
// De uma identidade imprime só uma impressão digital curta (8 caracteres de um
// SHA-256), que serve para dizer "é a mesma conta" ou "não é" sem mostrar quem é,
// e respostas sim/não. O teste confere que nenhum "@" chega à saída.
//
// A pergunta que ele responde: a venda aprovada e as assinaturas recusadas são da
// MESMA conta vendedora (collector_id)? O pagador das assinaturas é a MESMA conta
// do Mercado Pago que pagou a venda? O e-mail que enviamos como payer_email é o
// da conta que pagou? E, para cada tentativa, qual foi o status_detail?
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const API = "https://api.mercadopago.com";
const PAGINA = 100;
const MAX_PAGINAS = 5;

/** Uma impressão digital curta: igualdade sem identidade. */
const digital = (valor) => (valor === undefined || valor === null || valor === "" ? null : createHash("sha256").update(String(valor).trim().toLowerCase()).digest("hex").slice(0, 8));
const mesmo = (a, b) => (a === null || b === null ? null : a === b);
const dia = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : null);
const dentro = (iso, desde, ate) => {
  const d = dia(iso);
  return Boolean(d) && d >= desde && d <= ate;
};
/** Igualdade de ids que podem faltar: sem um dos lados, "indeterminado" (null), nunca "não". */
const mesmoId = (a, b) => (a === undefined || a === null || b === undefined || b === null ? null : String(a) === String(b));

/**
 * Faz a comparação. `fetchImpl` é injetável para o teste; o padrão é o fetch real.
 * Devolve um relatório (objeto) — `renderizar` o transforma em texto.
 */
export async function comparar({ token, fetchImpl = globalThis.fetch, venda, desde, ate }) {
  if (!token || !String(token).trim()) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN no ambiente.");
  if (!/^\d{1,20}$/.test(String(venda ?? ""))) throw new Error("--venda precisa ser o número do pagamento aprovado.");

  const erros = [];
  /** A ÚNICA saída para a rede. method fixo em GET: este arquivo não tem como escrever. */
  async function get(caminho) {
    try {
      const response = await fetchImpl(`${API}${caminho}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // Só o status e o caminho: o corpo de um erro pode trazer dado do cliente.
        erros.push(`GET ${caminho.split("?")[0]} → HTTP ${response.status}`);
        return null;
      }
      return body;
    } catch {
      erros.push(`GET ${caminho.split("?")[0]} → sem resposta`);
      return null;
    }
  }

  const conta = await get("/users/me");
  const contaId = conta?.id ?? null;

  const pagamento = await get(`/v1/payments/${venda}`);
  const emailDaVenda = digital(pagamento?.payer?.email);
  const payerDaVenda = digital(pagamento?.payer?.id);
  const vendaResumo = pagamento
    ? {
        encontrada: true,
        status: pagamento.status ?? null,
        statusDetail: pagamento.status_detail ?? null,
        liveMode: typeof pagamento.live_mode === "boolean" ? pagamento.live_mode : null,
        collectorId: pagamento.collector_id ?? null,
        valor: pagamento.transaction_amount ?? null,
        metodo: pagamento.payment_method_id ?? null,
        tipo: pagamento.payment_type_id ?? null,
        criadoEm: pagamento.date_created ?? null,
        aprovadoEm: pagamento.date_approved ?? null,
        pagadorComConta: payerDaVenda !== null,
        emailDoPagadorInformado: emailDaVenda !== null,
        mesmaContaDoToken: mesmoId(pagamento.collector_id, contaId),
      }
    : { encontrada: false };

  // As assinaturas da conta, na janela pedida (a busca não filtra por data: filtra-se aqui).
  const assinaturas = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const lote = await get(`/preapproval/search?limit=${PAGINA}&offset=${pagina * PAGINA}`);
    const resultados = lote?.results ?? [];
    assinaturas.push(...resultados);
    if (resultados.length < PAGINA) break;
  }

  const tentativas = [];
  for (const assinatura of assinaturas.filter((a) => dentro(a.date_created, desde, ate))) {
    const cobrancas = (await get(`/authorized_payments/search?preapproval_id=${encodeURIComponent(assinatura.id)}`))?.results ?? [];
    tentativas.push({
      criadaEm: assinatura.date_created ?? null,
      status: assinatura.status ?? null,
      valor: assinatura.auto_recurring?.transaction_amount ?? null,
      collectorId: assinatura.collector_id ?? null,
      mesmaContaDaVenda: mesmoId(assinatura.collector_id, pagamento?.collector_id),
      // O mesmo pagador no Mercado Pago da venda aprovada?
      pagadorIdIgualAoDaVenda: mesmo(digital(assinatura.payer_id), payerDaVenda),
      // O e-mail que ENVIAMOS (payer_email) é o da conta que pagou a venda?
      payerEmailIgualAoDaVenda: mesmo(digital(assinatura.payer_email), emailDaVenda),
      temPagadorNoMercadoPago: digital(assinatura.payer_id) !== null,
      cobrancas: cobrancas.map((c) => ({
        status: c.status ?? null,
        pagamentoStatus: c.payment?.status ?? null,
        statusDetail: c.payment?.status_detail ?? null,
        criadaEm: c.date_created ?? null,
      })),
    });
  }

  // Os pagamentos de R$ 297 do período (onde uma recusa do Card Brick aparece com status_detail).
  const busca = await get(
    `/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=${desde}T00:00:00.000-03:00&end_date=${ate}T23:59:59.000-03:00&limit=${PAGINA}`,
  );
  const pagamentos297 = (busca?.results ?? [])
    .filter((p) => Math.round(Number(p.transaction_amount) * 100) === 29700)
    .map((p) => ({
      criadoEm: p.date_created ?? null,
      status: p.status ?? null,
      statusDetail: p.status_detail ?? null,
      metodo: p.payment_method_id ?? null,
      liveMode: typeof p.live_mode === "boolean" ? p.live_mode : null,
      mesmaContaDaVenda: mesmoId(p.collector_id, pagamento?.collector_id),
      pagadorIdIgualAoDaVenda: mesmo(digital(p.payer?.id), payerDaVenda),
    }));

  return { conta: { id: contaId }, venda: vendaResumo, tentativas, pagamentos297, erros, janela: { desde, ate } };
}

const sn = (valor) => (valor === true ? "sim" : valor === false ? "NÃO" : "indeterminado");

/** O relatório em texto. Nada aqui imprime e-mail, nome, documento, cartão ou token. */
export function renderizar(relatorio) {
  const l = [];
  const { conta, venda, tentativas, pagamentos297, erros, janela } = relatorio;
  l.push(`Conta do token (collector): ${conta.id ?? "não obtida"}`);
  l.push("");
  l.push("VENDA APROVADA");
  if (!venda.encontrada) {
    l.push("  não encontrada com este token — outra conta, ou token de teste lendo uma venda real");
  } else {
    l.push(`  status ${venda.status} / ${venda.statusDetail} · ${venda.valor} · ${venda.metodo} (${venda.tipo}) · live_mode=${venda.liveMode}`);
    l.push(`  collector_id ${venda.collectorId} · é a conta deste token: ${sn(venda.mesmaContaDoToken)}`);
    l.push(`  o pagador tinha conta no Mercado Pago: ${sn(venda.pagadorComConta)} · informou e-mail: ${sn(venda.emailDoPagadorInformado)}`);
  }
  l.push("");
  l.push(`ASSINATURAS CRIADAS ENTRE ${janela.desde} E ${janela.ate}: ${tentativas.length}`);
  tentativas.forEach((t, i) => {
    l.push(`  #${i + 1} ${t.criadaEm?.slice(0, 16) ?? "?"} · ${t.status} · R$ ${t.valor}`);
    l.push(
      `      mesma conta vendedora da venda: ${sn(t.mesmaContaDaVenda)} · pagador no MP: ${sn(t.temPagadorNoMercadoPago)} · mesma conta de pagador da venda: ${sn(t.pagadorIdIgualAoDaVenda)}`,
    );
    l.push(`      o e-mail que enviamos (payer_email) é o da conta que pagou a venda: ${sn(t.payerEmailIgualAoDaVenda)}`);
    if (t.cobrancas.length === 0) l.push("      cobranças: nenhuma");
    t.cobrancas.forEach((c) => l.push(`      cobrança ${c.status} · pagamento ${c.pagamentoStatus ?? "—"} · status_detail ${c.statusDetail ?? "—"}`));
  });
  l.push("");
  l.push(`PAGAMENTOS DE R$ 297 NO PERÍODO: ${pagamentos297.length}`);
  pagamentos297.forEach((p, i) =>
    l.push(
      `  #${i + 1} ${p.criadoEm?.slice(0, 16) ?? "?"} · ${p.status} / ${p.statusDetail ?? "—"} · ${p.metodo ?? "—"} · live_mode=${p.liveMode} · mesma conta vendedora: ${sn(p.mesmaContaDaVenda)} · mesmo pagador da venda: ${sn(p.pagadorIdIgualAoDaVenda)}`,
    ),
  );
  if (erros.length) {
    l.push("");
    l.push("LEITURAS QUE FALHARAM (o relatório acima pode estar incompleto):");
    erros.forEach((e) => l.push(`  ${e}`));
  }
  return l.join("\n");
}

function argumento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const executadoDiretamente = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDiretamente) {
  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  try {
    const relatorio = await comparar({
      token: process.env.MERCADOPAGO_ACCESS_TOKEN,
      venda: argumento("venda"),
      desde: argumento("desde") ?? "2026-10-16",
      ate: argumento("ate") ?? amanha,
    });
    console.log(renderizar(relatorio));
  } catch (error) {
    console.error(String(error.message ?? error));
    process.exit(1);
  }
}
