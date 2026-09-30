"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./ui.module.css";

interface SheetProps {
  open: boolean;
  /** A whole record on one page (a patient): wider on large screens. */
  wide?: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * A side panel for one record (a lead, a patient) or for the assistant: a
 * native modal <dialog>, so focus, Escape and the page behind come for free.
 * From the right on wide screens, from the bottom on phones.
 */
export function Sheet({ open, wide, onClose, title, kicker, icon, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? `${styles.sheet} ${styles.sheetWide}` : styles.sheet}
      data-surface="graphite"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheetInner}>
        <header className={styles.sheetHead}>
          {icon}
          <div>
            {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
            <h2 className={styles.sheetTitle}>{title}</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Fechar
          </button>
        </header>
        {open ? children : null}
      </div>
    </dialog>
  );
}
