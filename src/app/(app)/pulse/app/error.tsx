"use client";

import { useEffect } from "react";

import ui from "@/components/flow/demo/ui.module.css";

/* One screen failed: the menu stays, the rest of the Pulse keeps working. */

export default function ScreenError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section className={ui.panel} role="alert">
      <h1 className={ui.title}>Esta tela não carregou.</h1>
      <p className={ui.lead}>Os dados da clínica estão seguros. Tente de novo ou abra outra tela pelo menu.</p>
      <div className={ui.actions}>
        <button type="button" className={ui.primary} onClick={retry}>
          Tentar de novo
        </button>
      </div>
      {error.digest ? <p className={ui.fine}>Código para o suporte: {error.digest}</p> : null}
    </section>
  );
}
