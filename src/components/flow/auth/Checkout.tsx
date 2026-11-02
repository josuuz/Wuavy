"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { check, subscribe, subscribeWithPayerEmail, type CheckoutOutcome, type Subscribed } from "@/app/(app)/clinavy/assinar/actions";
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

/** O que a ação devolve, e de qual formulário veio: o erro do pagador e o motivo de recusa do "Assinar" (modo de teste) não dividem o mesmo canal. */
type Result = Subscribed & { from?: "payer" };

/** While "pending", how often the page asks again on its own. */
const POLL_MS = 8000;

interface CheckoutProps {
  stage: Stage;
  email: string;
  /** A clinic subscribing again goes back to Clinavy, not to onboarding. */
  hasClinic: boolean;
  /** Mercado Pago is configured on the server. Without it, only the offline path shows. */
  ready: boolean;
  /** Test credentials in use: say so, and say why an attempt was refused. */
  test: boolean;
  /**
   * O e-mail que o Mercado Pago vai pedir nesta tentativa: o da conta, ou o
   * que a pessoa já declarou numa tentativa anterior. É o que ela precisa ver
   * para saber com qual conta entrar lá.
   */
  payer: string;
  /** Só o responsável pela clínica (ou quem ainda não tem clínica) pode trocar quem paga: aos demais o servidor sempre recusa. */
  canDeclarePayer: boolean;
}

export function Checkout({ stage: initial, email, hasClinic, ready, test, payer, canDeclarePayer }: CheckoutProps) {
  // Uma máquina de estado só para os dois caminhos: assinar (sem campo) e
  // assinar declarando outro e-mail do Mercado Pago (com o campo "payer").
  // Assim um desfecho novo sempre vence o anterior, venha de qual vier.
  const [result, submitAction, submitting] = useActionState<Result | null, FormData>(async (_previous, form) => {
    // O formulário de pagador SEMPRE vai por subscribeWithPayerEmail, mesmo com o campo vazio
    // ou só com espaços: o servidor responde "confira o e-mail". Cair no "Assinar" simples
    // ignoraria em silêncio a intenção de trocar o pagador.
    if (form.has("payer")) return { ...(await subscribeWithPayerEmail(String(form.get("payer") ?? ""))), from: "payer" as const };
    return subscribe();
  }, null);
  // A manual override — set only from event handlers (retry, recheck, the
  // slow poll below), never mirrored from `result` in an effect. When a new
  // submit actually finishes, the fresh `result` must win over a stale
  // override; adjusting state during render (comparing against the last
  // `result` seen) is React's own pattern for that, not an effect.
  // O e-mail digitado vive aqui, não no formulário: o React 19 reinicia um formulário quando a
  // ação termina, e uma ação que devolve um ERRO (e-mail com erro de digitação, "muitas
  // tentativas") também TROCA a tela e desmonta o campo — a pessoa redigitaria a cada tentativa.
  const [payerInput, setPayerInput] = useState("");
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
          Assim que o Mercado Pago confirmar o pagamento, o Clinavy libera sozinho. Se você ainda não concluiu o
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
        {canDeclarePayer ? <PayerEmail payer={payer} action={submitAction} submitting={submitting} detail={result?.from === "payer" ? result.detail : undefined} value={payerInput} onValue={setPayerInput} /> : null}
      </section>
    );
  }

  if (stage === "rejected") {
    return (
      <section className={styles.state} aria-live="polite">
        <h1 className={ui.title}>Não foi possível iniciar o pagamento.</h1>
        <p className={ui.lead}>
          {result?.from === "payer" && result.detail ? result.detail : "Nada foi cobrado. Tente novamente; se persistir, fale com a Wuavy."}
        </p>
        {test && result?.detail && result.from !== "payer" ? <p className={ui.fine}>Teste: {result.detail}</p> : null}
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
        {canDeclarePayer ? <PayerEmail payer={payer} action={submitAction} submitting={submitting} detail={result?.from === "payer" ? result.detail : undefined} value={payerInput} onValue={setPayerInput} /> : null}
      </section>
    );
  }

  if (stage === "limited") {
    return (
      <section className={styles.state} aria-live="polite">
        <h1 className={ui.title}>Muitas tentativas em pouco tempo.</h1>
        <p className={ui.lead}>
          Por segurança, esperamos um pouco antes de abrir outro pagamento. Tente de novo daqui a cerca de uma hora, ou
          fale com a Wuavy, que resolve com você. Estas tentativas não geraram nenhuma cobrança.
        </p>
        <a
          href={contactHref(site.contact.primary, `${PLAN.subscribe.topic} — muitas tentativas (${email})`)}
          className={ui.primary}
          target="_blank"
          rel="noopener noreferrer"
        >
          Falar com a Wuavy
        </a>
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
        Você será levado ao ambiente oficial do Mercado Pago para concluir o pagamento com segurança. O Clinavy não vê
        nem guarda os dados do seu cartão. Entre lá com a conta de <strong>{payer}</strong> — é esse o e-mail que
        identifica esta assinatura.
        {test ? " Ambiente de teste: use um cartão de teste do Mercado Pago; nada é cobrado." : ""}
      </p>
      {canDeclarePayer ? <PayerEmail payer={payer} action={submitAction} submitting={submitting} detail={result?.from === "payer" ? result.detail : undefined} value={payerInput} onValue={setPayerInput} /> : null}
    </>
  );
}

