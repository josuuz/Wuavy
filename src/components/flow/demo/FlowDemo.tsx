"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE, type Access } from "@/lib/flow/access";
import { brl } from "@/lib/flow/format";
import { recovered } from "@/lib/flow/insights";
import type { FlowData } from "@/lib/flow/types";
import { createClient } from "@/lib/supabase/client";
import { pad } from "@/lib/utils";
import "../pulse-theme.css";
import { ThemeToggle } from "../ThemeToggle";
import { AskFlow } from "./AskFlow";
import { APP_BASE, BASE, MENU, PLAN, VIEWS, viewHref } from "./copy";
import { Sheet } from "./Sheet";
import { FlowProvider, useFlow } from "./store";
import ui from "./ui.module.css";
import styles from "./FlowDemo.module.css";

/*
  The Pulse's app shell: the clinic and its screens on the left (a strip
  across the top on phones), the current screen's name, the plan with its
  "Assinar", the theme switch and "Pergunte ao Pulse" above the work. The
  rail keeps what the Pulse brought back in sight on every screen. Data
  comes in from the route's layout, with what the clinic may do (`access`):
  the demo's in memory, or a real clinic's from Supabase, in trial or not.
*/

interface FlowDemoProps {
  initial: FlowData;
  access: Access;
  /** The signed-in member, in the real Pulse. */
  account?: { name: string };
  children: ReactNode;
}

export function FlowDemo({ initial, access, account, children }: FlowDemoProps) {
  return (
    <FlowProvider initial={initial} base={access.isDemoMode ? BASE : APP_BASE} access={access}>
      <Shell account={account}>{children}</Shell>
    </FlowProvider>
  );
}

