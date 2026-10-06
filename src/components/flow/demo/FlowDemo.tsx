"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { markSubscribeIntent } from "@/app/(app)/pulse/demo/actions";
import { Wordmark } from "@/components/brand/Wordmark";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE, type Access } from "@/lib/flow/access";
import { brl } from "@/lib/flow/format";
import { potentialOf } from "@/lib/flow/insights";
import type { FlowData } from "@/lib/flow/types";
import { pad } from "@/lib/utils";
import "../pulse-theme.css";
import { ThemeToggle } from "../ThemeToggle";
import { AskFlow } from "./AskFlow";
import { APP_BASE, BASE, CHECKOUT, MENU, ONLINE_CHECKOUT, PLAN, VIEWS, viewHref } from "./copy";
import { Intro, PaymentMethod, SignOut, Soon } from "./forms";
import { Sheet } from "./Sheet";
import { GuideCard, GuidePill, GuideProvider, ScreenTip, useGuide } from "./Guide";
import { InboxProvider } from "./inbox";
import { FlowProvider, useFlow, type Account } from "./store";
import ui from "./ui.module.css";
import styles from "./FlowDemo.module.css";

/*
  The Pulse's app shell: the clinic and its screens on the left (a strip
  across the top on phones), the current screen's name, the plan with its
  "Assinar", the theme switch and "Pergunte ao Pulse" above the work. The
  rail keeps the revenue within reach (the open opportunities) in sight on
  every screen. Data comes in from the route's layout, with what the clinic
  may do (`access`): the demo's in memory, or a real clinic's from Supabase.
*/

interface FlowDemoProps {
  initial: FlowData;
  access: Access;
  /** The signed-in member, in the real Pulse. */
  account?: Account;
  children: ReactNode;
}

