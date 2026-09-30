"use client";

import { brl, relDay } from "@/lib/flow/format";
import type { AutomationRule } from "@/lib/flow/types";
import { Intro } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* Automations as flows: when, if, do. A preview: nothing here sends a message. */

export function Automations() {
  const { data, live } = useFlow();
  const active = data.automationRules.filter((r) => r.active).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Automações</h1>
        <p className={styles.lead}>
          {data.automationRules.length
            ? `${active} de ${data.automationRules.length} ativas. `
            : ""}
          Cada uma observa um sinal da clínica e prepara o próximo passo para a equipe.
        </p>
      </header>

      {data.automationRules.length === 0 ? (
        <Intro title="Como funciona">
          As automações preparam o próximo passo sozinhas: lembrete na véspera, cuidado depois do atendimento, convite de
          retorno e follow-up de orçamento. Elas usam o retorno e a duração de cada procedimento.
        </Intro>
      ) : null}

      <p className={styles.preview} role="note">
        <strong>Preview.</strong> As automações mostram o que o Flow faria: nenhuma mensagem é enviada e nenhuma integração com
        WhatsApp está ativa {live ? "ainda" : "nesta demo"}.
      </p>

      <ol className={styles.rules}>
        {data.automationRules.map((rule) => (
          <Rule key={rule.id} rule={rule} />
        ))}
      </ol>
    </div>
  );
}

function Rule({ rule }: { rule: AutomationRule }) {
  const { data, dispatch } = useFlow();
  const runs = data.automationRuns.filter((r) => r.ruleId === rule.id).slice(0, 2);
  const steps: [string, string[]][] = [
    ["Quando", [rule.when]],
    ["Se", rule.conditions],
    ["Faça", rule.actions],
  ];

  return (
    <li className={styles.rule} data-active={rule.active ? "" : undefined}>
      <header className={styles.ruleHead}>
        <h2 className={styles.ruleName}>{rule.name}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={rule.active}
          aria-label={`${rule.name}: ${rule.active ? "ativa" : "pausada"}`}
          className={styles.switch}
          onClick={() => dispatch({ type: "toggleRule", id: rule.id })}
        >
          <span aria-hidden="true" />
          {rule.active ? "Ativa" : "Pausada"}
        </button>
      </header>

      <ol className={styles.flowSteps}>
        {steps.map(([label, items]) => (
          <li key={label}>
            <span className={styles.stepLabel}>{label}</span>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {runs.length ? (
        <div className={styles.runs}>
          <p className={styles.label}>Últimas execuções</p>
          <ul>
            {runs.map((run) => (
              <li key={run.id}>
                <span className={styles.when}>{relDay(data.now, run.ranAt)}</span>
                <span>
                  {run.summary}
                  {run.recovered ? <strong> · {brl(run.recovered)}</strong> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
