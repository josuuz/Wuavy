"use client";

import type { AuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { createRecoveryClient } from "@/lib/supabase/client";
import { Field, FormError } from "../demo/forms";
import ui from "../demo/ui.module.css";
import { authMessage } from "./messages";

/*
  Where the "Reset your password" email lands. The link carries a one-time
  code (PKCE, asked for on /pulse/entrar in this browser); with a custom email
  template, a token hash; sent from the dashboard or the admin API, the
  recovery session itself in the #fragment. Any of them becomes a short
  recovery session here; only then the form appears, the new password goes
  through updateUser, every session is signed out and the person signs in
  again with it.
*/

type Stage = { kind: "checking" } | { kind: "ready" } | { kind: "invalid"; message: string };

const EXPIRED = "Este link de recuperação expirou ou já foi usado. Peça um novo.";
const OTHER_BROWSER = "Abra o link no mesmo navegador em que você pediu a recuperação, ou peça um novo.";
const NO_LINK = "Esta página abre pelo link de recuperação enviado por e-mail.";

function linkProblem(error: AuthError) {
  return error.code === "pkce_code_verifier_not_found" ? OTHER_BROWSER : EXPIRED;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [auth] = useState(() => createRecoveryClient().auth);
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The code works once: never exchange it twice (Strict Mode runs effects twice in development).
    if (started.current) return;
    started.current = true;

    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const read = (key: string) => url.searchParams.get(key) ?? hash.get(key);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const session = hash.get("type") === "recovery" && hash.get("access_token") && hash.get("refresh_token");
    const failed = read("error_code") ?? read("error");
    // Out of the address bar: a reload or a shared screenshot can't replay it.
    window.history.replaceState(null, "", url.pathname);

    (async () => {
      if (failed) return setStage({ kind: "invalid", message: EXPIRED });
      if (!code && !tokenHash && !session) return setStage({ kind: "invalid", message: NO_LINK });
      const { error } = code
        ? await auth.exchangeCodeForSession(code)
        : tokenHash
          ? await auth.verifyOtp({ type: "recovery", token_hash: tokenHash })
          : await auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
      setStage(error ? { kind: "invalid", message: linkProblem(error) } : { kind: "ready" });
    })();
  }, [auth]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) return setError("As senhas não coincidem.");

    setPending(true);
    setError(null);
    const { error } = await auth.updateUser({ password });
    if (error) {
      setError(authMessage(error, "Não foi possível atualizar a senha. Tente de novo."));
      setPending(false);
      return;
    }
    // A new password closes every session, this one included: the next step is signing in with it.
    await auth.signOut();
    router.replace("/pulse/entrar?senha=redefinida");
  }

  if (stage.kind === "checking") {
    return (
      <p className={ui.fine} role="status">
        Validando o link…
      </p>
    );
  }

  if (stage.kind === "invalid") {
    return (
      <div className={ui.form}>
        <div className={ui.suggestion} role="alert">
          <p className={ui.label}>Link inválido</p>
          <p>{stage.message}</p>
        </div>
        <Link href="/pulse/entrar?modo=recuperar" className={ui.textAction}>
          Pedir um novo link <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  return (
    <form className={ui.form} onSubmit={onSubmit}>
      <Field label="Nova senha">
        <input className={ui.input} name="password" type="password" required minLength={6} autoComplete="new-password" />
      </Field>
      <Field label="Confirme a nova senha">
        <input className={ui.input} name="confirm" type="password" required minLength={6} autoComplete="new-password" />
      </Field>
      <FormError error={error} />
      <div className={ui.actions}>
        <button type="submit" className={ui.primary} disabled={pending}>
          Salvar nova senha
        </button>
      </div>
    </form>
  );
}
