"use client";

import { useState } from "react";

import { deleteProcedure, saveProcedure } from "@/lib/flow/actions";
import { brl, units } from "@/lib/flow/format";
import { lotStatus } from "@/lib/flow/insights";
import { PROCEDURE_CATEGORIES, type Procedure } from "@/lib/flow/types";
import { CATEGORY_LABEL } from "../copy";
import { DeleteButton, Field, FormError, Intro, reais, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  The catalogue. Each procedure's price, duration and recommended return
  feed the agenda and the automations; the products it consumes link a
  finished visit to the stock. That is what lets the Pulse connect patient,
  agenda, stock and next return when a visit is done.
*/

/** What finishing one visit sets off, and which part of the procedure drives each step. */
const CHAIN = [
  { what: "Atendimento concluído", from: "finalizado na agenda" },
  { what: "Baixa o estoque", from: "pelos produtos consumidos, do lote que vence primeiro" },
  { what: "Calcula o próximo retorno", from: "pelo retorno recomendado do procedimento" },
  { what: "Inicia o pós-atendimento", from: "mensagem de cuidado, pela automação" },
  { what: "Cria a futura oportunidade", from: "convite de retorno quando a data se aproxima" },
];

/** The automations every procedure feeds, by the rule kind that runs them. */
const LINKED = [
  { kind: "reminder", label: () => "Lembrete na véspera" },
  { kind: "post_visit", label: () => "Cuidado pós-atendimento" },
  { kind: "patient_return", label: (p: Procedure) => `Convite de retorno em ${p.returnDays} dias` },
] as const;

export function Procedures() {
  const { data, editable } = useFlow();
  // null: closed; "new": a new procedure; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const current = data.procedures.find((p) => p.id === editing);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Procedimentos</h1>
        <p className={styles.lead}>
          Preço, duração e retorno recomendado de cada procedimento alimentam a agenda e as automações. Os produtos consumidos
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
                <strong>{step.what}</strong>
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
              {cost ? (
                <p className={styles.fine}>
                  Custo em produtos ≈ {brl(cost)} por atendimento · margem ≈ {brl(procedure.price - cost)}
                </p>
              ) : null}
              <p className={styles.label}>Automações ligadas</p>
              <ul className={styles.linked}>
                {LINKED.map((link) => {
                  const rule = data.automationRules.find((r) => r.kind === link.kind);
                  return (
                    <li key={link.kind} data-active={rule?.active ? "" : undefined}>
                      {link.label(procedure)}
                      <span className="sr-only">{rule ? (rule.active ? ", ativa" : ", pausada") : ", preparada"}</span>
                    </li>
                  );
                })}
              </ul>
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
  const update = (key: number, change: Partial<{ productId: string; quantity: string }>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  return (
    <form className={styles.form} onSubmit={submit((form) => saveProcedure(procedure?.id ?? null, form), onDone)}>
      <Field label="Nome">
        <input className={styles.input} name="name" required maxLength={200} defaultValue={procedure?.name} autoComplete="off" />
      </Field>
      <Field label="Categoria">
        <select className={styles.input} name="category" defaultValue={procedure?.category ?? "facial"}>
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
          defaultValue={procedure ? reais(procedure.price) : undefined}
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

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Produtos consumidos por atendimento</legend>
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
