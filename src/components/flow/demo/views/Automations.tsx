"use client";

import { setRuleActive } from "@/lib/flow/actions";
import { brl, daysFrom, plural, relDay } from "@/lib/flow/format";
import { valueDelivered } from "@/lib/flow/insights";
import type { AutomationRule } from "@/lib/flow/types";
import { FormError, Intro, useWrite } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Automations as flows: when, if, do. Each one watches a signal and
  prepares the next step for the team; what they brought back leads the
  screen. A preview: nothing here sends a message.
*/

export function Automations() {
  const { data, ops, live } = useFlow();
  const active = data.automationRules.filter((r) => r.active).length;
  const value = valueDelivered(data, ops);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Automações</h1>
        <p className={styles.lead}>
          {data.automationRules.length ? `${active} de ${data.automationRules.length} ativas. ` : ""}
          Cada uma observa um sinal da clínica e prepara o próximo passo para a equipe aprovar.
        </p>
      </header>

      {data.automationRules.length === 0 ? (
        <Intro title="Como funciona">
          As automações preparam o próximo passo sozinhas: lembrete na véspera, cuidado depois do atendimento, convite de
          retorno e follow-up de orçamento. Elas usam o retorno e a duração de cada procedimento.
        </Intro>
      ) : live && !value.revenue ? (
        <p className={styles.lead}>Escolha um modelo e ative. O impacto de cada automação aparece aqui conforme ela trabalha.</p>
      ) : (
        <section className={styles.value} aria-labelledby="impacto">
          <h2 id="impacto" className={styles.valueTitle}>
            <span className="pulse-dot" aria-hidden="true" />
            Impacto das automações <span>últimos 30 dias</span>
          </h2>
          <dl className={styles.valueGrid} data-cols="4">
            <div data-main="">
              <dt>Receita recuperada</dt>
              <dd>{brl(value.revenue)}</dd>
            </div>
            <div>
              <dt>Pacientes recuperados</dt>
              <dd>{value.patients}</dd>
            </div>
            <div>
              <dt>Horários preenchidos</dt>
              <dd>{value.slots}</dd>
            </div>
            <div>
              <dt>Orçamentos e leads retomados</dt>
              <dd>{value.quotes + value.leads}</dd>
            </div>
          </dl>
          {live ? null : <p className={styles.fine}>Ilustrativo: calculado sobre os dados fictícios da demo.</p>}
        </section>
      )}

      <p className={styles.preview} role="note">
        <strong>Preview.</strong> As automações mostram o que o Pulse faria: nenhuma mensagem é enviada e nenhuma integração com
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
  const { data, dispatch, access, live } = useFlow();
  const { pending, error, write } = useWrite();
  // A real clinic's switch is saved; the demo's lives in memory.
  const toggle = () => (live ? write(() => setRuleActive(rule.id, !rule.active)) : dispatch({ type: "toggleRule", id: rule.id }));
  const runs = data.automationRuns.filter((r) => r.ruleId === rule.id);
  const month = runs.filter((r) => daysFrom(data.now, r.ranAt) >= -30);
  const brought = month.reduce((s, r) => s + r.recovered, 0);
  const people = month.reduce((s, r) => s + (r.converted ?? (r.recovered ? 1 : 0)), 0);
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
          disabled={!access.canEdit || pending}
          onClick={toggle}
        >
          <span aria-hidden="true" />
          {rule.active ? "Ativa" : "Pausada"}
        </button>
      </header>
      <FormError error={error} />

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

      {brought ? (
        <p className={styles.ruleImpact}>
          <strong>{brl(brought)}</strong> recuperados em 30 dias
          {people ? ` · ${plural(people, "conversão", "conversões")}` : ""}
        </p>
      ) : null}

      {runs.length ? (
        <div className={styles.runs}>
          <p className={styles.label}>Últimas execuções</p>
          <ul>
            {runs.slice(0, 2).map((run) => (
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
