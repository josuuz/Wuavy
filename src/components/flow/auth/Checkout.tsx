"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { check, subscribe, type CheckoutOutcome } from "@/app/(app)/pulse/assinar/actions";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE } from "@/lib/flow/access";
import { brl } from "@/lib/flow/format";
import { PLAN } from "../demo/copy";
import { PaymentMethod } from "../demo/forms";
import ui from "../demo/ui.module.css";
import styles from "./AuthFrame.module.css";

/*
  The checkout. The card is typed into Mercado Pago's own Card Payment Brick,
  which turns it into a token in the browser; only that token goes to our
  server, which creates the subscription with Mercado Pago and answers with
  what Mercado Pago said. While the answer is not final, the page asks the
  server again (the server asks Mercado Pago, the webhook may already have
  told it). The browser never decides that the Pulse is paid.
*/

type Stage = "form" | "processing" | CheckoutOutcome;

interface BrickController {
  unmount: () => void;
}
interface CardFormData {
  token: string;
  payer?: { email?: string };
}
interface MercadoPagoSdk {
  bricks: () => { create: (brick: "cardPayment", containerId: string, settings: object) => Promise<BrickController> };
}
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoSdk;
  }
}

const SDK = "https://sdk.mercadopago.com/js/v2";
const BRICK = "pulse-card-brick";
const POLL_MS = 2500;
/** About twenty seconds of asking; then the page says the payment is being processed. */
const POLLS = 8;

interface CheckoutProps {
  stage: "form" | "pending" | "active";
  email: string;
  /** A clinic subscribing again goes back to the Pulse, not to onboarding. */
  hasClinic: boolean;
  publicKey: string;
}

export function Checkout({ stage: initial, email, hasClinic, publicKey }: CheckoutProps) {
  const [stage, setStage] = useState<Stage>(initial === "pending" ? "processing" : initial);
  const [sdk, setSdk] = useState(false);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const test = publicKey.startsWith("TEST-");

  // The card form, from Mercado Pago, mounted while the form is shown.
  useEffect(() => {
    if (stage !== "form" || !sdk || !publicKey || !window.MercadoPago) return;
    const root = document.documentElement;
    const light = root.dataset.pulseTheme === "light";
    const signal = getComputedStyle(root).getPropertyValue("--wuavy-signal").trim();
    let controller: BrickController | undefined;
    let gone = false;
    new window.MercadoPago(publicKey, { locale: "pt-BR" })
      .bricks()
      .create("cardPayment", BRICK, {
        initialization: { amount: PRICE / 100, payer: { email } },
        customization: {
          visual: {
            hideFormTitle: true,
            texts: { formSubmit: PLAN.subscribe.cta },
            style: { theme: light ? "default" : "dark", ...(signal ? { customVariables: { baseColor: signal } } : {}) },
          },
          paymentMethods: { maxInstallments: 1, types: { excluded: ["debit_card", "prepaid_card"] } },
        },
        callbacks: {
          onReady: () => setReady(true),
          onSubmit: async (card: CardFormData) => {
            setSubmitting(true);
            const result = await subscribe({ token: card.token, email: card.payer?.email ?? email }).catch(
              (): CheckoutOutcome => "pending",
            );
            setSubmitting(false);
            setStage(result === "pending" ? "processing" : result);
          },
          // The Brick shows its own field errors; nothing technical reaches the person.
          onError: (error: unknown) => console.error("Mercado Pago Brick", error),
        },
      })
      .then((brick) => {
        if (gone) brick.unmount();
        else controller = brick;
      })
      .catch((error: unknown) => {
        console.error("Mercado Pago Brick", error);
        setStage("unavailable");
      });
    return () => {
      gone = true;
      controller?.unmount();
    };
  }, [stage, sdk, publicKey, email, attempt]);

  // Not final yet: ask the server again, a few times, then say it is being processed.
  useEffect(() => {
    if (stage !== "processing") return;
    let alive = true;
    let asked = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const result = await check().catch((): CheckoutOutcome => "pending");
      if (!alive) return;
      if (result !== "pending") return setStage(result);
      if (++asked >= POLLS) return setStage("pending");
      timer = setTimeout(ask, POLL_MS);
    };
    timer = setTimeout(ask, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [stage]);

  const retry = () => {
    setReady(false);
    setAttempt((n) => n + 1);
    setStage("form");
  };

  if (stage === "active") return <Activated hasClinic={hasClinic} />;

  if (stage === "processing") {
    return (
      <section className={styles.state} aria-live="polite">
        <Processing />
      </section>
    );
  }

  if (stage === "pending") {
    return (
      <section className={styles.state} aria-live="polite">
        <Signal />
        <h1 className={ui.title}>Seu pagamento está sendo processado.</h1>
        <p className={ui.lead}>
          Assim que o Mercado Pago confirmar, o Pulse libera sozinho. Pode fechar esta página: a confirmação chega mesmo
          assim.
        </p>
        <button type="button" className={ui.secondary} onClick={() => setStage("processing")}>
          Verificar de novo
        </button>
      </section>
    );
  }

  if (stage === "rejected") {
    return (
      <section className={styles.state} aria-live="polite">
        <h1 className={ui.title}>Não foi possível concluir o pagamento.</h1>
        <p className={ui.lead}>Nada foi cobrado. Confira os dados do cartão ou tente com outro.</p>
        <button type="button" className={ui.primary} onClick={retry}>
          Tentar novamente
        </button>
      </section>
    );
  }

  if (stage === "unavailable" || !publicKey) {
    return (
      <section className={styles.state}>
        <h1 className={ui.title}>O pagamento ainda não está disponível.</h1>
        <p className={ui.lead}>Fale com a Wuavy e ativamos o seu Pulse por lá.</p>
        <a
          href={contactHref(site.contact.primary, PLAN.subscribe.topic)}
          className={ui.primary}
          target="_blank"
          rel="noopener noreferrer"
        >
          Falar com a Wuavy
        </a>
      </section>
    );
  }

  return (
    <>
      <Script src={SDK} strategy="afterInteractive" onReady={() => setSdk(true)} />
      <header className={ui.head}>
        <h1 className={ui.title}>{PLAN.subscribe.title}</h1>
        <p className={ui.price}>
          <strong>{brl(PRICE)}</strong>
          <span>/mês</span>
        </p>
        <p className={ui.priceText}>{PLAN.subscribe.text}</p>
      </header>
      <ul className={ui.includes} aria-label="O que a assinatura inclui">
        {PLAN.subscribe.includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <PaymentMethod />
      <div className={styles.brick} aria-busy={!ready || submitting}>
        {!ready && !submitting ? (
          <p className={styles.brickLoading}>
            <span className="pulse-dot" aria-hidden="true" />
            Carregando o pagamento seguro do Mercado Pago…
          </p>
        ) : null}
        <div id={BRICK} key={attempt} hidden={submitting} />
        {submitting ? <Processing /> : null}
      </div>
      <p className={ui.fine}>
        Os dados do cartão vão direto para o Mercado Pago: o Pulse não vê nem guarda o número do cartão.
        {test ? " Ambiente de teste: use um cartão de teste do Mercado Pago; nada é cobrado." : ""}
      </p>
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

function Processing() {
  return (
    <div className={styles.processing} role="status">
      <Signal loop />
      <p className={ui.label}>Processando pagamento</p>
      <p className={styles.processingText}>Estamos confirmando sua assinatura…</p>
    </div>
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
