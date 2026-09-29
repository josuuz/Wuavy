"use client";

import { useState } from "react";

import { deleteProcedure, saveProcedure } from "@/lib/flow/actions";
import { brl } from "@/lib/flow/format";
import { lotStatus } from "@/lib/flow/insights";
import { PROCEDURE_CATEGORIES, type Procedure } from "@/lib/flow/types";
import { DeleteButton, Field, FormError, reais, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* The catalogue, and what each procedure uses: the link between the chair and the stock. */

const CATEGORY = { facial: "Facial", injetaveis: "Injetáveis", corporal: "Corporal" };

export function Procedures() {
  const { data, live } = useFlow();
  // null: closed; "new": a new procedure; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const current = data.procedures.find((p) => p.id === editing);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Procedimentos</h1>
        <p className={styles.lead}>
          Valor, duração e o que cada procedimento consome. É essa relação que deixa o Flow ligar o estoque à agenda.
        </p>
        {live ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setEditing("new")}>
              Novo procedimento
            </button>
          </div>
        ) : null}
      </header>

      {live && data.procedures.length === 0 ? (
        <p className={styles.fine}>Nenhum procedimento cadastrado. Comece pelo catálogo: leads e agenda usam ele.</p>
      ) : null}

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
              {uses.length ? (
                <>
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
                </>
              ) : null}
              {live ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.quiet} onClick={() => setEditing(procedure.id)}>
                    Editar
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {live ? (
        <Sheet
          open={editing !== null}
          onClose={() => setEditing(null)}
          title={current?.name ?? "Novo procedimento"}
          kicker="Procedimento"
        >
          <ProcedureForm key={editing} procedure={current} onDone={() => setEditing(null)} />
        </Sheet>
      ) : null}
    </div>
  );
}

function ProcedureForm({ procedure, onDone }: { procedure?: Procedure; onDone: () => void }) {
  const { pending, error, write, submit } = useWrite();
  return (
    <form className={styles.form} onSubmit={submit((form) => saveProcedure(procedure?.id ?? null, form), onDone)}>
      <Field label="Nome">
        <input className={styles.input} name="name" required maxLength={200} defaultValue={procedure?.name} autoComplete="off" />
      </Field>
      <Field label="Categoria">
        <select className={styles.input} name="category" defaultValue={procedure?.category ?? "facial"}>
          {PROCEDURE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY[category]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Valor (R$)">
        <input
          className={styles.input}
          name="price"
          required
          inputMode="decimal"
          defaultValue={procedure ? reais(procedure.price) : undefined}
        />
      </Field>
      <Field label="Duração (min)">
        <input className={styles.input} name="durationMin" type="number" required min={1} step={1} defaultValue={procedure?.durationMin} />
      </Field>
      <Field label="Retorno típico (dias)">
        <input className={styles.input} name="returnDays" type="number" required min={1} step={1} defaultValue={procedure?.returnDays} />
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {procedure ? "Salvar" : "Criar procedimento"}
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
        {procedure ? (
          <DeleteButton
            confirm="Excluir este procedimento"
            pending={pending}
            onDelete={() => write(() => deleteProcedure(procedure.id), onDone)}
          />
        ) : null}
      </div>
    </form>
  );
}
