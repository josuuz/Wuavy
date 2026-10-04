"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { whatsappHref } from "@/lib/contact";
import { READ_ONLY_MESSAGE } from "@/lib/flow/access";
import type { Result } from "@/lib/flow/actions";
import { createClient } from "@/lib/supabase/client";
import { focusHref } from "./copy";
import { useFlow, type Focus } from "./store";
import styles from "./ui.module.css";

/*
  Pieces the screens share. A write is a Server Action in the real Pulse (or
  a change in memory in the demo): pending while it and the refresh it
  triggers run, its error kept next to the form, the sheet closed only when
  the write said yes.
*/

export function useWrite() {
  const { access } = useFlow();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const write = (action: () => Promise<Result>, onDone?: () => void) => {
    // Read-only: say why next to the form, without a round trip (the server refuses too).
    if (!access.canEdit) return setError(READ_ONLY_MESSAGE);
    start(async () => {
      const result = await action();
      setError(result.error ?? null);
      if (!result.error) onDone?.();
    });
  };

  // onSubmit rather than <form action>: a failed save keeps what was typed.
  const submit = (action: (form: FormData) => Promise<Result>, onDone?: () => void) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      write(() => action(form), onDone);
    };

  return { pending, error, write, submit };
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? (
    <p className={styles.formError} role="alert">
      {error}
    </p>
  ) : null;
}

/** Deleting takes two presses: the first asks, the second deletes. */
export function DeleteButton({ confirm, pending, onDelete }: { confirm: string; pending: boolean; onDelete: () => void }) {
  const { access } = useFlow();
  const [asking, setAsking] = useState(false);
  if (!access.canEdit) return null;
  if (!asking) {
    return (
      <button type="button" className={styles.quiet} onClick={() => setAsking(true)}>
        Excluir
      </button>
    );
  }
  return (
    <>
      <button type="button" className={styles.secondary} disabled={pending} onClick={onDelete}>
        {confirm}
      </button>
      <button type="button" className={styles.quiet} onClick={() => setAsking(false)}>
        Manter
      </button>
    </>
  );
}

/** "1240,5" for a form field, from cents. */
export const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false });

/** A screen with nothing on it yet: what it is for, in a sentence or two, and the first thing to do. */
export function Intro({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={styles.intro} aria-label={title}>
      <p className={styles.kicker}>{title}</p>
      <p className={styles.introText}>{children}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </section>
  );
}

/** A link to another screen that opens it on a record, a filter or a day. */
export function FocusLink({ focus, className, children }: { focus: Focus; className?: string; children: ReactNode }) {
  const { dispatch, base } = useFlow();
  return (
    <Link href={focusHref(focus, base)} className={className ?? styles.textAction} onClick={() => dispatch({ type: "focus", focus })}>
      {children}
    </Link>
  );
}

/** Digits only, to tell whether two phone numbers are the same. */
export const digits = (phone: string) => phone.replace(/\D/g, "");

/**
 * A Brazilian phone as WhatsApp dials it (55, area code, number), or null
 * when it is too short to be one: "(19) 99448-7967" becomes "5519994487967".
 */
export function waNumber(phone: string) {
  const n = digits(phone).replace(/^0+/, "");
  if (n.length === 10 || n.length === 11) return `55${n}`;
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return n;
  return null;
}

/** A phone on a record, with a way to the WhatsApp chat when the clinic can reach out (never in the demo). */
export function Phone({ phone }: { phone: string }) {
  const { access } = useFlow();
  const number = access.canReachOut ? waNumber(phone) : null;
  if (!phone) return <>—</>;
  return (
    <>
      {phone}
      {number ? (
        <>
          {" · "}
          <a href={whatsappHref(number)} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </>
      ) : null}
    </>
  );
}

/** Something shown that is not built yet. Small and plain, so it never reads as an error. */
export function Soon({ children = "Em breve" }: { children?: ReactNode }) {
  return <span className={styles.soon}>{children}</span>;
}

