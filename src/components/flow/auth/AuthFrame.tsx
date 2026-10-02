import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import ui from "../demo/ui.module.css";
import "../pulse-theme.css";
import { ThemeToggle } from "../ThemeToggle";
import styles from "./AuthFrame.module.css";

/* The frame of the Pulse's doors (sign in, create the clinic): the product mark, a title, one form. */

export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
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
        <header className={ui.head}>
          <h1 className={ui.title}>{title}</h1>
          <p className={ui.lead}>{lead}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
