"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { acceptInvite } from "@/lib/flow/team";
import { createRecoveryClient } from "@/lib/supabase/client";
import { Field, FormError, SignOut } from "../demo/forms";
import ui from "../demo/ui.module.css";
import { authMessage } from "./messages";

/*
  Where an invitation lands. The owner's link carries a one-time code; it is
  exchanged here, in the browser, for the invited person's own session (and
  taken out of the address bar). Then the person confirms their name, creates
  their password and joins: from then on they sign in like anyone else, with
  their own e-mail and password. Someone who already had an account signs in
  with it and accepts here. An access the owner ended is explained, nothing more.
*/

export type InviteState =
  | { kind: "pending"; clinic: string; role: string; invitedBy?: string; name: string }
  | { kind: "ended"; clinic: string }
  | { kind: "none"; signedIn: boolean };

const LINK_TYPES: EmailOtpType[] = ["invite", "magiclink", "email"];
const EXPIRED = "Este link de convite expirou ou já foi usado. Peça um novo link ao responsável pela clínica.";

export function InviteAccept({ state }: { state: InviteState }) {
  const router = useRouter();
  const [auth] = useState(() => createRecoveryClient().auth);
  const [checking, setChecking] = useState(true);
  const [viaLink, setViaLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The code works once: never exchange it twice (Strict Mode runs effects twice in development).
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as EmailOtpType | null;
    // Out of the address bar: a reload or a shared screenshot can't replay it.
    window.history.replaceState(null, "", url.pathname);
    (async () => {
      if (!tokenHash || !type || !LINK_TYPES.includes(type)) return setChecking(false);
      const { error } = await auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) {
        setLinkError(EXPIRED);
        setChecking(false);
        return;
      }
      setViaLink(true);
      setChecking(false);
      // The server reads the new session: the invitation shows.
      router.refresh();
    })();
  }, [auth, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    if (viaLink) {
      const password = String(form.get("password") ?? "");
      if (password !== String(form.get("confirm") ?? "")) {
        setPending(false);
        return setError("As senhas não coincidem.");
      }
      const { error } = await auth.updateUser({ password });
      if (error) {
        setPending(false);
        return setError(authMessage(error, "Não foi possível salvar a senha. Tente de novo."));
      }
    }
    const result = await acceptInvite(form);
    if (result.error) {
      setPending(false);
      return setError(result.error);
    }
    router.replace("/pulse/app");
    router.refresh();
  }

  if (checking) {
    return (
      <p className={ui.fine} role="status">
        Validando o convite…
      </p>
    );
  }

  if (state.kind === "pending") {
    return (
      <form className={ui.form} onSubmit={onSubmit}>
        <div className={ui.suggestion}>
          <p className={ui.label}>{state.clinic}</p>
          <p>
            {state.invitedBy ? `${state.invitedBy} convidou você` : "Você foi convidado(a)"} para a equipe como{" "}
            <strong>{state.role}</strong>.
          </p>
        </div>
        <Field label="Seu nome">
          <input className={ui.input} name="name" required maxLength={120} defaultValue={state.name} autoComplete="name" />
        </Field>
        {viaLink ? (
          <>
            <Field label="Crie sua senha">
              <input className={ui.input} name="password" type="password" required minLength={6} autoComplete="new-password" />
            </Field>
            <Field label="Confirme a senha">
              <input className={ui.input} name="confirm" type="password" required minLength={6} autoComplete="new-password" />
            </Field>
            <p className={ui.fine}>Daqui em diante, você entra no Pulse com o seu e-mail e esta senha.</p>
          </>
        ) : (
          <p className={ui.fine}>
            Você continua entrando com o seu e-mail e a senha que já usa no Pulse. Se não lembrar dela, use “Esqueci minha
            senha” na tela de entrada.
          </p>
        )}
        <FormError error={error} />
        <div className={ui.actions}>
          <button type="submit" className={ui.primary} disabled={pending}>
            {pending ? "Entrando…" : "Entrar na equipe"}
          </button>
          <SignOut className={ui.quiet} />
        </div>
      </form>
    );
  }

  if (state.kind === "ended") {
    return (
      <div className={ui.form}>
        <div className={ui.suggestion} role="status">
          <p className={ui.label}>Acesso encerrado</p>
          <p>
            Seu acesso à {state.clinic} foi desativado pelo responsável. O que você registrou continua na clínica. Se for um
            engano, fale com o responsável.
          </p>
        </div>
        <div className={ui.actions}>
          <SignOut className={ui.secondary} />
        </div>
      </div>
    );
  }

  return (
    <div className={ui.form}>
      <div className={ui.suggestion} role={linkError ? "alert" : "status"}>
        <p className={ui.label}>{linkError ? "Link inválido" : "Nenhum convite pendente"}</p>
        <p>
          {linkError ??
            (state.signedIn
              ? "Não há convite pendente para esta conta. Se você recebeu um link, abra-o de novo."
              : "Esta página abre pelo link de convite que o responsável pela clínica enviou.")}
        </p>
      </div>
      <div className={ui.actions}>
        {state.signedIn ? (
          <SignOut className={ui.secondary} />
        ) : (
          <Link href="/pulse/entrar" className={ui.textAction}>
            Entrar no Pulse <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
