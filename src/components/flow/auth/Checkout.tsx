"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { check, subscribe, type CheckoutOutcome, type Subscribed } from "@/app/(app)/pulse/assinar/actions";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE } from "@/lib/flow/access";
import { brl } from "@/lib/flow/format";
import { PLAN } from "../demo/copy";
import { PaymentMethod, Soon } from "../demo/forms";
import ui from "../demo/ui.module.css";
import styles from "./AuthFrame.module.css";

/*
  The checkout, hosted by Mercado Pago. Submitting takes no card: subscribe()
  (a Server Action) creates or resumes the subscription and redirects the
  browser straight to Mercado Pago's own init_point. The card is typed there,
  never here. While a "pending" row waits on a webhook, or on someone who
  started the hosted form and never finished it, the page polls check() and
  also offers the same submit again — subscribe() resumes that exact
  checkout instead of creating a second one.
*/

type Stage = CheckoutOutcome | "form";

/** While "pending", how often the page asks again on its own. */
const POLL_MS = 8000;

interface CheckoutProps {
  stage: Stage;
  email: string;
  /** A clinic subscribing again goes back to the Pulse, not to onboarding. */
  hasClinic: boolean;
  /** Mercado Pago is configured on the server. Without it, only the offline path shows. */
  ready: boolean;
  /** Test credentials in use: say so, and say why an attempt was refused. */
  test: boolean;
}

