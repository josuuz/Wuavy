import type { AuthError } from "@supabase/supabase-js";

/* Supabase Auth's errors, said in Portuguese. Codes: @supabase/auth-js lib/error-codes. */

const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme o seu e-mail pelo link que enviamos antes de entrar.",
  user_already_exists: "Já existe uma conta com este e-mail. Entre com ela.",
  email_address_invalid: "Este e-mail não é aceito. Use outro endereço.",
  email_address_not_authorized: "O envio de e-mails do projeto ainda não aceita este endereço (configure um SMTP no Supabase).",
  weak_password: "Senha fraca. Use pelo menos 6 caracteres, misturando letras, números e símbolos.",
  same_password: "A nova senha precisa ser diferente da anterior.",
  session_not_found: "Sua sessão de recuperação expirou. Peça um novo link.",
  session_expired: "Sua sessão de recuperação expirou. Peça um novo link.",
  reauthentication_needed: "Por segurança, peça um novo link de recuperação e tente de novo.",
  over_email_send_rate_limit: "Muitas tentativas seguidas. Aguarde alguns minutos.",
  over_request_rate_limit: "Muitas tentativas seguidas. Aguarde alguns minutos.",
};

export const authMessage = (error: AuthError, fallback = "Algo deu errado. Tente de novo.") =>
  (error.code && MESSAGES[error.code]) || fallback;