function Shell({ account, children }: { account?: { name: string }; children: ReactNode }) {
  const pathname = usePathname();
  const { data, ops, base, access, ask, asking, closeAsk } = useFlow();
  const [subscribing, setSubscribing] = useState(false);
  const current = VIEWS.find((v) => viewHref(v.slug, base) === pathname) ?? VIEWS[0];
  const open = ops.filter((o) => o.count > 0 && o.status !== "resolvida").length;
  const back = recovered(data).total;
  // Whoever is not paying yet: the demo, a trial, an ended trial.
  const canSubscribe = access.isDemoMode || access.isTrial || access.isReadOnly;
  const plan = access.isDemoMode
    ? "Demo · dados fictícios"
    : access.isReadOnly
      ? PLAN.ended.badge
      : access.isTrial
        ? PLAN.trial(access.trialDaysLeft)
        : null;
  const subscribe = () => setSubscribing(true);

  return (
    <div className={styles.app} data-pulse="">
      <aside className={styles.side} data-pulse-surface="rail">
        <div className={styles.brandRow}>
          <Link href="/pulse" className={styles.brand} aria-label="Wuavy Pulse: voltar à página do produto">
            <Wordmark size="small" decorative />
            <span className={styles.product}>Pulse</span>
          </Link>
          <div className={styles.rowTools}>
            <ThemeToggle />
            <button type="button" className={styles.askSmall} onClick={() => ask()}>
              Pergunte
            </button>
          </div>
        </div>
        <p className={styles.org}>
          {data.organization.name}
          {account ? <span>{account.name}</span> : null}
          {plan ? (
            <span className={styles.plan} data-tone={access.isReadOnly ? "ended" : undefined}>
              {plan}
            </span>
          ) : null}
          {access.isTrial ? (
            <button type="button" className={`${styles.signOut} ${styles.orgSubscribe}`} onClick={subscribe}>
              {PLAN.subscribe.open}
            </button>
          ) : null}
          {account ? <SignOut /> : null}
        </p>
        <nav aria-label="Telas do Pulse" className={styles.nav}>
          <ol>
            {MENU.map((view, i) => {
              const href = viewHref(view.slug, base);
              const here = href === pathname;
              return (
                <li key={view.slug}>
                  <Link href={href} className={styles.navLink} aria-current={here ? "page" : undefined}>
                    <span className={styles.navIndex} aria-hidden="true">
                      {pad(i + 1)}
                    </span>
                    {view.label}
                    {view.slug === "oportunidades" && open ? (
                      <span className={styles.badge} aria-label={`${open} frentes abertas`}>
                        {open}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        {back ? (
          <Link href={`${viewHref("", base)}#valor`} className={styles.railValue}>
            <span className={styles.railLabel}>Recuperado pelo Pulse · 30 dias</span>
            <strong className={styles.railAmount}>{brl(back)}</strong>
            {back >= PRICE ? (
              <span className={styles.railNote}>{Math.floor(back / PRICE)}× o valor da mensalidade</span>
            ) : null}
          </Link>
        ) : null}
        {account ? null : (
          <Link href="/pulse" className={styles.back}>
            <span aria-hidden="true">←</span> Voltar ao Wuavy Pulse
          </Link>
        )}
      </aside>

      <div className={styles.main}>
        <header className={styles.bar}>
          <p className={styles.crumb}>
            <span>Pulse</span> / {current.label}
          </p>
          <div className={styles.planGroup}>
            {access.isDemoMode ? (
              <span className={styles.demoChip}>{PLAN.demo.badge}</span>
            ) : plan ? (
              <span className={styles.planChip} data-tone={access.isReadOnly ? "ended" : undefined}>
                {plan}
              </span>
            ) : null}
            {canSubscribe ? (
              <button type="button" className={styles.subscribe} onClick={subscribe} aria-haspopup="dialog">
                {PLAN.subscribe.open}
              </button>
            ) : null}
          </div>
          <ThemeToggle className={styles.barToggle} />
          <button type="button" className={styles.ask} onClick={() => ask()} data-cursor="action">
            <span className="pulse-dot" aria-hidden="true" />
            Pergunte ao Pulse
          </button>
        </header>
        <PlanNotice onSubscribe={subscribe} />
        <main id="conteudo" className={styles.content}>
          {children}
        </main>
      </div>

      <AskFlow key={asking.session} open={asking.open} question={asking.question} onClose={closeAsk} />
      {canSubscribe ? <Subscribe open={subscribing} onClose={() => setSubscribing(false)} /> : null}
    </div>
  );
}

/** Above the work: the demo says it is one; an ended trial says what happens now. A trial in course stays quiet. */
function PlanNotice({ onSubscribe }: { onSubscribe: () => void }) {
  const { access } = useFlow();
  if (access.isDemoMode) {
    const href = contactHref(site.contact.primary, PLAN.demo.topic);
    return (
      <aside className={styles.notice} aria-label="Demonstração">
        <span className={styles.noticeBadge}>{PLAN.demo.badge}</span>
        <p className={styles.noticeText}>{PLAN.demo.text}</p>
        <a href={href} className={styles.noticeCta} target="_blank" rel="noopener noreferrer">
          {PLAN.demo.cta} <span aria-hidden="true">→</span>
        </a>
        <button type="button" className={`${styles.subscribe} ${styles.noticeSubscribe}`} onClick={onSubscribe} aria-haspopup="dialog">
          {PLAN.subscribe.open}
        </button>
      </aside>
    );
  }
  if (access.isReadOnly) {
    return (
      <aside className={styles.notice} data-tone="ended" aria-labelledby="fim-do-teste">
        <div className={styles.noticeBody}>
          <p id="fim-do-teste" className={styles.noticeTitle}>
            {PLAN.ended.title}
          </p>
          <p className={styles.noticeText}>{PLAN.ended.text}</p>
        </div>
        <button type="button" className={styles.noticeAction} onClick={onSubscribe} aria-haspopup="dialog">
          {PLAN.ended.cta}
        </button>
      </aside>
    );
  }
  return null;
}

/**
 * The subscription, in one compact dialog. Checkout is not connected yet:
 * with PLAN.subscribe.checkoutUrl set the button goes there; until then it
 * opens the Wuavy contact with the subject filled in.
 */
function Subscribe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { access } = useFlow();
  const offer = PLAN.subscribe;
  const checkout = offer.checkoutUrl ?? contactHref(site.contact.primary, offer.topic);
  return (
    <Sheet centered open={open} onClose={onClose} title={offer.title}>
      <p className={ui.price}>
        <strong>{brl(PRICE)}</strong>
        <span>/mês</span>
      </p>
      <p className={ui.priceText}>{offer.text}</p>
      <ul className={ui.includes} aria-label="O que a assinatura inclui">
        {offer.includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className={ui.modalActions}>
        <a href={checkout} className={ui.primary} target="_blank" rel="noopener noreferrer" data-checkout="">
          {offer.cta}
        </a>
        <button type="button" className={ui.quiet} onClick={onClose}>
          {access.isDemoMode ? offer.back.demo : offer.back.trial}
        </button>
      </div>
    </Sheet>
  );
}

function SignOut() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      type="button"
      className={styles.signOut}
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
