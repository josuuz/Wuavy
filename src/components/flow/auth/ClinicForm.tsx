"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { createClinic } from "@/app/(app)/pulse/comecar/actions";
import { LOGO_MAX, LOGO_TYPES, SEGMENTS, TEAM_SIZES } from "@/lib/flow/types";
import { SEGMENT_LABEL, TEAM_LABEL, WEEK } from "../demo/copy";
import { Field, FormError } from "../demo/forms";
import ui from "../demo/ui.module.css";
import styles from "./AuthFrame.module.css";

/*
  Onboarding, after the first payment: three short steps, not a long form.
  One <form> holds them all (each step's fields only hidden while it isn't
  shown), so the server receives everything at the end and creates the
  clinic in one go. "Continuar" checks the step's own fields first.
*/

const STEPS = [
  { short: "Clínica", title: "Vamos configurar seu Pulse", lead: "Três passos curtos. Dá para mudar tudo depois." },
  { short: "Operação", title: "Sobre sua operação", lead: "Para o Pulse falar a língua da sua clínica." },
  { short: "Personalização", title: "Personalização", lead: "O jeito da sua clínica. O logo é opcional; o resto já vem preenchido." },
];


/** `name`: the person's, from their account, so nothing asked at sign-up is asked again. */
export function ClinicForm({ name = "" }: { name?: string }) {
  const [state, action, pending] = useActionState(createClinic, null);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // How the person works: only shapes the onboarding (the team size it saves, the last screen). Nothing else depends on it.
  const [mode, setMode] = useState<"solo" | "team" | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const steps = useRef<(HTMLFieldSetElement | null)[]>([]);

  if (state?.done) return <Ready team={mode === "team"} />;

  const forward = () => {
    // The browser's own checks, for this step's fields only.
    const fields = [...(steps.current[step]?.querySelectorAll<HTMLInputElement>("input") ?? [])];
    if (fields.every((field) => field.reportValidity())) {
      setProblem(null);
      setStep(step + 1);
    }
  };

  // Enter moves to the next step instead of sending a form that isn't finished.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && step < STEPS.length - 1 && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      forward();
    }
  };

  const onLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setProblem(null);
    if (!file) return setPreview(null);
    if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX) {
      event.target.value = "";
      setPreview(null);
      return setProblem("O logo precisa ser PNG, JPG ou WebP de até 800 KB.");
    }
    setPreview(URL.createObjectURL(file));
  };

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <>
      <header className={ui.head}>
        <ol className={ui.stages} aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s.short} data-state={i < step ? "done" : i === step ? "now" : undefined} aria-current={i === step ? "step" : undefined}>
              {i + 1}. {s.short}
            </li>
          ))}
        </ol>
        <h1 className={ui.title}>{current.title}</h1>
        <p className={ui.lead}>{current.lead}</p>
      </header>

      <form ref={form} className={ui.form} action={action} onKeyDown={onKeyDown}>
        <fieldset
          className={styles.step}
          hidden={step !== 0}
          ref={(el) => {
            steps.current[0] = el;
          }}
        >
          <legend className="sr-only">Clínica</legend>
          <Field label="Nome da clínica">
            <input className={ui.input} name="clinic" required maxLength={120} autoComplete="organization" />
          </Field>
          <Field label="Nome do responsável">
            <input className={ui.input} name="name" required maxLength={120} autoComplete="name" defaultValue={name} />
          </Field>
          <Field label="WhatsApp da clínica">
            <input
              className={ui.input}
              name="whatsapp"
              type="tel"
              required
              inputMode="tel"
              pattern="[0-9\s()+\-]{10,}"
              title="O número com DDD"
              placeholder="(11) 91234-5678"
              autoComplete="tel"
            />
          </Field>
        </fieldset>

        <fieldset
          className={styles.step}
          hidden={step !== 1}
          ref={(el) => {
            steps.current[1] = el;
          }}
        >
          <legend className="sr-only">Operação</legend>
          <div className={styles.group} role="radiogroup" aria-labelledby="tipo">
            <p id="tipo" className={ui.label}>
              Tipo de clínica
            </p>
            <div className={styles.choices}>
              {SEGMENTS.map((segment) => (
                <label key={segment} className={styles.choice}>
                  <input type="radio" name="segment" value={segment} defaultChecked={segment === "estetica"} />
                  <span>{SEGMENT_LABEL[segment]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className={styles.group} role="radiogroup" aria-labelledby="trabalho">
            <p id="trabalho" className={ui.label}>
              Como você trabalha hoje?
            </p>
            <div className={styles.choices}>
              <label className={styles.choice}>
                <input type="radio" name="mode" value="solo" required checked={mode === "solo"} onChange={() => setMode("solo")} />
                <span>Trabalho sozinho</span>
              </label>
              <label className={styles.choice}>
                <input type="radio" name="mode" value="team" required checked={mode === "team"} onChange={() => setMode("team")} />
                <span>Tenho uma equipe</span>
              </label>
            </div>
          </div>
          {/* The answer is the clinic's team size (team_size): alone is "1"; a team says roughly how many attend. */}
          {mode === "team" ? (
            <div className={styles.group} role="radiogroup" aria-labelledby="equipe">
              <p id="equipe" className={ui.label}>
                Quantos profissionais atendem?
              </p>
              <div className={styles.choices}>
                {TEAM_SIZES.filter((size) => size !== "1").map((size) => (
                  <label key={size} className={styles.choice}>
                    <input type="radio" name="team" value={size} defaultChecked={size === "2-3"} />
                    <span>{TEAM_LABEL[size]}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <input type="hidden" name="team" value="1" />
          )}
        </fieldset>

        <fieldset
          className={styles.step}
          hidden={step !== 2}
          ref={(el) => {
            steps.current[2] = el;
          }}
        >
          <legend className="sr-only">Personalização</legend>
          <label className={styles.logo}>
            <span className={styles.logoMark}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob URL), never optimized */}
              {preview ? <img src={preview} alt="" /> : <span aria-hidden="true">Logo</span>}
            </span>
            <span className={styles.logoText}>
              <strong>{preview ? "Trocar o logo" : "Logo da clínica"}</strong>
              <span>Opcional · PNG, JPG ou WebP até 800 KB</span>
            </span>
            <input className="sr-only" type="file" name="logo" accept={LOGO_TYPES.join(",")} onChange={onLogo} />
          </label>
          <div className={ui.twoFields}>
            <Field label="Abre às">
              <input className={ui.input} type="time" name="opens" required defaultValue="08:00" />
            </Field>
            <Field label="Fecha às">
              <input className={ui.input} type="time" name="closes" required defaultValue="19:00" />
            </Field>
          </div>
          <div className={styles.group} role="group" aria-labelledby="dias">
            <p id="dias" className={ui.label}>
              Dias de atendimento
            </p>
            <div className={styles.choices}>
              {WEEK.map(([day, label]) => (
                <label key={day} className={styles.choice}>
                  <input type="checkbox" name="days" value={day} defaultChecked={day >= 1 && day <= 6} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <FormError error={problem ?? state?.error ?? null} />
        <div className={ui.actions}>
          {/* Distinct keys: the click that moves to the last step must not land on a submit button reusing its element. */}
          {last ? (
            <button
              key="submit"
              type="submit"
              className={ui.primary}
              disabled={pending}
              onClick={(event) => {
                if (!form.current?.querySelector('input[name="days"]:checked')) {
                  event.preventDefault();
                  setProblem("Escolha ao menos um dia de atendimento.");
                }
              }}
            >
              {pending ? "Criando sua clínica…" : "Concluir"}
            </button>
          ) : (
            <button key="next" type="button" className={ui.primary} onClick={forward}>
              Continuar
            </button>
          )}
          {step > 0 ? (
            <button type="button" className={ui.quiet} onClick={() => setStep(step - 1)} disabled={pending}>
              Voltar
            </button>
          ) : null}
        </div>
      </form>
    </>
  );
}

/** The end of onboarding: one sentence and the way in. With a team, the offer to add it now (never required). */
function Ready({ team }: { team: boolean }) {
  return (
    <section className={styles.ready} aria-labelledby="pronto">
      <span className={styles.signal} data-size="small" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <h1 id="pronto" className={ui.title}>
        Seu Pulse está pronto.
      </h1>
      {team ? (
        <>
          <p className={ui.lead}>
            A clínica foi criada. Quer adicionar sua equipe agora? Cada pessoa entra com o próprio e-mail e senha.
          </p>
          <div className={ui.actions}>
            <Link href="/pulse/app/configuracoes#equipe" className={ui.primary}>
              Adicionar equipe
            </Link>
            <Link href="/pulse/app" className={ui.quiet}>
              Fazer isso depois
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={ui.lead}>
            A clínica foi criada. No primeiro acesso, o Pulse mostra o que preparar para começar a encontrar oportunidades.
          </p>
          <Link href="/pulse/app" className={ui.primary}>
            Entrar no Pulse
          </Link>
        </>
      )}
    </section>
  );
}
