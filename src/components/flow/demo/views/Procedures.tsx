"use client";

import { useState } from "react";

import { deleteProcedure, saveProcedure } from "@/lib/flow/actions";
import { brl, units } from "@/lib/flow/format";
import { lotStatus } from "@/lib/flow/insights";
import { PROCEDURE_CATEGORIES, type Procedure } from "@/lib/flow/types";
import { CATEGORY_LABEL } from "../copy";
import { DeleteButton, Field, FormError, Intro, reais, Soon, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  The catalogue. Each procedure's price, duration and recommended return
  feed the agenda and the opportunities; the products it consumes link a
  finished visit to the stock. That is what lets the Pulse connect patient,
  agenda, stock and next return when a visit is done.
*/

/** What finishing one visit sets off, and which part of the procedure drives each step. `soon`: not built yet. */
const CHAIN = [
  { what: "Atendimento concluído", from: "finalizado na agenda" },
  { what: "Baixa o estoque", from: "pelos produtos consumidos, do lote que vence primeiro" },
  { what: "Calcula o próximo retorno", from: "pelo retorno recomendado do procedimento" },
  { what: "Cria a futura oportunidade", from: "o retorno entra em Oportunidades quando a data se aproxima" },
  { what: "Pós-atendimento automático", from: "mensagem de cuidado depois do atendimento", soon: true },
];

/** Specialties whose procedures rarely fit the aesthetic categories. */
const OTHER_FIRST = new Set(["odontologia", "outro"]);

/** Below this margin (after products only), the procedure is flagged. */
const THIN_MARGIN = 30;

export function Procedures() {
  const { data, editable: live, can } = useFlow();
  // The catalogue is the owner's to change; everyone reads it. Costs and margins are the owner's only.
  const editable = live && can.procedures;
  // null: closed; "new": a new procedure; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const current = data.procedures.find((p) => p.id === editing);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Procedimentos</h1>
        <p className={styles.lead}>
          Preço, duração e retorno recomendado de cada procedimento alimentam a agenda e as oportunidades. Os produtos consumidos
          fazem o estoque baixar sozinho quando um atendimento é finalizado.
        </p>
        {editable ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setEditing("new")}>
              Novo procedimento
            </button>
          </div>
        ) : null}
      </header>

      {data.procedures.length ? (
        <section aria-labelledby="cadeia" className={styles.chainBlock}>
          <h2 id="cadeia" className={styles.label}>
            O que um atendimento finalizado põe em movimento
          </h2>
          <ol className={styles.chain} data-steps="5">
            {CHAIN.map((step) => (
              <li key={step.what}>
                <strong>
                  {step.what}
                  {step.soon ? <Soon /> : null}
                </strong>
                <span>{step.from}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {data.procedures.length === 0 ? (
        <Intro
          title="Comece pelo catálogo"
          action={
            editable ? (
              <button type="button" className={styles.primary} onClick={() => setEditing("new")}>
                Cadastrar o primeiro
              </button>
            ) : null
          }
        >
          Cadastre o que a clínica oferece. O preço entra nos orçamentos, a duração ocupa a agenda e o retorno recomendado diz
          ao Pulse quando convidar o paciente de volta.
        </Intro>
      ) : null}

      <ol className={styles.catalog}>
        {data.procedures.map((procedure) => {
          const uses = data.procedureProducts.filter((pp) => pp.procedureId === procedure.id);
          const cost = Math.round(
            uses.reduce((s, u) => s + u.quantity * (data.products.find((p) => p.id === u.productId)?.unitCost ?? 0), 0),
          );
          return (
            <li key={procedure.id} className={styles.procedure}>
              <p className={styles.kicker}>{CATEGORY_LABEL[procedure.category]}</p>
              <h2 className={styles.procedureName}>{procedure.name}</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Preço</dt>
                  <dd>{brl(procedure.price)}</dd>
                </div>
                <div>
                  <dt>Duração</dt>
                  <dd>{procedure.durationMin} min</dd>
                </div>
                <div>
                  <dt>Retorno</dt>
                  <dd>{procedure.returnDays} dias</dd>
                </div>
              </dl>
              <p className={styles.label}>Consome por atendimento</p>
              {uses.length ? (
                <ul className={styles.uses}>
                  {uses.map((use) => {
                    const product = data.products.find((p) => p.id === use.productId);
                    if (!product) return null;
                    const near = data.lots.some(
                      (l) => l.productId === product.id && l.quantity > 0 && lotStatus(data, l) === "proximo",
                    );
                    return (
                      <li key={product.id}>
                        <span>{product.name}</span>
                        <span className={styles.qty}>{units(use.quantity, product.unit)}</span>
                        {near ? <span className={styles.dot}>Lote perto da validade</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.fine}>Nenhum produto ligado: finalizar não mexe no estoque.</p>
              )}
              {can.finance ? (
                <details className={styles.costs}>
                  <summary>Custos e margem</summary>
                  <Margin price={procedure.price} cost={cost} linked={uses.length > 0} />
                </details>
              ) : null}
              {editable ? (
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

      {editable ? (
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
  const { data } = useFlow();
  const { pending, error, write, submit } = useWrite();
  const [rows, setRows] = useState(() => {
    const uses = procedure ? data.procedureProducts.filter((pp) => pp.procedureId === procedure.id) : [];
    return uses.map((u, i) => ({ key: i, productId: u.productId, quantity: String(u.quantity).replace(".", ",") }));
  });
  const [next, setNext] = useState(rows.length);
  const [price, setPrice] = useState(procedure ? reais(procedure.price) : "");
  const priceCents = Math.round(Number(price.replace(/[R$\s.]/g, "").replace(",", ".")) * 100) || 0;
  const cost = Math.round(
    rows.reduce((sum, r) => {
      const unitCost = data.products.find((p) => p.id === r.productId)?.unitCost ?? 0;
      const qty = Number(r.quantity.replace(",", "."));
      return sum + (Number.isFinite(qty) ? qty * unitCost : 0);
    }, 0),
  );
  const update = (key: number, change: Partial<{ productId: string; quantity: string }>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  return (
    <form className={styles.form} onSubmit={submit((form) => saveProcedure(procedure?.id ?? null, form), onDone)}>
      <Field label="Nome">
        <input className={styles.input} name="name" required maxLength={200} defaultValue={procedure?.name} autoComplete="off" />
      </Field>
      <Field label="Categoria">
        <select
          className={styles.input}
          name="category"
          defaultValue={procedure?.category ?? (OTHER_FIRST.has(data.organization.segment) ? "outro" : "facial")}
        >
          {PROCEDURE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Preço (R$)">
        <input
          className={styles.input}
          name="price"
          required
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </Field>
      <div className={styles.twoFields}>
        <Field label="Duração (min)">
          <input className={styles.input} name="durationMin" type="number" required min={1} step={1} defaultValue={procedure?.durationMin} />
        </Field>
        <Field label="Retorno recomendado (dias)">
          <input className={styles.input} name="returnDays" type="number" required min={1} step={1} defaultValue={procedure?.returnDays} />
        </Field>
      </div>

      <details className={styles.costs} open={rows.length > 0}>
        <summary>Custos e margem</summary>
        <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Produtos usados por atendimento</legend>
        {data.products.length ? (
          <>
            {rows.map((row) => {
              const product = data.products.find((p) => p.id === row.productId);
              return (
                <div key={row.key} className={styles.useRow}>
                  <label className="sr-only" htmlFor={`use-${row.key}`}>
                    Produto
                  </label>
                  <select
                    id={`use-${row.key}`}
                    className={styles.input}
                    name="useProduct"
                    value={row.productId}
                    required
                    onChange={(event) => update(row.key, { productId: event.target.value })}
                  >
                    <option value="" disabled>
                      Escolha o produto
                    </option>
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor={`qty-${row.key}`}>
                    Quantidade{product ? ` em ${product.unit}` : ""}
                  </label>
                  <input
                    id={`qty-${row.key}`}
                    className={styles.input}
                    name="useQuantity"
                    inputMode="decimal"
                    required
                    placeholder={product?.unit ?? "qtd."}
                    value={row.quantity}
                    onChange={(event) => update(row.key, { quantity: event.target.value })}
                  />
                  <button type="button" className={styles.quiet} onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
                    Tirar
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setRows([...rows, { key: next, productId: "", quantity: "" }]);
                setNext(next + 1);
              }}
            >
              Adicionar produto
            </button>
            <p className={styles.fine}>Quando um atendimento é finalizado, o Pulse dá baixa dessas quantidades no estoque.</p>
          </>
        ) : (
          <p className={styles.fine}>Nenhum produto cadastrado ainda. Faça uma entrada em Estoque para ligar produtos a este procedimento.</p>
        )}
        </fieldset>
        <Margin price={priceCents} cost={cost} linked={rows.some((r) => r.productId)} />
      </details>

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

/**
 * What a procedure leaves today: price, product cost at today's purchase
 * prices, gross profit, margin. For pricing only: finished visits keep the
 * cost of their own day (Indicadores). A warning only at a loss or a thin margin.
 */
function Margin({ price, cost, linked }: { price: number; cost: number; linked: boolean }) {
  if (!linked) return <p className={styles.fine}>Ligue os produtos usados para o Pulse calcular o custo e a margem.</p>;
  // In whole reais, as shown, so price − cost = profit on screen too.
  const shownCost = Math.round(cost / 100) * 100;
  const profit = price - shownCost;
  const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Preço</dt>
          <dd>{brl(price)}</dd>
        </div>
        <div>
          <dt>Custo hoje</dt>
          <dd>{brl(shownCost)}</dd>
        </div>
        <div>
          <dt>Lucro</dt>
          <dd>{brl(profit)}</dd>
        </div>
        <div>
          <dt>Margem</dt>
          <dd>{price > 0 ? `${margin}%` : "—"}</dd>
        </div>
      </dl>
      {profit < 0 ? (
        <p className={styles.flag}>Prejuízo: o custo dos produtos passa do preço cobrado.</p>
      ) : price > 0 && margin < THIN_MARGIN ? (
        <p className={styles.flag}>Margem baixa: abaixo de {THIN_MARGIN}% depois dos produtos.</p>
      ) : null}
      <p className={styles.fine}>
        Pelo preço de compra atual dos produtos; mão de obra, taxas e aluguel não entram na conta. Atendimentos já finalizados
        guardam o custo do dia em que foram feitos.
      </p>
    </>
  );
}
