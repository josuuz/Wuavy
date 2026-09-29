"use client";

import Link from "next/link";
import { useRef, type CSSProperties } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import type { NavItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import styles from "./MobileMenu.module.css";

interface MobileMenuProps {
  nav: NavItem[];
  cta: { label: string; href: string };
}

/**
 * Full-screen menu on a native modal <dialog>: focus is trapped, Escape
 * closes it and focus returns to the button, with no extra code.
 * Links propagate in, 42 ms apart.
 */
export function MobileMenu({ nav, cta }: MobileMenuProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Menu
      </button>

      <dialog ref={dialog} className={styles.dialog} data-surface="black" aria-label="Menu">
        <div className={styles.top}>
          <Link href="/" className={styles.brand} onClick={close} aria-label="WUAVY, página inicial">
            <Wordmark size="small" decorative />
          </Link>
          <button type="button" className={styles.trigger} onClick={close} autoFocus>
            Fechar
          </button>
        </div>

        <nav aria-label="Menu principal" className={styles.nav}>
          <ul>
            {nav.map((item, i) => (
              <li key={item.href} style={{ "--i": i } as CSSProperties}>
                <Link href={item.href} className={cn(styles.link, item.hint && styles.product)} onClick={close}>
                  {item.label}
                  {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.bottom}>
          <Button href={cta.href} onClick={close}>
            {cta.label}
          </Button>
        </div>
      </dialog>
    </>
  );
}
