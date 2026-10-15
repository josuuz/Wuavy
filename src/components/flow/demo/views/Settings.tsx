"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition, type ChangeEvent, type FormEvent } from "react";

import { authMessage } from "@/components/flow/auth/messages";
import auth from "@/components/flow/auth/AuthFrame.module.css";
import { CardBrick } from "@/components/flow/auth/CardBrick";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE } from "@/lib/flow/access";
import { updateAccount, updateClinic } from "@/lib/flow/actions";
import { brl, fullDate } from "@/lib/flow/format";
import { cancelPlan, cardForm, replaceCard, type CardForm, type SubscriptionResult } from "@/lib/flow/subscription-actions";
import { LOGO_MAX, LOGO_TYPES, SEGMENTS, TEAM_SIZES } from "@/lib/flow/types";
import { createClient } from "@/lib/supabase/client";
import { GUIDE, PLAN, SEGMENT_LABEL, TEAM_LABEL, WEEK } from "../copy";
import { Field, FormError, Intro, SignOut, Soon, useWrite } from "../forms";
import { clinicChecklist, useGuide, type ClinicField } from "../Guide";
import { useFlow } from "../store";
import styles from "../ui.module.css";
import { TeamSettings } from "./Team";
import { WhatsAppSettings } from "./WhatsAppSettings";

/*
  Configurações, and only what a clinic needs: its profile (the same fields
  as onboarding), the team and the WhatsApp channel (the owner's), the person's own name and password,
  the plan, privacy, and the way out. The server checks who may change what
  (lib/flow/actions.ts, lib/flow/team.ts, migrations 0004 and 0009); the demo
  has no settings.
*/

const DEFAULT_HOURS = { opens: "08:00", closes: "19:00", days: [1, 2, 3, 4, 5, 6] };

/** A palavra que o segundo passo do cancelamento manda; o servidor exige exatamente esta. */
const CANCEL_WORD = "CANCELAR";

/** A form's "Salvo." that stays until the next change. */
function useSaved() {
  const [saved, setSaved] = useState(false);
  return { saved, done: () => setSaved(true), touched: () => setSaved(false) };
}

export function Settings() {
  const { live, can } = useFlow();
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
        <p className={styles.lead}>{can.admin ? "Os dados da clínica, a equipe, a sua conta e o plano." : "A sua conta e os dados da clínica."}</p>
      </header>
      <div className={styles.settings}>
        <ClinicSettings />
        <TeamSettings />
        {can.admin ? <WhatsAppSettings /> : null}
        <AccountSettings />
        {can.admin ? <PlanSettings /> : null}
        <PrivacySettings />
        <InstallSettings />
        {can.admin ? <HelpSettings /> : null}
      </div>
    </div>
  );
}

