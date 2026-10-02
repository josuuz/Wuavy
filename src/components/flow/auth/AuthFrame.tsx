import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import ui from "../demo/ui.module.css";
import "../pulse-theme.css";
import { ThemeToggle } from "../ThemeToggle";
import styles from "./AuthFrame.module.css";

/*
  The frame of the Pulse's doors (sign in, subscribe, set up the clinic): the
  product mark, a title, one form. Steps that change their own title (the
  checkout, onboarding) leave it out and draw their header inside.
*/

export function AuthFrame({ title, lead, children }: { title?: string; lead?: string; children: ReactNode }) {
  return (
    <main id="conteudo" className={styles.frame} data-pulse="">
      <div className={styles.card}>
        <div className={styles.top}>
          <Link href="/pulse" className={styles.brand} aria-label="Wuavy Pulse: página do produto">
            <Wordmark size="small" decorative />
            <span className={styles.product}>Pulse</span>
          </Link>
          <ThemeToggle />
        </div>
        {title ? (
          <header className={ui.head}>
            <h1 className={ui.title}>{title}</h1>
            {lead ? <p className={ui.lead}>{lead}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </main>
  );
}
