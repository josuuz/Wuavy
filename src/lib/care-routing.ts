/*
  Puro e sem acesso a rede, como src/i18n/config.ts: só os regex que
  src/proxy.ts usa para decidir, por pathname, quais rotas são o grupo (care)
  — manutenção de sites e Wuavy Cobranças — e quais precisam da sessão do
  Supabase renovada antes de chegar à página. Separado do proxy só para
  poder ser testado sem o runtime do Next.js (next/server não resolve fora
  dele em node --test).
*/

export const PULSE_SESSION = /^\/pulse\/(?:(?:app|demo)(?:\/.*)?|entrar|comecar|assinar|convite)$/;
export const PULSE_APP = /^\/pulse\/./;

// A manutenção de sites: o painel precisa da sessão de um administrador; a
// página de um cliente abre pelo token da URL e não tem sessão nenhuma.
// Wuavy Cobranças (/cobrancas): só painel administrativo, sempre com sessão —
// ao contrário da manutenção, não tem nenhuma página pública por token.
export const CARE_SESSION = /^\/(?:manutencao\/admin|cobrancas)(?:\/.*)?$/;
export const CARE = /^\/(?:manutencao|cobrancas)(?:\/|$)/;
