"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import styles from "@/components/maintenance/Admin.module.css";

/*
  O erro de qualquer página de Cobranças. `retry` é o nome desta versão do
  Next para o que era `reset` — tentar de novo sem recarregar a página.
*/
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("cobranças:", error);
  }, [error]);

  return (
    <main className={styles.page} data-surface="paper">
      <div className={styles.notice}>
        <p className="type-chapter">Não foi possível carregar esta página</p>
        <p className="type-body">Tente de novo. Se continuar, verifique a configuração do Supabase.</p>
        <div className={styles.rowActions}>
          <Button size="sm" onClick={retry}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </main>
  );
}
