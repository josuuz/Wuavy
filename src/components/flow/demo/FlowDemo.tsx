"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import type { Access } from "@/lib/flow/access";
import type { FlowData } from "@/lib/flow/types";
import { createClient } from "@/lib/supabase/client";
import { pad } from "@/lib/utils";
import "../pulse-theme.css";
import { ThemeToggle } from "../ThemeToggle";
import { AskFlow } from "./AskFlow";
import { APP_BASE, BASE, MENU, PLAN, VIEWS, viewHref } from "./copy";
import { FlowProvider, useFlow } from "./store";
import styles from "./FlowDemo.module.css";

/*
  The Pulse's app shell: the clinic and its screens on the left (a strip
  across the top on phones), the current screen's name, the theme switch and
  "Pergunte ao Pulse" above the work. Oportunidades is not in the menu: the
  overview is where the Pulse says what to do, and it opens the detail. Data
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
  const { data, ops, base, access } = useFlow();
  const [asking, setAsking] = useState(false);
  const current = VIEWS.find((v) => viewHref(v.slug, base) === pathname) ?? VIEWS[0];
  const open = ops.filter((o) => o.count > 0 && o.status !== "resolvida").length;
  const plan = access.isDemoMode
    ? "Demo · dados fictícios"
    : access.isReadOnly
      ? PLAN.ended.badge
      : access.isTrial
        ? PLAN.trial(access.trialDaysLeft)
        : null;

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
            <button type="button" className={styles.askSmall} onClick={() => setAsking(true)}>
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
                    {view.slug === "" && open ? (
                      <span className={styles.badge} aria-label={`${open} oportunidades abertas`}>
                        {open}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
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
          {access.isDemoMode ? (
            <span className={styles.demoChip}>{PLAN.demo.badge}</span>
          ) : plan ? (
            <span className={styles.planChip} data-tone={access.isReadOnly ? "ended" : undefined}>
              {plan}
            </span>
          ) : null}
          <ThemeToggle className={styles.barToggle} />
          <button type="button" className={styles.ask} onClick={() => setAsking(true)} data-cursor="action">
            <span className="pulse-dot" aria-hidden="true" />
            Pergunte ao Pulse
          </button>
        </header>
        <PlanNotice />
        <main id="conteudo" className={styles.content}>
          {children}
        </main>
      </div>

      <AskFlow open={asking} onClose={() => setAsking(false)} />
    </div>
  );
}

/** Above the work: the demo says it is one; an ended trial says what happens now. A trial in course stays quiet. */
function PlanNotice() {
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
      </aside>
    );
  }
  if (access.isReadOnly) {
    const href = contactHref(site.contact.primary, PLAN.ended.topic);
    return (
      <aside className={styles.notice} data-tone="ended" aria-labelledby="fim-do-teste">
        <div className={styles.noticeBody}>
          <p id="fim-do-teste" className={styles.noticeTitle}>
            {PLAN.ended.title}
          </p>
          <p className={styles.noticeText}>{PLAN.ended.text}</p>
        </div>
        <a href={href} className={styles.noticeAction} target="_blank" rel="noopener noreferrer">
          {PLAN.ended.cta}
        </a>
      </aside>
    );
  }
  return null;
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
