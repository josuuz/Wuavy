"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { READ_ONLY_MESSAGE } from "@/lib/flow/access";
import type { Result } from "@/lib/flow/actions";
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
