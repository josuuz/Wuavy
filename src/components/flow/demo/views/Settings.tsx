"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { authMessage } from "@/components/flow/auth/messages";
import auth from "@/components/flow/auth/AuthFrame.module.css";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE } from "@/lib/flow/access";
import { updateAccount, updateClinic } from "@/lib/flow/actions";
import { brl } from "@/lib/flow/format";
import { LOGO_MAX, LOGO_TYPES, SEGMENTS, TEAM_SIZES } from "@/lib/flow/types";
import { createClient } from "@/lib/supabase/client";
import { PLAN, SEGMENT_LABEL, TEAM_LABEL, WEEK } from "../copy";
import { Field, FormError, Intro, SignOut, Soon, useWrite } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Configurações, and only what a clinic needs: its profile (the same fields
  as onboarding), the person's own name and password, the plan, privacy, and
  the way out. The server checks who may change what (lib/flow/actions.ts,
  migration 0004); the demo has no settings.
*/

const DEFAULT_HOURS = { opens: "08:00", closes: "19:00", days: [1, 2, 3, 4, 5, 6] };

/** A form's "Salvo." that stays until the next change. */
function useSaved() {
  const [saved, setSaved] = useState(false);
  return { saved, done: () => setSaved(true), touched: () => setSaved(false) };
}

export function Settings() {
  const { live } = useFlow();
  if (!live) {
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>Configurações</h1>
        </header>
        <Intro title="Na demo">As configurações ficam no Pulse da clínica: dados, usuário, plano e privacidade.</Intro>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Configurações</h1>
        <p className={styles.lead}>Os dados da clínica, a sua conta e o plano.</p>
      </header>
      <div className={styles.settings}>
        <ClinicSettings />
        <AccountSettings />
        <PlanSettings />
        <PrivacySettings />
      </div>
    </div>
  );
}

