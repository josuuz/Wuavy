"use client";

import { useActionState } from "react";

import styles from "@/components/maintenance/Admin.module.css";
import type { InvestigateState } from "@/app/(care)/cobrancas/lancamentos/actions";

/*
  Uma cobrança travada (creation_blocked_at), e as duas únicas saídas que
  existem: reconciliação manual com um id de Preference já conhecido, ou a
  investigação automática (que só recupera uma correspondência inequívoca —
  nunca libera para uma criação nova). As duas mostram o resultado de
  verdade, nunca "sucesso" quando a investigação continuou travada ou falhou
  (actions.ts: InvestigateState, reconcile(), release()).
*/

type Action = (state: InvestigateState, form: FormData) => Promise<InvestigateState>;

interface BlockedChargeInvestigationProps {
  chargeId: string;
  reconcileAction: Action;
  releaseAction: Action;
}

export function BlockedChargeInvestigation({ chargeId, reconcileAction, releaseAction }: BlockedChargeInvestigationProps) {
  const [reconcileState, submitReconcile, reconcilePending] = useActionState(reconcileAction, null);
  const [releaseState, submitRelease, releasePending] = useActionState(releaseAction, null);

  return (
    <details>
      <summary className={styles.ghost} style={{ display: "inline", cursor: "pointer" }}>
        Travada — reconciliar
      </summary>
      <div className={styles.notice}>
        <p className="type-body">
          Resultado incerto numa tentativa anterior. Confira no painel do Mercado Pago pela referência <code>{chargeId}</code>.
        </p>

        <form action={submitReconcile} className={styles.rowActions}>
          <input type="hidden" name="charge_id" value={chargeId} />
          <input name="preference_id" className={styles.input} placeholder="id da Preference encontrada" />
          <button type="submit" className={styles.ghost} disabled={reconcilePending} aria-busy={reconcilePending || undefined}>
            {reconcilePending ? "Salvando…" : "Salvar"}
          </button>
        </form>
        {reconcileState ? (
          <p className="type-body" role="status">
            {reconcileState.ok ? "✓ " : "Não salvo: "}
            {reconcileState.message}
          </p>
        ) : null}

        <form action={submitRelease} className={styles.rowActions}>
          <input type="hidden" name="id" value={chargeId} />
          <p className="type-body">
            Este botão procura, no Mercado Pago, uma Preference ou pagamento para esta referência. Se achar uma Preference
            válida, ela é recuperada automaticamente — a cobrança nunca precisa ser liberada para outra tentativa. Se não
            achar nada (ou a consulta falhar), a cobrança continua travada: ausência de resultado nunca prova que nada foi
            criado, então este botão não libera para uma criação nova.
          </p>
          <button type="submit" className={styles.ghost} disabled={releasePending} aria-busy={releasePending || undefined}>
            {releasePending ? "Investigando…" : "Investigar e recuperar, se encontrar"}
          </button>
        </form>
        {releaseState ? (
          <p className="type-body" role="status">
            {releaseState.ok ? "✓ " : "Continua travada: "}
            {releaseState.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
