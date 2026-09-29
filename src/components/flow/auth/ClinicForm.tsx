"use client";

import { useActionState } from "react";

import { createClinic } from "@/app/(app)/flow/comecar/actions";
import { Field, FormError } from "../demo/forms";
import ui from "../demo/ui.module.css";

export function ClinicForm() {
  const [state, action, pending] = useActionState(createClinic, null);
  return (
    <form className={ui.form} action={action}>
      <Field label="Nome da clínica">
        <input className={ui.input} name="clinic" required maxLength={120} autoComplete="organization" />
      </Field>
      <Field label="Cidade">
        <input className={ui.input} name="city" maxLength={80} autoComplete="address-level2" />
      </Field>
      <Field label="Seu nome">
        <input className={ui.input} name="name" required maxLength={120} autoComplete="name" />
      </Field>
      <FormError error={state?.error ?? null} />
      <div className={ui.actions}>
        <button type="submit" className={ui.primary} disabled={pending}>
          Criar clínica
        </button>
      </div>
    </form>
  );
}