function ClinicSettings() {
  const { data, account, access } = useFlow();
  const { pending, error, submit } = useWrite();
  const { saved, done, touched } = useSaved();
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const org = data.organization;
  const hours = org.hours ?? DEFAULT_HOURS;
  const owner = account?.role === "owner";
  const locked = !owner || !access.canEdit;

  const onLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setProblem(null);
    touched();
    if (!file) return setPreview(null);
    if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX) {
      event.target.value = "";
      setPreview(null);
      return setProblem("O logo precisa ser PNG, JPG ou WebP de até 800 KB.");
    }
    setPreview(URL.createObjectURL(file));
  };

  return (
    <section className={`${styles.panel} ${styles.settingsWide}`} aria-labelledby="dados-clinica">
      <h2 id="dados-clinica" className={styles.label}>
        Dados da clínica
      </h2>
      {!owner ? <p className={styles.fine}>Só o responsável pela clínica muda estes dados.</p> : null}
      <form className={styles.form} onSubmit={submit(updateClinic, done)} onChange={touched}>
        <fieldset className={styles.fieldset} disabled={locked}>
          <legend className="sr-only">Dados da clínica</legend>
          <label className={auth.logo}>
            <span className={auth.logoMark}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview (blob URL), never optimized
                <img src={preview} alt="" />
              ) : org.logoUrl ? (
                <Image src={org.logoUrl} alt="" width={56} height={56} unoptimized />
              ) : (
                <span aria-hidden="true">Logo</span>
              )}
            </span>
            <span className={auth.logoText}>
              <strong>{preview || org.logoUrl ? "Trocar o logo" : "Logo da clínica"}</strong>
              <span>Opcional · PNG, JPG ou WebP até 800 KB</span>
            </span>
            <input className="sr-only" type="file" name="logo" accept={LOGO_TYPES.join(",")} onChange={onLogo} />
          </label>
          <div className={styles.twoFields}>
            <Field label="Nome da clínica">
              <input className={styles.input} name="clinic" required maxLength={120} defaultValue={org.name} autoComplete="organization" />
            </Field>
            <Field label="WhatsApp da clínica">
              <input
                className={styles.input}
                name="whatsapp"
                type="tel"
                required
                inputMode="tel"
                pattern="[0-9\s()+\-]{10,}"
                title="O número com DDD"
                defaultValue={org.whatsapp}
                autoComplete="tel"
              />
            </Field>
          </div>
          <div className={styles.twoFields}>
            <Field label="Tipo de clínica">
              <select className={styles.input} name="segment" defaultValue={org.segment}>
                {SEGMENTS.map((segment) => (
                  <option key={segment} value={segment}>
                    {SEGMENT_LABEL[segment]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Profissionais que atendem">
              <select className={styles.input} name="team" defaultValue={org.teamSize ?? "2-3"}>
                {TEAM_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {TEAM_LABEL[size]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className={styles.twoFields}>
            <Field label="Abre às">
              <input className={styles.input} type="time" name="opens" required defaultValue={hours.opens} />
            </Field>
            <Field label="Fecha às">
              <input className={styles.input} type="time" name="closes" required defaultValue={hours.closes} />
            </Field>
          </div>
          <div className={auth.group} role="group" aria-labelledby="dias-atendimento">
            <p id="dias-atendimento" className={styles.label}>
              Dias de atendimento
            </p>
            <div className={auth.choices}>
              {WEEK.map(([day, label]) => (
                <label key={day} className={auth.choice}>
                  <input type="checkbox" name="days" value={day} defaultChecked={hours.days.includes(day)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <p className={styles.fine}>Os horários e os dias definem a grade da agenda e os horários vagos que o Pulse procura.</p>
        </fieldset>
        <FormError error={problem ?? error} />
        {saved ? (
          <p className={styles.done} role="status">
            Dados da clínica salvos.
          </p>
        ) : null}
        {locked ? null : (
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

function AccountSettings() {
  const { account, access } = useFlow();
  const { pending, error, submit } = useWrite();
  const { saved, done, touched } = useSaved();
  const [password, setPassword] = useState<{ pending: boolean; error: string | null; saved: boolean }>({
    pending: false,
    error: null,
    saved: false,
  });

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const next = String(new FormData(form).get("password") ?? "");
    if (next.length < 6) return setPassword({ pending: false, error: "A senha precisa ter pelo menos 6 caracteres.", saved: false });
    setPassword({ pending: true, error: null, saved: false });
    const { error: failed } = await createClient().auth.updateUser({ password: next });
    setPassword({ pending: false, error: failed ? authMessage(failed, "Não foi possível trocar a senha. Tente de novo.") : null, saved: !failed });
    if (!failed) form.reset();
  };

  return (
    <section className={styles.panel} aria-labelledby="usuario">
      <h2 id="usuario" className={styles.label}>
        Usuário
      </h2>
      <form className={styles.form} onSubmit={submit(updateAccount, done)} onChange={touched}>
        <Field label="Seu nome">
          <input className={styles.input} name="name" required maxLength={120} defaultValue={account?.name} autoComplete="name" disabled={!access.canEdit} />
        </Field>
        <div className={styles.settingsRow}>
          <span className={styles.label}>E-mail</span>
          <span>{account?.email || "—"}</span>
        </div>
        <FormError error={error} />
        {saved ? (
          <p className={styles.done} role="status">
            Nome salvo.
          </p>
        ) : null}
        {access.canEdit ? (
          <div className={styles.actions}>
            <button type="submit" className={styles.secondary} disabled={pending}>
              Salvar nome
            </button>
          </div>
        ) : null}
      </form>
      <form className={styles.form} onSubmit={changePassword}>
        <Field label="Nova senha">
          <input className={styles.input} name="password" type="password" required minLength={6} autoComplete="new-password" />
        </Field>
        <FormError error={password.error} />
        {password.saved ? (
          <p className={styles.done} role="status">
            Senha trocada.
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="submit" className={styles.secondary} disabled={password.pending}>
            Trocar senha
          </button>
          <SignOut className={styles.quiet} />
        </div>
      </form>
    </section>
  );
}

function PlanSettings() {
  const { access } = useFlow();
  const status = access.subscriptionStatus;
  const notice = status && status !== "active" ? PLAN.notice[status] : null;
  return (
    <section className={styles.panel} aria-labelledby="plano">
      <h2 id="plano" className={styles.label}>
        Plano
      </h2>
      <div className={styles.settingsRow}>
        <strong>Wuavy Pulse</strong>
        <span>{brl(PRICE)}/mês</span>
      </div>
      <p>
        <span className={styles.status} data-status={status === "active" || !status ? undefined : "em_andamento"}>
          {status ? PLAN.chip[status] : PLAN.chip.active}
        </span>
      </p>
      {notice ? <p className={styles.fine}>{notice.text}</p> : null}
      <ul className={styles.soonList} aria-label="Em breve no plano">
        {PLAN.subscribe.coming.map((item) => (
          <li key={item}>
            <Soon />
            {item}
          </li>
        ))}
      </ul>
      <a
        href={contactHref(site.contact.primary, PLAN.subscribe.topic)}
        className={styles.textAction}
        target="_blank"
        rel="noopener noreferrer"
      >
        Trocar o cartão, mudar ou cancelar o plano: fale com a Wuavy <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}

function PrivacySettings() {
  return (
    <section className={styles.panel} aria-labelledby="privacidade">
      <h2 id="privacidade" className={styles.label}>
        Privacidade e dados
      </h2>
      <p className={styles.fine}>
        Os dados da clínica e dos pacientes são da clínica. O Pulse guarda só o necessário para a operação: nada de prontuário ou
        dado clínico.
      </p>
      <ul className={styles.rows}>
        <li>
          <Link href="/privacidade" className={styles.textAction}>
            Política de Privacidade
          </Link>
        </li>
        <li>
          <Link href="/termos" className={styles.textAction}>
            Termos de Uso
          </Link>
        </li>
        <li>
          <span>Exportar os dados da clínica</span>
          <Soon />
        </li>
        <li>
          <span>Excluir a conta e os dados</span>
          <a
            href={contactHref(site.contact.primary, "excluir a conta do Wuavy Pulse")}
            className={styles.textAction}
            target="_blank"
            rel="noopener noreferrer"
          >
            Pedir à Wuavy
          </a>
        </li>
      </ul>
    </section>
  );
}