/**
 * A saída para "Seu e-mail não corresponde ao da assinatura": o Mercado Pago
 * identifica quem paga pelo e-mail gravado na assinatura, e a conta do Mercado
 * Pago da pessoa pode usar outro endereço que não o da conta do Clinavy.
 * Declarar o e-mail certo aqui encerra a tentativa pendente e abre uma nova
 * por ele — sem criar outra conta, e sem cobrança duplicada.
 *
 * Não burla nada: o Mercado Pago continua sendo quem valida, e quem não
 * entrar com aquela conta segue recusado. O e-mail só muda quem a assinatura
 * nomeia como pagador; quem autentica no Clinavy continua sendo o Supabase Auth.
 */
function PayerEmail({
  payer,
  action,
  submitting,
  detail,
  value,
  onValue,
}: {
  payer: string;
  action: (form: FormData) => void;
  submitting: boolean;
  detail?: string;
  /** O que a pessoa digitou. Vive no Checkout, não aqui: este componente desmonta quando a ação troca a tela. */
  value: string;
  onValue: (value: string) => void;
}) {
  return (
    // Aberto quando há o que dizer: o erro (e-mail inválido, "só o responsável") ficaria escondido num bloco fechado.
    <details className={ui.field} open={Boolean(detail)}>
      <summary className={ui.fine}>Minha conta do Mercado Pago usa outro e-mail</summary>
      <p className={ui.fine}>
        Se o Mercado Pago disse que o e-mail não corresponde ao da assinatura, é porque esta assinatura está no nome de{" "}
        <strong>{payer}</strong> e você entrou lá com outra conta. Informe o e-mail da sua conta do Mercado Pago: a
        tentativa atual é encerrada e uma nova é aberta por ele. Você não precisa criar outra conta no Clinavy.
      </p>
      <form action={action}>
        <label className={ui.label} htmlFor="payer-email">
          <span>E-mail da sua conta do Mercado Pago</span>
          <input
            id="payer-email"
            name="payer"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            className={ui.input}
            placeholder="voce@exemplo.com"
            value={value}
            onChange={(event) => onValue(event.target.value)}
          />
        </label>
        {detail ? <p className={ui.fine}>{detail}</p> : null}
        <button type="submit" className={ui.secondary} disabled={submitting} aria-busy={submitting}>
          {submitting ? "Abrindo o Mercado Pago…" : "Usar este e-mail e continuar"}
        </button>
      </form>
    </details>
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
          Por enquanto, a contratação do Clinavy é feita direto com a Wuavy. Sua conta já está criada
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

/** Clinavy's sign at work: a point, and the rings it sends out. */
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
 * Payment confirmed: the screen dims, Clinavy's sign sends out its rings,
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
          Seu Clinavy está ativo.
        </h1>
        <p className={styles.activatedText}>
          {hasClinic ? "Tudo liberado de novo para a sua clínica." : "Agora vamos configurar sua clínica."}
        </p>
        <Link href={hasClinic ? "/clinavy/app" : "/clinavy/comecar"} className={`${ui.primary} ${styles.activatedAction}`}>
          {hasClinic ? "Entrar no Clinavy" : "Configurar minha clínica"}
        </Link>
      </div>
    </div>
  );
}
