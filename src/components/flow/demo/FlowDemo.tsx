"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import type { FlowData } from "@/lib/flow/types";
import { pad } from "@/lib/utils";
import { AskFlow } from "./AskFlow";
import { VIEWS, viewHref } from "./copy";
import { FlowProvider, useFlow } from "./store";
import styles from "./FlowDemo.module.css";

/*
  The demo's app shell: the clinic and its eight screens on the left (a strip
  across the top on phones), the current screen's name and "Pergunte ao
  Flow" above the work. Data comes in from the route's layout, so the same
  shell runs on real data once the source changes.
*/

export function FlowDemo({ initial, children }: { initial: FlowData; children: ReactNode }) {
  return (
    <FlowProvider initial={initial}>
      <Shell>{children}</Shell>
    </FlowProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, ops } = useFlow();
  const [asking, setAsking] = useState(false);
  const current = VIEWS.find((v) => viewHref(v.slug) === pathname) ?? VIEWS[0];
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
          <span>Demo · dados ilustrativos</span>
        </p>
        <nav aria-label="Telas do Flow" className={styles.nav}>
          <ol>
            {VIEWS.map((view, i) => {
              const href = viewHref(view.slug);
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
        <Link href="/flow" className={styles.back}>
          <span aria-hidden="true">←</span> Voltar ao Wuavy Flow
        </Link>
      </aside>

      <div className={styles.main}>
        <header className={styles.bar}>
          <p className={styles.crumb}>
            <span>Flow</span> / {current.label}
          </p>
          <span className={styles.demoChip}>Dados ilustrativos</span>
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
