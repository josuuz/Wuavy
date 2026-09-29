"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import type { FlowData } from "@/lib/flow/types";
import { createClient } from "@/lib/supabase/client";
import { pad } from "@/lib/utils";
import { AskFlow } from "./AskFlow";
import { APP_BASE, BASE, VIEWS, viewHref } from "./copy";
import { FlowProvider, useFlow } from "./store";
import styles from "./FlowDemo.module.css";

/*
  The Flow's app shell: the clinic and its eight screens on the left (a strip
  across the top on phones), the current screen's name and "Pergunte ao
  Flow" above the work. Data comes in from the route's layout: the demo's in
  memory, or a real clinic's (`account` set) from Supabase.
*/

interface FlowDemoProps {
  initial: FlowData;
  /** The signed-in member, in the real Flow. */
  account?: { name: string };
  children: ReactNode;
}

export function FlowDemo({ initial, account, children }: FlowDemoProps) {
  return (
    <FlowProvider initial={initial} base={account ? APP_BASE : BASE} live={Boolean(account)}>
      <Shell account={account}>{children}</Shell>
    </FlowProvider>
  );
}

function Shell({ account, children }: { account?: { name: string }; children: ReactNode }) {
  const pathname = usePathname();
  const { data, ops, base } = useFlow();
  const [asking, setAsking] = useState(false);
  const current = VIEWS.find((v) => viewHref(v.slug, base) === pathname) ?? VIEWS[0];
  const open = ops.filter((o) => o.count > 0 && o.status !== "resolvida").length;

  return (
    <div className={styles.app} data-surface="black">
      <aside className={styles.side} data-surface="carbon">
        <div className={styles.brandRow}>
          <Link href="/flow" className={styles.brand} aria-label="Wuavy Flow: voltar à página do produto">
            <Wordmark size="small" decorative />
            <span className={styles.product}>Flow</span>
          </Link>
          <button type="button" className={styles.askSmall} onClick={() => setAsking(true)}>
            Pergunte
          </button>
        </div>
        <p className={styles.org}>
          {data.organization.name}
          {account ? (
            <>
              <span>{account.name}</span>
              <SignOut />
            </>
          ) : (
            <span>Demo · dados ilustrativos</span>
          )}
        </p>
        <nav aria-label="Telas do Flow" className={styles.nav}>
          <ol>
            {VIEWS.map((view, i) => {
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
                      <span className={styles.badge} aria-label={`${open} abertas`}>
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
          <Link href="/flow" className={styles.back}>
            <span aria-hidden="true">←</span> Voltar ao Wuavy Flow
          </Link>
        )}
      </aside>

      <div className={styles.main}>
        <header className={styles.bar}>
          <p className={styles.crumb}>
            <span>Flow</span> / {current.label}
          </p>
          {account ? null : <span className={styles.demoChip}>Dados ilustrativos</span>}
          <button type="button" className={styles.ask} onClick={() => setAsking(true)} data-cursor="action">
            <span className={styles.askDot} aria-hidden="true" />
            Pergunte ao Flow
          </button>
        </header>
        <main id="conteudo" className={styles.content}>
          {children}
        </main>
      </div>

      <AskFlow open={asking} onClose={() => setAsking(false)} />
    </div>
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
        router.replace("/flow/entrar");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
