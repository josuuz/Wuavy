import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/*
  Quem entra no painel da manutenção.

  A autenticação é a que o projeto já tem (Supabase Auth, as mesmas contas do
  Pulse) mais uma lista de e-mails em WUAVY_ADMIN_EMAILS: sem senha nova,
  sem tabela de papéis, sem dependência nova. A lista vive só no servidor,
  então o navegador não sabe quem está nela.

  Lista vazia ou não definida: ninguém é administrador. Um painel que se abre
  sozinho quando falta uma variável de ambiente é pior do que um painel
  fechado.
*/

const allowed = () =>
  (process.env.WUAVY_ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** A lista existe: sem ela, o painel diz o que falta em vez de pedir uma senha que não serve. */
export const adminListReady = () => allowed().length > 0;

export const isAdminEmail = (email: string | null | undefined) => Boolean(email && allowed().includes(email.trim().toLowerCase()));

/**
 * O administrador desta requisição, verificado com o Supabase (nunca lido de
 * um formulário ou da URL), ou null. O painel inteiro começa aqui.
 */
export const getAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return { supabase, user, email: user.email ?? "" };
});