export function FlowDemo({ initial, access, account, children }: FlowDemoProps) {
  return (
    <FlowProvider initial={initial} base={access.isDemoMode ? BASE : APP_BASE} access={access} account={account}>
      <GuideProvider>
        <InboxProvider>
          <Shell>{children}</Shell>
        </InboxProvider>
      </GuideProvider>
    </FlowProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, ops, base, access, account, can, ask, asking, closeAsk } = useFlow();
  const [subscribing, setSubscribing] = useState(false);
  const guide = useGuide();
  const current = VIEWS.find((v) => viewHref(v.slug, base) === pathname) ?? VIEWS[0];
  // Only the screens the person's role can use (the server and the database refuse the rest anyway).
  const menu = MENU.filter((view) => (!view.live || !access.isDemoMode) && (!view.need || can[view.need]));
  const allowed = !current.need || can[current.need];
  const open = ops.filter((o) => o.count > 0 && o.status !== "resolvida").length;
  const potential = potentialOf(ops);
  const status = access.subscriptionStatus;
  // Whoever is not paying: the demo's visitor, a clinic whose subscription was cancelled.
  const canSubscribe = access.isDemoMode || status === "cancelled";
  const plan = access.isDemoMode ? "Demo · dados fictícios" : status ? PLAN.chip[status] : null;
  // The chip draws the eye only when the subscription asks for something.
  const tone = status && status !== "active" ? "ended" : undefined;
  const subscribe = () => {
    setSubscribing(true);
    markSubscribeIntent().catch(() => {});
  };

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
          {data.organization.logoUrl ? (
            <Image className={styles.logo} src={data.organization.logoUrl} alt="" width={28} height={28} unoptimized />
          ) : null}
          {data.organization.name}
          {account && !access.isDemoMode ? <span>{account.name}</span> : null}
          {plan ? (
            <span className={styles.plan} data-tone={tone}>
              {plan}
            </span>
          ) : null}
          {account ? <SignOut className={styles.signOut} /> : null}
        </p>
        <nav aria-label="Telas do Pulse" className={styles.nav}>
          <ol>
            {menu.map((view, i) => {
              const href = viewHref(view.slug, base);
              const here = href === pathname;
              const pointed = guide.target === view.slug;
              return (
                <li key={view.slug}>
                  <Link
                    href={href}
                    className={styles.navLink}
                    aria-current={here ? "page" : undefined}
                    data-guide={pointed ? "" : undefined}
                  >
                    <span className={styles.navIndex} aria-hidden="true">
                      {pad(i + 1)}
                    </span>
                    {view.label}
                    {view.slug === "oportunidades" && open ? (
                      <span className={styles.badge} aria-label={`${open} frentes abertas`}>
                        {open}
                      </span>
                    ) : null}
                    {pointed ? (
                      <span className={styles.guideArrow}>
                        <span aria-hidden="true">←</span>
                        <span className="sr-only">: comece aqui</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <GuideCard />
        <GuidePill />
        {potential && can.sales ? (
          <Link href={viewHref("oportunidades", base)} className={styles.railValue}>
            <span className={styles.railLabel}>Receita potencial · agora</span>
            <strong className={styles.railAmount}>{brl(potential)}</strong>
            <span className={styles.railNote}>
              em {open} {open === 1 ? "oportunidade aberta" : "oportunidades abertas"}
            </span>
          </Link>
        ) : null}
        {account && !access.isDemoMode ? null : (
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
              <span className={styles.planChip} data-tone={tone}>
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
        <main id="conteudo" className={styles.content} data-view={current.slug || "visao-geral"}>
          <ScreenTip />
          {allowed ? (
            children
          ) : (
            <div className={ui.page}>
              <header className={ui.head}>
                <h1 className={ui.title}>{current.label}</h1>
              </header>
              <Intro title="Sem acesso">
                Esta tela não faz parte da sua função na clínica. Se precisar dela, fale com o responsável.
              </Intro>
            </div>
          )}
        </main>
      </div>

      <AskFlow key={asking.session} open={asking.open} question={asking.question} onClose={closeAsk} />
      {canSubscribe ? <Subscribe open={subscribing} onClose={() => setSubscribing(false)} /> : null}
    </div>
  );
}

/** Above the work: the demo says it is one; a subscription that needs something says what. An active one stays quiet. */
function PlanNotice({ onSubscribe }: { onSubscribe: () => void }) {
  const { access } = useFlow();
  const status = access.subscriptionStatus;
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
  if (status === "past_due" || status === "pending" || status === "cancelled") {
    const notice = PLAN.notice[status];
    return (
      <aside className={styles.notice} data-tone="ended" aria-labelledby="aviso-do-plano">
        <div className={styles.noticeBody}>
          <p id="aviso-do-plano" className={styles.noticeTitle}>
            {notice.title}
          </p>
          <p className={styles.noticeText}>{notice.text}</p>
        </div>
        {status === "cancelled" ? (
          <button type="button" className={styles.noticeAction} onClick={onSubscribe} aria-haspopup="dialog">
            {PLAN.notice.cancelled.cta}
          </button>
        ) : null}
      </aside>
    );
  }
  return null;
}

/**
 * The subscription, in one compact dialog: the plan, how it is paid, and the
 * way to the checkout, which signs the person in first when needed. Nothing
 * here charges anything; the checkout and the server do.
 */
function Subscribe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { access } = useFlow();
  const offer = PLAN.subscribe;
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
      <ul className={ui.soonList} aria-label="Chega em breve ao plano">
        {offer.coming.map((item) => (
          <li key={item}>
            <Soon />
            {item}
          </li>
        ))}
      </ul>
      {ONLINE_CHECKOUT ? <PaymentMethod /> : <p className={ui.fine}>{offer.offline.note}</p>}
      <div className={ui.modalActions}>
        {ONLINE_CHECKOUT ? (
          <Link href={CHECKOUT} className={ui.primary} data-checkout="">
            {offer.cta}
          </Link>
        ) : (
          <a
            href={contactHref(site.contact.primary, offer.topic)}
            className={ui.primary}
            target="_blank"
            rel="noopener noreferrer"
          >
            {offer.offline.cta}
          </a>
        )}
        <button type="button" className={ui.quiet} onClick={onClose}>
          {access.isDemoMode ? offer.back.demo : offer.back.other}
        </button>
      </div>
    </Sheet>
  );
}
