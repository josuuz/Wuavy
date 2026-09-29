"use client";

import { brl } from "@/lib/flow/format";
import { lotStatus } from "@/lib/flow/insights";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* The catalogue, and what each procedure uses: the link between the chair and the stock. */

const CATEGORY = { facial: "Facial", injetaveis: "Injetáveis", corporal: "Corporal" };

export function Procedures() {
  const { data } = useFlow();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Procedimentos</h1>
        <p className={styles.lead}>
          Valor, duração e o que cada procedimento consome. É essa relação que deixa o Flow ligar o estoque à agenda.
        </p>
      </header>

      <ol className={styles.catalog}>
        {data.procedures.map((procedure) => {
          const uses = data.procedureProducts.filter((pp) => pp.procedureId === procedure.id);
          return (
            <li key={procedure.id} className={styles.procedure}>
              <p className={styles.kicker}>{CATEGORY[procedure.category]}</p>
              <h2 className={styles.procedureName}>{procedure.name}</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Valor</dt>
                  <dd>{brl(procedure.price)}</dd>
                </div>
                <div>
                  <dt>Duração</dt>
                  <dd>{procedure.durationMin} min</dd>
                </div>
                <div>
                  <dt>Retorno típico</dt>
                  <dd>{procedure.returnDays} dias</dd>
                </div>
              </dl>
              <p className={styles.label}>Produtos por sessão</p>
              <ul className={styles.uses}>
                {uses.map((use) => {
                  const product = data.products.find((p) => p.id === use.productId)!;
                  const near = data.lots.some((l) => l.productId === product.id && lotStatus(data, l) === "proximo");
                  return (
                    <li key={product.id}>
                      <span>{product.name}</span>
                      <span className={styles.qty}>
                        {use.quantity.toLocaleString("pt-BR")} {product.unit}
                      </span>
                      {near ? <span className={styles.dot}>Lote perto da validade</span> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