/**
 * How the subscription is paid: the card, charged every month on its own.
 * Pix and boleto are not offered because neither charges by itself each month.
 */
export function PaymentMethod() {
  return (
    <section className={styles.method} aria-labelledby="forma-de-pagamento">
      <h3 id="forma-de-pagamento" className={styles.label}>
        Forma de pagamento
      </h3>
      <div className={styles.methodOption}>
        <p className={styles.methodName}>
          Cartão de crédito <span className={styles.methodBadge}>Recomendado</span>
        </p>
        <p className={styles.methodNote}>Cobrança automática de R$ 297/mês.</p>
      </div>
      <p className={styles.fine}>Pix e boleto não fazem a cobrança automática de cada mês; por isso a assinatura é no cartão.</p>
    </section>
  );
}

const APPROVAL = ["Pulse identifica", "Recomenda", "Prepara", "Você aprova"] as const;

/** Where an action stands (0 to 3; 4 when it is all done). The Pulse identifies, recommends and prepares; sending always waits for a person. */
export function Approval({ step }: { step: number }) {
  return (
    <ol className={styles.stages} aria-label="Etapas da ação">
      {APPROVAL.map((label, i) => (
        <li
          key={label}
          data-state={i < step ? "done" : i === step ? "now" : undefined}
          aria-current={i === step ? "step" : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

/**
 * A message the Pulse wrote for one person. It can be read and adjusted
 * here; sending is a person's call, from the clinic's own WhatsApp: the
 * button opens it with the number and the text already filled in. Nothing is
 * sent by the Pulse itself, and in the demo the button stays off (its phone
 * numbers are made up).
 */
export function Prepared({
  text,
  phone,
  inList,
  children,
}: {
  text: string;
  phone?: string;
  /** One of several in a list that says how sending works once (SendNote): only this person's own problem is said here. */
  inList?: boolean;
  children?: ReactNode;
}) {
  const { access } = useFlow();
  const [message, setMessage] = useState(text);
  const field = useId();
  const number = waNumber(phone ?? "");
  const open = access.canReachOut && number;
  const general = useSendNote();
  const note =
    !access.isDemoMode && !number
      ? "Sem telefone com DDD na ficha: cadastre o número para enviar pelo WhatsApp."
      : inList
        ? null
        : general;

  return (
    <div className={styles.prepared}>
      <label className="sr-only" htmlFor={field}>
        Mensagem
      </label>
      <textarea
        id={field}
        className={styles.preparedText}
        value={message}
        rows={3}
        maxLength={1000}
        onChange={(event) => setMessage(event.target.value)}
      />
      <div className={styles.actions}>
        {open ? (
          <a className={styles.primary} href={whatsappHref(open, message.trim())} target="_blank" rel="noopener noreferrer">
            Abrir no WhatsApp
          </a>
        ) : (
          <button type="button" className={styles.secondary} disabled>
            Abrir no WhatsApp
          </button>
        )}
        {children}
      </div>
      {note ? <p className={styles.fine}>{note}</p> : null}
    </div>
  );
}

/** How sending works here, in a sentence: the demo sends nothing; a clinic sends from its own WhatsApp. */
function useSendNote() {
  const { access } = useFlow();
  if (access.isDemoMode) {
    return "Na demo, nada é enviado. No Pulse da clínica, o botão abre o WhatsApp com o número e a mensagem prontos.";
  }
  if (!access.canReachOut) return READ_ONLY_MESSAGE;
  return "O botão abre o WhatsApp da clínica com o número e a mensagem prontos: você revisa e envia. Envio automático: em breve.";
}

/** The sentence above a list of prepared messages. */
export function SendNote() {
  return <p className={styles.fine}>{useSendNote()}</p>;
}

/** Ends the session here and goes back to the sign-in. */
export function SignOut({ className }: { className?: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      type="button"
      className={className ?? styles.quiet}
      disabled={leaving}
      onClick={async () => {
        setLeaving(true);
        await createClient().auth.signOut();
        router.replace("/pulse/entrar");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
