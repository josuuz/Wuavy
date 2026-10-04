"use client";

import Link from "next/link";

import { AUTOMATION_EXAMPLES, viewHref } from "../copy";
import { Soon } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Automations as flows: when, if, do. Not built yet, and said so: the
  screen shows what each one will do, marked "Em breve", and nothing here
  runs or sends anything. What already works is one screen away: the same
  fronts in Oportunidades, prepared for a person to send.
*/

export function Automations() {
  const { base } = useFlow();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          Automações inteligentes <Soon />
        </h1>
        <p className={styles.lead}>
          O Pulse vai acompanhar cada sinal da clínica sozinho e preparar o próximo contato na hora certa. Ainda não estão
          disponíveis: nenhuma automação roda e nenhuma mensagem é enviada sozinha.
        </p>
      </header>

      <section className={styles.intro} aria-label="O que já funciona">
        <p className={styles.kicker}>Já funciona hoje</p>
        <p className={styles.introText}>
          As mesmas frentes aparecem em Oportunidades, calculadas com os dados da clínica: o Pulse identifica, recomenda e
          prepara cada mensagem; você revisa e envia pelo WhatsApp.
        </p>
        <div className={styles.actions}>
          <Link href={viewHref("oportunidades", base)} className={styles.primary}>
            Abrir Oportunidades
          </Link>
        </div>
      </section>

      <h2 className={styles.label}>Exemplos do que será possível</h2>
      <ol className={styles.rules}>
        {AUTOMATION_EXAMPLES.map((rule) => (
          <li key={rule.name} className={styles.rule} data-example="">
            <header className={styles.ruleHead}>
              <h3 className={styles.ruleName}>{rule.name}</h3>
              <Soon />
            </header>
            <ol className={styles.flowSteps}>
              {(
                [
                  ["Quando", [rule.when]],
                  ["Se", rule.conditions],
                  ["Faça", rule.actions],
                ] as const
              ).map(([label, items]) => (
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
          </li>
        ))}
      </ol>
    </div>
  );
}
