"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import type { AuthorizeAction, Authorized } from "@/lib/maintenance/types";
import styles from "./Plan.module.css";

/*
  O botão que leva o cliente ao Mercado Pago, e nada além disso.

  A autorização acontece no Mercado Pago: o cartão nunca passa por esta
  página. Aqui só se pede o e-mail da cobrança quando ele não está no
  cadastro, e se espera o endereço que o servidor devolve.

  O navegador nunca decide que a assinatura está ativa: quem diz é o
  servidor, de volta do Mercado Pago, quando o cliente retorna.
*/

interface AuthorizeProps {
  token: string;
  /** O cadastro não tem e-mail: a cobrança precisa de um. */
  needsEmail: boolean;
  /** Uma autorização já começada: o texto do botão continua, em vez de começar. */
  resuming?: boolean;
  action: AuthorizeAction;
}

export function Authorize({ token, needsEmail, resuming = false, action }: AuthorizeProps) {
  const [email, setEmail] = useState("");
  const [answer, setAnswer] = useState<Authorized | null>(null);
  const [going, start] = useTransition();

  const send = () =>
    start(async () => {
      const result = await action({ token, email: email.trim() || undefined });
      if (result.outcome === "redirect" && result.url) {
        // O Mercado Pago recebe o cartão. Sair da página é o ponto.
        window.location.href = result.url;
        return;
      }
      setAnswer(result);
      // Já cobrando: a página relê o estado do servidor.
      if (result.outcome === "active") window.location.reload();
    });

  const message =
    answer?.outcome === "email"
      ? "Precisamos de um e-mail válido para a cobrança."
      : answer?.outcome === "unavailable"
        ? "A assinatura online está sendo preparada. Fale com a gente pelo WhatsApp e ativamos a sua manutenção."
        : answer?.outcome === "error"
          ? (answer.detail ?? "Não foi possível abrir a autorização agora. Tente de novo em alguns instantes.")
          : null;

  return (
    <div className={styles.action}>
      {needsEmail ? (
        <label className={styles.field}>
          <span className="type-micro">E-mail para a cobrança</span>
          <input
            type="email"
            name="email"
            className={styles.input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="voce@seudominio.com"
            required
          />
        </label>
      ) : null}

      <div className={styles.actionRow}>
        <Button onClick={send} disabled={going} aria-busy={going || undefined}>
          {going ? "Abrindo o Mercado Pago…" : resuming ? "Continuar a autorização" : "Autorizar cobrança mensal"}
        </Button>
        <p className={`type-micro ${styles.fine}`}>Cartão pelo Mercado Pago · Cancele quando quiser</p>
      </div>

      {message ? (
        <p className={`type-body ${styles.error}`} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