function ClinicSettings() {
  const { data, access, can } = useFlow();
  const { pending, error, submit } = useWrite();
  const { saved, done, touched } = useSaved();
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const org = data.organization;
  const hours = org.hours ?? DEFAULT_HOURS;
  const owner = can.admin;
  const locked = !owner || !access.canEdit;
  const guide = useGuide();
  const guided = guide.active && !guide.saved.minimized && guide.current?.id === "clinica";
  // The Pulse's guide points at each field the first step asks for: still empty, or already done.
  const checklist = clinicChecklist(org);
  const mark = (key: ClinicField) =>
    guided ? (checklist.find((f) => f.key === key)?.filled ? "ok" : "todo") : undefined;

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
    <section
      className={`${styles.panel} ${styles.settingsWide}`}
      aria-labelledby="dados-clinica"
      data-guide={guided ? "" : undefined}
    >
      <h2 id="dados-clinica" className={styles.label}>
        Dados da clínica
      </h2>
      {!owner ? <p className={styles.fine}>Só o responsável pela clínica muda estes dados.</p> : null}
      <form className={styles.form} onSubmit={submit(updateClinic, done)} onChange={touched}>
        <fieldset className={styles.fieldset} disabled={locked}>
          <legend className="sr-only">Dados da clínica</legend>
          <label className={auth.logo} data-guide-field={mark("logo")}>
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
            <Field label="Nome da clínica" guide={mark("name")}>
              <input className={styles.input} name="clinic" required maxLength={120} defaultValue={org.name} autoComplete="organization" />
            </Field>
            <Field label="WhatsApp da clínica" guide={mark("whatsapp")}>
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
          <Field label="Endereço" guide={mark("address")}>
            <input
              className={styles.input}
              name="address"
              maxLength={200}
              defaultValue={org.address}
              placeholder="Rua, número, bairro e cidade"
              autoComplete="street-address"
            />
          </Field>
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
            <Field label="Abre às" guide={mark("hours")}>
              <input className={styles.input} type="time" name="opens" required defaultValue={hours.opens} />
            </Field>
            <Field label="Fecha às" guide={mark("hours")}>
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

/*
  O plano da clínica: onde a assinatura está, quanto custa, quando é a próxima
  cobrança, e — para o responsável — trocar o cartão e cancelar.

  Nada aqui decide nada. Cada ação devolve o estado lido de volta do Mercado
  Pago (lib/flow/subscription-actions.ts) e a tela repete o que ele disse; uma
  falha diz que nada mudou, em vez de fingir que mudou. O servidor confere
  outra vez quem está pedindo: o painel só aparece para o responsável, e para
  qualquer outra pessoa a ação é recusada de todo modo.
*/
function PlanSettings() {
  const { access, account } = useFlow();
  const status = access.subscriptionStatus;
  const notice = status && status !== "active" ? PLAN.notice[status] : null;
  // Esta seção já só é montada sob `can.admin` (hoje, só o responsável). O
  // papel é conferido de novo aqui e uma terceira vez no servidor: se a tabela
  // de permissões mudar um dia, trocar o cartão e cancelar não vão junto.
  const owner = account?.role === "owner";
  const next = fullDate(access.nextCharge);
  const paidUntil = fullDate(access.paidUntil);
  // Uma clínica de antes das assinaturas (sem linha) e uma já cancelada não têm o que gerenciar.
  const manageable = owner && status !== null && status !== "cancelled";

  return (
    <section className={styles.panel} aria-labelledby="plano">
      <h2 id="plano" className={styles.label}>
        Plano
      </h2>
      <div className={styles.settingsRow}>
        <strong>Wuavy Pulse</strong>
        <span>
          {brl(PRICE)}
          {PLAN.manage.per}
        </span>
      </div>
      <p>
        <span className={styles.status} data-status={status === "active" || !status ? undefined : "em_andamento"}>
          {status ? PLAN.chip[status] : PLAN.chip.active}
        </span>
      </p>
      {next ? (
        <div className={styles.settingsRow}>
          <span>{PLAN.manage.next}</span>
          <span>{next}</span>
        </div>
      ) : null}
      {paidUntil ? <p className={styles.fine}>O Pulse funciona normalmente até {paidUntil}, o fim do mês já pago.</p> : null}
      {notice ? <p className={styles.fine}>{notice.text}</p> : null}
      <ul className={styles.soonList} aria-label="Em breve no plano">
        {PLAN.subscribe.coming.map((item) => (
          <li key={item}>
            <Soon />
            {item}
          </li>
        ))}
      </ul>
      {manageable ? <ManagePlan /> : null}
      <a
        href={contactHref(site.contact.primary, PLAN.subscribe.topic)}
        className={styles.textAction}
        target="_blank"
        rel="noopener noreferrer"
      >
        Outra dúvida sobre o plano: fale com a Wuavy <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}

/**
 * Trocar o cartão e cancelar, um de cada vez. Não usa `useWrite`: ele barra
 * quem está só para consulta, e é exatamente quem mais precisa chegar aqui —
 * uma assinatura em atraso que quer trocar o cartão.
 */
function ManagePlan() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "card" | "cancel">("none");

  const run = (action: () => Promise<SubscriptionResult>, ok: string) => {
    setError(null);
    setDone(null);
    start(async () => {
      const result = await action().catch((): SubscriptionResult => ({ state: "failed", error: PLAN.manage.card.off }));
      /*
        Só um `done` do servidor — que vem do estado lido de volta do Mercado
        Pago — vira a frase de sucesso. `unconfirmed` fecha o painel do mesmo
        jeito, porque a mudança já foi aceita lá e reabrir o formulário
        convidaria a mandar outro cartão por cima; só o que a tela diz é outro.
        Qualquer outra coisa é o erro do servidor.
      */
      if (result.state === "failed") {
        setError(result.error);
        return;
      }
      setDone(result.state === "unconfirmed" ? PLAN.manage.card.unconfirmed : ok);
      setPanel("none");
    });
  };

  return (
    <div className={styles.planManage}>
      {panel === "card" ? (
        <NewCard
          pending={pending}
          onClose={() => setPanel("none")}
          onToken={(token) => run(() => replaceCard({ token }), PLAN.manage.card.done)}
        />
      ) : panel === "cancel" ? (
        <div className={styles.planConfirm} role="group" aria-labelledby="cancelar-assinatura">
          <p id="cancelar-assinatura" className={styles.label}>
            {PLAN.manage.cancel.ask}
          </p>
          <ul className={styles.fine}>
            {PLAN.manage.cancel.what.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={pending}
              onClick={() => run(() => cancelPlan({ confirm: CANCEL_WORD }), PLAN.manage.cancel.done)}
            >
              {pending ? "Cancelando…" : PLAN.manage.cancel.confirm}
            </button>
            <button type="button" className={styles.quiet} disabled={pending} onClick={() => setPanel("none")}>
              {PLAN.manage.cancel.keep}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} disabled={pending} onClick={() => setPanel("card")}>
            {PLAN.manage.card.open}
          </button>
          <button type="button" className={styles.quiet} disabled={pending} onClick={() => setPanel("cancel")}>
            {PLAN.manage.cancel.open}
          </button>
        </div>
      )}
      <FormError error={error} />
      {done ? (
        <p className={styles.done} role="status">
          {done}
        </p>
      ) : null}
    </div>
  );
}

/**
 * O formulário do cartão novo, que é o do Mercado Pago. O que o servidor
 * precisa dizer para ele existir (a chave pública, o pagador, se é ambiente de
 * teste) é pedido só agora, quando o responsável abre — não vai em cada página.
 */
function NewCard({ pending, onToken, onClose }: { pending: boolean; onToken: (token: string) => void; onClose: () => void }) {
  const [form, setForm] = useState<CardForm | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    cardForm()
      .then((answer) => {
        if (alive) setForm(answer);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed || (form && !form.ready)) {
    return (
      <div className={styles.planConfirm}>
        <p className={styles.fine}>{PLAN.manage.card.off}</p>
        <button type="button" className={styles.quiet} onClick={onClose}>
          {PLAN.manage.card.close}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.planConfirm} aria-busy={!ready || pending}>
      <p className={styles.label}>{PLAN.manage.card.title}</p>
      {!form || !ready ? (
        <p className={styles.fine}>
          <span className="pulse-dot" aria-hidden="true" />
          {PLAN.manage.card.loading}
        </p>
      ) : null}
      {form ? (
        <div hidden={pending}>
          <CardBrick
            id="pulse-new-card-brick"
            publicKey={form.publicKey}
            email={form.email}
            amount={form.amount}
            submitLabel={PLAN.manage.card.submit}
            onToken={async (token) => onToken(token)}
            onReady={() => setReady(true)}
            onFail={() => setFailed(true)}
          />
        </div>
      ) : null}
      <p className={styles.fine}>
        {PLAN.manage.card.safe}
        {form?.test ? ` ${PLAN.manage.card.test}` : ""}
      </p>
      <button type="button" className={styles.quiet} disabled={pending} onClick={onClose}>
        {PLAN.manage.card.close}
      </button>
    </div>
  );
}

function PrivacySettings() {
  return (
    <section className={styles.panel} aria-labelledby="privacidade">
      <h2 id="privacidade" className={styles.label}>
        Privacidade e dados
      </h2>
      <p className={styles.fine}>
        Os dados da clínica e dos pacientes são da clínica. O prontuário, quando usado, só é visto pelo responsável e pelos
        profissionais: nunca pela recepção.
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

/*
  How to put the Pulse on the phone's home screen. Only shown in a browser:
  inside the installed app there is nothing left to do. iOS has no install
  prompt a site may call, so both paths are written out as steps.
*/
const steady = () => () => {};

function installedAlready() {
  return window.matchMedia("(display-mode: standalone)").matches || "standalone" in navigator;
}

function InstallSettings() {
  // Reads the browser once, like ThemeToggle: nothing here changes while the screen is open.
  const how = useSyncExternalStore(
    steady,
    () => (installedAlready() ? null : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "android"),
    () => null,
  );

  if (!how) return null;

  return (
    <section className={styles.panel} aria-labelledby="instalar">
      <h2 id="instalar" className={styles.label}>
        Instalar no celular
      </h2>
      <p className={styles.fine}>
        {how === "ios"
          ? "No iPhone: toque em Compartilhar, na barra do Safari, e escolha “Adicionar à Tela de Início”."
          : "No Android: abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”."}{" "}
        O Pulse passa a abrir como aplicativo, em tela cheia, sem a barra do navegador.
      </p>
    </section>
  );
}

/** The first-run guide, again: the Pulse walks the first steps from the start. */
function HelpSettings() {
  const { restart } = useGuide();
  return (
    <section className={styles.panel} aria-labelledby="ajuda">
      <h2 id="ajuda" className={styles.label}>
        {GUIDE.restart.title}
      </h2>
      <p className={styles.fine}>{GUIDE.restart.text}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={restart}>
          {GUIDE.restart.cta}
        </button>
      </div>
    </section>
  );
}
