import Link from "next/link";

import ui from "../demo/ui.module.css";
import styles from "./AuthFrame.module.css";

/*
  O onboarding só abre com o pagamento CONFIRMADO pelo Mercado Pago (lib/flow/billing.ts,
  paymentEvidence): o status sozinho já diz "ativo" para uma assinatura autorizada cujo
  primeiro débito ainda não foi aprovado. Enquanto isso, esta tela no lugar do formulário
  — nada de preencher a clínica inteira para ser recusado no envio.

  `unavailable`: não foi possível perguntar (o Mercado Pago não respondeu). Diz isso, em vez
  de afirmar que o pagamento não existe, e nunca manda pagar de novo.
*/
export function AwaitingPayment({ unavailable }: { unavailable: boolean }) {
  return (
    <section className={styles.state} aria-live="polite">
      <h1 className={ui.title}>Aguardando a confirmação do pagamento.</h1>
      <p className={ui.lead}>
        {unavailable
          ? "Não conseguimos falar com o Mercado Pago agora para confirmar o seu pagamento."
          : "O Mercado Pago ainda não confirmou o pagamento desta assinatura."}{" "}
        Assim que ele confirmar, você configura a clínica por aqui. Você não precisa pagar de novo.
      </p>
      {/* prefetch desligado: o clique tem de re-renderizar a página no servidor e perguntar de novo, não servir uma cópia. */}
      <Link href="/clinavy/comecar" prefetch={false} className={ui.primary}>
        Verificar de novo
      </Link>
    </section>
  );
}
