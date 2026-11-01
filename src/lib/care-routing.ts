/*
  Puro e sem acesso a rede, como src/i18n/config.ts: só os regex que
  src/proxy.ts usa para decidir, por pathname, quais rotas são o grupo (care)
  — manutenção de sites e Wuavy Cobranças — e quais precisam da sessão do
  Supabase renovada antes de chegar à página. Separado do proxy só para
  poder ser testado sem o runtime do Next.js (next/server não resolve fora
  dele em node --test).
*/

export const PULSE_SESSION = /^\/clinavy\/(?:(?:app|demo)(?:\/.*)?|entrar|comecar|assinar|convite)$/;
export const PULSE_APP = /^\/clinavy\/./;

// A manutenção de sites: o painel precisa da sessão de um administrador; a
// página de um cliente abre pelo token da URL e não tem sessão nenhuma.
// Wuavy Cobranças (/cobrancas): só painel administrativo, sempre com sessão —
// ao contrário da manutenção, não tem nenhuma página pública por token.
export const CARE_SESSION = /^\/(?:manutencao\/admin|cobrancas)(?:\/.*)?$/;
export const CARE = /^\/(?:manutencao|cobrancas)(?:\/|$)/;

/*
  Os endereços antigos do produto (/pulse e, antes dele, /flow) valem para
  sempre: este é o único lugar que sabe traduzi-los para /clinavy. Devolve o
  endereço novo, com o prefixo de idioma que veio (/pt-pt/pulse → /pt-pt/clinavy),
  ou null se o endereço não é do produto antigo. A query não passa por aqui:
  quem redireciona a repassa inteira (a volta do Mercado Pago, o link do e-mail
  do Supabase e o convite da equipe chegam com parâmetros). Só vale para as
  páginas; o proxy deixa as APIs e os webhooks (/api) de fora, e só redireciona
  GET e HEAD.
*/
const LEGACY_PRODUCT = /^((?:\/pt-(?:br|pt))?)\/(?:pulse|flow)(?=\/|$)/i;

export function clinavyPath(pathname: string): string | null {
  const match = LEGACY_PRODUCT.exec(pathname);
  if (!match) return null;
  const moved = `${match[1]}/clinavy${pathname.slice(match[0].length)}`;
  // A tela de CRM se chama Vendas desde antes do rebranding: o link antigo cai nela.
  return moved.replace(/^((?:\/pt-(?:br|pt))?\/clinavy\/(?:demo|app))\/crm$/i, "$1/vendas");
}
