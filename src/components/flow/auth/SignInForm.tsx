"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";
import { Field, FormError } from "../demo/forms";
import ui from "../demo/ui.module.css";
import { authMessage } from "./messages";

/*
  Sign in, create the account that will own a clinic, or ask for a link to
  reset the password. Supabase Auth runs in the browser with the publishable
  key; the session lands in cookies, and the server takes it from there. A
  new account, once confirmed, goes on to create its clinic (/pulse/comecar);
  a reset link opens /pulse/redefinir-senha.
*/

/*
  Where the emails send people back. Still the /flow addresses: they are the
  ones on Supabase's list of allowed redirects, and next.config sends each to
  its /pulse twin with the code intact. Once /pulse/** is on that list, these
  can name /pulse directly.
*/
const EMAIL_RETURN = { confirm: "/flow/auth/callback", reset: "/flow/redefinir-senha" };

export type SignInMode = "entrar" | "criar" | "recuperar";

const SUBMIT: Record<SignInMode, string> = { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link" };

interface SignInFormProps {
  linkFailed: boolean;
  initialMode?: SignInMode;
  /** A confirmation to show above the form, such as a password just reset. */
  notice?: string;
}

export function SignInForm({ linkFailed, initialMode = "entrar", notice }: SignInFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<SignInMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    linkFailed ? "O link de confirmação expirou ou já foi usado. Entre com e-mail e senha." : null,
  );
  const [sent, setSent] = useState<{ to: string; reset: boolean } | null>(null);

  const switchTo = (next: SignInMode) => {
    setMode(next);
    setError(null);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    const auth = createClient().auth;

    if (mode === "recuperar") {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${EMAIL_RETURN.reset}`,
      });
      setPending(false);
      if (error) return setError(authMessage(error, "Não foi possível enviar o link. Tente de novo."));
      return setSent({ to: email, reset: true });
    }

    if (mode === "entrar") {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) {
        setError(authMessage(error));
        setPending(false);
        return;
      }
      router.replace("/pulse/app");
      router.refresh();
      return;
    }

    const { data, error } = await auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${EMAIL_RETURN.confirm}` },
    });
    if (error) {
      setError(authMessage(error));
      setPending(false);
      return;
    }
    if (data.session) {
      router.replace("/pulse/comecar");
      router.refresh();
      return;
    }
    // Email confirmation is on: the link brings the person back, signed in.
    setSent({ to: email, reset: false });
    setPending(false);
  }

  if (sent) {
    return (
      <div className={ui.suggestion} role="status">
        <p className={ui.label}>{sent.reset ? "Verifique o seu e-mail" : "Confirme o seu e-mail"}</p>
        {sent.reset ? (
          <p>
            Se houver uma conta com <strong>{sent.to}</strong>, enviamos um link para criar uma nova senha. Abra-o neste
            navegador; ele vale por pouco tempo.
          </p>
        ) : (
          <p>
            Enviamos um link para <strong>{sent.to}</strong>. Abra-o neste navegador para continuar e criar a sua clínica.
          </p>
        )}
      </div>
    );
  }

  return (
    <form className={ui.form} onSubmit={onSubmit}>
      {notice ? (
        <p className={ui.done} role="status">
          {notice}
        </p>
      ) : null}
      {mode === "recuperar" ? (
        <p className={ui.fine}>Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
      ) : null}
      <Field label="E-mail">
        <input className={ui.input} name="email" type="email" required autoComplete="email" />
      </Field>
      {mode === "recuperar" ? null : (
        <Field label="Senha">
          <input
            className={ui.input}
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "criar" ? "new-password" : "current-password"}
          />
        </Field>
      )}
      <FormError error={error} />
      <div className={ui.actions}>
        <button type="submit" className={ui.primary} disabled={pending}>
          {SUBMIT[mode]}
        </button>
        {mode === "entrar" ? (
          <>
            <button type="button" className={ui.quiet} onClick={() => switchTo("criar")}>
              Criar uma conta
            </button>
            <button type="button" className={ui.quiet} onClick={() => switchTo("recuperar")}>
              Esqueci minha senha
            </button>
          </>
        ) : (
          <button type="button" className={ui.quiet} onClick={() => switchTo("entrar")}>
            {mode === "criar" ? "Já tenho conta" : "Voltar para entrar"}
          </button>
        )}
      </div>
    </form>
  );
}
