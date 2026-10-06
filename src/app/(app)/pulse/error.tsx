"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import ui from "@/components/flow/demo/ui.module.css";

/*
  When the Pulse itself cannot open (the clinic's data did not load, a door
  failed): a plain way back instead of a broken page. Nothing of the error is
  shown; its digest, when there is one, is a code to give support.
*/

export default function PulseError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <AuthFrame title="Não foi possível abrir o Pulse agora." lead="Seus dados estão seguros. Tente de novo em alguns segundos.">
      <div className={ui.actions}>
        <button type="button" className={ui.primary} onClick={retry}>
          Tentar de novo
        </button>
        <Link href="/pulse" className={ui.quiet}>
          Voltar à página do Pulse
        </Link>
      </div>
      {error.digest ? <p className={ui.fine}>Código para o suporte: {error.digest}</p> : null}
    </AuthFrame>
  );
}
