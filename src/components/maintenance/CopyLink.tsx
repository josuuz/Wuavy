"use client";

import { useState } from "react";

import styles from "./Admin.module.css";

/*
  O link individual de um cliente, pronto para colar numa conversa. Mostra o
  endereço inteiro: o que vai ser enviado é o que está escrito.
*/

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão para a área de transferência: o endereço está à vista para copiar à mão.
      setCopied(false);
    }
  };

  return (
    <span className={styles.rowActions}>
      <span className={styles.link}>{url}</span>
      <button type="button" className={styles.ghost} onClick={copy}>
        {copied ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
