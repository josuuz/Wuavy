import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import ui from "../demo/ui.module.css";
import styles from "./AuthFrame.module.css";

/* The frame of the Flow's doors (sign in, create the clinic): the product mark, a title, one form. */

export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <main id="conteudo" className={styles.frame} data-surface="black">
      <div className={styles.card}>
        <Link href="/flow" className={styles.brand} aria-label="Wuavy Flow: página do produto">
          <Wordmark size="small" decorative />
          <span className={styles.product}>Flow</span>
        </Link>
        <header className={ui.head}>
          <h1 className={ui.title}>{title}</h1>
          <p className={ui.lead}>{lead}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