export function Checkout({ stage: initial, email, hasClinic, ready, test }: CheckoutProps) {
  const [result, submitAction, submitting] = useActionState<Subscribed | null>(() => subscribe(), null);
  // A manual override — set only from event handlers (retry, recheck, the
  // slow poll below), never mirrored from `result` in an effect. When a new
  // submit actually finishes, the fresh `result` must win over a stale
  // override; adjusting state during render (comparing against the last
  // `result` seen) is React's own pattern for that, not an effect.
  const [manualStage, setManualStage] = useState<Stage | null>(null);
  const [syncedResult, setSyncedResult] = useState(result);
  if (result !== syncedResult) {
    setSyncedResult(result);
    setManualStage(null);
  }
  const stage: Stage = manualStage ?? result?.outcome ?? initial;

  // Still pending: keep asking, slowly, while the page is open (the webhook may land any time).
  useEffect(() => {
    if (stage !== "pending") return;
    const timer = setInterval(async () => {
      const outcome = await check().catch((): CheckoutOutcome => "pending");
      if (outcome !== "pending") setManualStage(outcome);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stage]);

  const recheck = async () => setManualStage(await check().catch((): CheckoutOutcome => "pending"));
  const retry = () => setManualStage("form");

  if (stage === "active") return <Activated hasClinic={hasClinic} />;

  if (stage === "pending") {
    return (
      <section className={styles.state} aria-live="polite">
        <Signal loop />
        <h1 className={ui.title}>Aguardando confirmação.</h1>
        <p className={ui.lead}>
          Assim que o Mercado Pago confirmar o pagamento, o Pulse libera sozinho. Se você ainda não concluiu o
          pagamento no Mercado Pago, continue por aqui — é a mesma tentativa, nenhuma cobrança duplicada.
        </p>
        <div className={ui.actions}>
          <button type="button" className={ui.secondary} onClick={recheck}>
            Verificar de novo
          </button>
          <form action={submitAction}>
            <button type="submit" className={ui.primary} disabled={submitting} aria-busy={submitting}>
              {submitting ? "Abrindo o Mercado Pago…" : "Continuar no Mercado Pago"}
            </button>
          </form>
        </div>
      </section>
    );
  }

  if (stage === "rejected") {
    return (
      <section className={styles.state} aria-live="polite">
        <h1 className={ui.title}>Não foi possível iniciar o pagamento.</h1>
        <p className={ui.lead}>Nada foi cobrado. Tente novamente; se persistir, fale com a Wuavy.</p>
        {test && result?.detail ? <p className={ui.fine}>Teste: {result.detail}</p> : null}
        <button type="button" className={ui.primary} onClick={retry}>
          Tentar novamente
        </button>
      </section>
    );
  }

  if (stage === "declined") {
    return (
      <section className={styles.state} aria-live="polite">
        <h1 className={ui.title}>O Mercado Pago não aprovou esta assinatura.</h1>
        <p className={ui.lead}>
          A tentativa foi cancelada antes de qualquer cobrança recorrente começar. Se aparecer algo no extrato do seu
          cartão nos próximos dias, costuma ser uma pré-autorização que expira sozinha — não uma cobrança.
        </p>
        <button type="button" className={ui.primary} onClick={retry}>
          Tentar novamente
        </button>
      </section>
    );
  }

  if (stage === "unresolved") {
    return (
      <section className={styles.state} aria-live="polite">
        <h1 className={ui.title}>Ainda não confirmamos o resultado desta tentativa.</h1>
        <p className={ui.lead}>
          Por segurança, não tente de novo agora: isso poderia gerar uma cobrança duplicada se a primeira tentativa
          ainda estiver em andamento. Vamos confirmar e liberar automaticamente assim que soubermos.
        </p>
        <div className={ui.actions}>
          <button type="button" className={ui.secondary} onClick={recheck}>
            Verificar de novo
          </button>
          <a
            href={contactHref(site.contact.primary, `${PLAN.subscribe.topic} — tentativa não confirmada (${email})`)}
            className={ui.primary}
            target="_blank"
            rel="noopener noreferrer"
          >
            Falar com a Wuavy
          </a>
        </div>
      </section>
    );
  }

  if (stage === "unavailable" || !ready) return <Offline email={email} />;

  return (
    <>
      <header className={ui.head}>
        <h1 className={ui.title}>{PLAN.subscribe.title}</h1>
        <p className={ui.price}>
          <strong>{brl(PRICE)}</strong>
          <span>/mês</span>
        </p>
        <p className={ui.priceText}>{PLAN.subscribe.text}</p>
      </header>
      <Includes />
      <PaymentMethod />
      <form action={submitAction}>
        <button type="submit" className={ui.primary} disabled={submitting} aria-busy={submitting}>
          {submitting ? "Redirecionando para o Mercado Pago…" : PLAN.subscribe.cta}
        </button>
      </form>
      <p className={ui.fine}>
        Você será levado ao ambiente oficial do Mercado Pago para concluir o pagamento com segurança. O Pulse não vê
        nem guarda os dados do seu cartão.
        {test ? " Ambiente de teste: use um cartão de teste do Mercado Pago; nada é cobrado." : ""}
      </p>
    </>
  );
}

/** What the plan has today, and what it gets once built (marked as such). */
function Includes() {
  return (
    <>
      <ul className={ui.includes} aria-label="O que a assinatura inclui">
        {PLAN.subscribe.includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <ul className={ui.soonList} aria-label="Chega em breve ao plano">
        {PLAN.subscribe.coming.map((item) => (
          <li key={item}>
            <Soon />
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * No online checkout yet (Mercado Pago not configured): the plan is
 * contracted with Wuavy, which activates it on this account by hand
 * (migration 0004). The account exists already; once it is active, this
 * page says so and sends the person on to set up the clinic.
 */
function Offline({ email }: { email: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  return (
    <>
      <header className={ui.head}>
        <h1 className={ui.title}>
          Assinatura online <Soon />
        </h1>
        <p className={ui.price}>
          <strong>{brl(PRICE)}</strong>
          <span>/mês</span>
        </p>
        <p className={ui.lead}>
          Por enquanto, a contratação do Wuavy Pulse é feita direto com a Wuavy. Sua conta já está criada
          {email ? (
            <>
              {" "}
              (<strong>{email}</strong>)
            </>
          ) : null}
          : assim que o plano for ativado nela, esta página libera a configuração da clínica.
        </p>
      </header>
      <Includes />
      <div className={ui.actions}>
        <a
          href={contactHref(site.contact.primary, `${PLAN.subscribe.topic} (conta ${email})`)}
          className={ui.primary}
          target="_blank"
          rel="noopener noreferrer"
        >
          Falar com a Wuavy
        </a>
        <button
          type="button"
          className={ui.secondary}
          disabled={checking}
          onClick={() => {
            setChecking(true);
            router.refresh();
            setTimeout(() => setChecking(false), 1500);
          }}
        >
          {checking ? "Verificando…" : "Já foi ativado? Verificar"}
        </button>
      </div>
    </>
  );
}

/** The Pulse's sign at work: a point, and the rings it sends out. */
function Signal({ loop }: { loop?: boolean }) {
  return (
    <span className={styles.signal} data-loop={loop ? "" : undefined} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Payment confirmed: the screen dims, the Pulse's sign sends out its rings,
 * and the sentence lands. Short, and the way forward is one button.
 */
function Activated({ hasClinic }: { hasClinic: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className={styles.activated} role="dialog" aria-modal="true" aria-labelledby="pulse-ativo">
      <div className={styles.activatedPanel}>
        <Signal />
        <p className={styles.confirmed}>Pagamento confirmado</p>
        <h1 id="pulse-ativo" ref={heading} tabIndex={-1} className={styles.activatedTitle}>
          Seu Pulse está ativo.
        </h1>
        <p className={styles.activatedText}>
          {hasClinic ? "Tudo liberado de novo para a sua clínica." : "Agora vamos configurar sua clínica."}
        </p>
        <Link href={hasClinic ? "/pulse/app" : "/pulse/comecar"} className={`${ui.primary} ${styles.activatedAction}`}>
          {hasClinic ? "Entrar no Pulse" : "Configurar minha clínica"}
        </Link>
      </div>
    </div>
  );
}
