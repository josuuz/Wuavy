"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import type { Result } from "@/lib/flow/actions";
import styles from "./ui.module.css";

/*
  The real Flow's editing pieces. A write is a Server Action: pending while it
  and the refresh it triggers run, its error kept next to the form, the sheet
  closed only when the database said yes.
*/

export function useWrite() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const write = (action: () => Promise<Result>, onDone?: () => void) =>
    start(async () => {
      const result = await action();
      setError(result.error ?? null);
      if (!result.error) onDone?.();
    });

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
  const [asking, setAsking] = useState(false);
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
