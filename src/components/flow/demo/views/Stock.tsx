"use client";

import { useState } from "react";

import { adjustLot, saveProduct, stockIn, type Result } from "@/lib/flow/actions";
import { brl, daysFrom, plural, units } from "@/lib/flow/format";
import {
  expiryOpportunities,
  lotStatus,
  lotValue,
  lowStock,
  proceduresUsing,
  stockLevels,
  type LotStatus,
} from "@/lib/flow/insights";
import type { ID, InventoryLot, Product } from "@/lib/flow/types";
import { ADJUST_REASONS, UNITS } from "../copy";
import { Field, FocusLink, FormError, Intro, reais, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Stock, read as money. A lot near its date is not a number to watch: the
  Pulse finds the procedures that use it and the patients who already did
  them, and says what using it in time would bring. Then what to buy, what
  needs a look (below the clinic's own minimum, when it set one), every
  product and every lot, with a way to receive a delivery, to set a lot to
  what is really on the shelf, and to edit a product.
*/

const STATUS: Record<LotStatus, string> = {
  vencido: "Vencido",
  proximo: "Perto da validade",
  atencao: "Atenção",
  normal: "Normal",
};
const ORDER: Record<LotStatus, number> = { vencido: 0, proximo: 1, atencao: 2, normal: 3 };

const expiry = (days: number) => (days < 0 ? `venceu há ${plural(-days, "dia", "dias")}` : `em ${plural(days, "dia", "dias")}`);

/** "12,5" or "3" to a number; NaN when it is not one. */
const toNumber = (value: string) => Number(value.trim().replace(",", "."));
/** "2,5" for a form field. */
const decimal = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

export function Stock() {
  const { data, editable } = useFlow();
  const [entering, setEntering] = useState(false);
  const [adjusting, setAdjusting] = useState<ID | null>(null);
  const [editing, setEditing] = useState<ID | null>(null);
  const levels = stockLevels(data);
  const edited = data.products.find((p) => p.id === editing);
  const near = expiryOpportunities(data);
  const low = lowStock(data);
  const watch = data.lots.filter((l) => l.quantity > 0 && (lotStatus(data, l) === "vencido" || lotStatus(data, l) === "atencao"));
  const lots = data.lots
    .filter((l) => l.quantity > 0)
    .sort((a, b) => ORDER[lotStatus(data, a)] - ORDER[lotStatus(data, b)] || a.expiresAt.localeCompare(b.expiresAt));
  const adjusted = data.lots.find((l) => l.id === adjusting);
  const productOf = (lot: InventoryLot) => data.products.find((p) => p.id === lot.productId);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Estoque</h1>
        <p className={styles.lead}>O que comprar e o que usar antes de vencer. A cada atendimento finalizado, o Pulse dá baixa sozinho.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setEntering(true)}>
            Entrada de produto
          </button>
        </div>
      </header>

      {data.products.length === 0 ? (
        <Intro title="Como funciona">
          Registre os produtos que a clínica usa, lote por lote. O Pulse avisa o que está acabando e o que precisa ser usado
          antes de vencer.
        </Intro>
      ) : (
        <>
          {near.length ? (
            <section className={styles.expiryBlock} aria-labelledby="validade">
              <h2 id="validade" className={styles.label}>
                Produto próximo da validade <span>{near.length}</span>
              </h2>
              <ol className={styles.expiryList}>
                {near.map((x) => {
                  const days = daysFrom(data.now, x.lot.expiresAt);
                  return (
                    <li key={x.lot.id} className={styles.alertCard} data-tone="act">
                      <p className={styles.expiryHead}>
                        <strong>{x.product?.name}</strong>
                        <span className={styles.lotStatus} data-status="proximo">
                          {expiry(days)}
                        </span>
                      </p>
                      <p className={styles.fine}>
                        {units(x.lot.quantity, x.product?.unit ?? "un")} · lote {x.lot.lotCode} · {brl(lotValue(data, x.lot))} em
                        produto · usado em {x.procedures.map((p) => p.name).join(", ") || "nenhum procedimento"}
                      </p>
                      <p className={styles.expiryText}>
                        {x.patients.length ? (
                          <>
                            Existem <strong>{plural(x.patients.length, "paciente compatível", "pacientes compatíveis")}</strong> com
                            procedimentos que utilizam este produto.
                          </>
                        ) : (
                          "Nenhum paciente fez os procedimentos que usam este produto ainda."
                        )}
                      </p>
                      {x.potential ? (
                        <p className={styles.oppValue}>
                          {brl(x.potential)} <span>de receita possível antes do vencimento</span>
                        </p>
                      ) : null}
                      <FocusLink focus={{ to: "opportunity", kind: "stock_expiry" }} className={styles.primary}>
                        Ver oportunidade
                      </FocusLink>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <div className={styles.alerts} data-count="2">
            <section className={styles.alertCard} data-tone={low.length ? "act" : undefined} aria-labelledby="comprar">
              <h2 id="comprar" className={styles.label}>
                Estoque baixo <span>{low.length}</span>
              </h2>
              {low.length ? (
                <ul className={styles.alertList}>
                  {low.map((s) => (
                    <li key={s.product.id}>
                      <strong>{s.product.name}</strong>
                      <span>
                        {s.quantity > 0 ? units(s.quantity, s.product.unit) : "Sem estoque"}
                        {s.product.minQuantity !== undefined
                          ? ` · mínimo ${units(s.product.minQuantity, s.product.unit)}`
                          : s.sessions !== null && s.quantity > 0
                            ? ` · dá para ${plural(s.sessions, "atendimento", "atendimentos")}`
                            : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.fine}>Nada acabando.</p>
              )}
              {low.length ? <p className={styles.alertFoot}>Hora de comprar.</p> : null}
            </section>

            <section className={styles.alertCard} aria-labelledby="atencao">
              <h2 id="atencao" className={styles.label}>
                Precisa de atenção <span>{watch.length}</span>
              </h2>
              {watch.length ? (
                <ul className={styles.alertList}>
                  {watch.map((lot) => {
                    const product = productOf(lot);
                    const days = daysFrom(data.now, lot.expiresAt);
                    return (
                      <li key={lot.id}>
                        <strong>{product?.name}</strong>
                        <span>
                          {days < 0
                            ? `${expiry(days)}: separe e ajuste o estoque`
                            : days <= 90
                              ? `lote ${lot.lotCode} vence ${expiry(days)}: planeje o uso`
                              : `só ${units(lot.quantity, product?.unit ?? "un")} no lote ${lot.lotCode}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.fine}>Nada fora do normal.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="produtos">
            <h2 id="produtos" className={styles.label}>
              Produtos <span>{data.products.length}</span>
            </h2>
            <table className={styles.table} data-rows="">
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Em estoque</th>
                  <th scope="col">Mínimo</th>
                  <th scope="col">Custo por unidade</th>
                  <th scope="col">Usado em</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((level) => (
                  <tr key={level.product.id} data-status={level.status === "ok" ? undefined : "atencao"}>
                    <td data-label="Produto">
                      {editable ? (
                        <button type="button" className={styles.rowButton} onClick={() => setEditing(level.product.id)}>
                          {level.product.name}
                        </button>
                      ) : (
                        <strong>{level.product.name}</strong>
                      )}
                    </td>
                    <td data-label="Em estoque">{level.quantity > 0 ? units(level.quantity, level.product.unit) : "Sem estoque"}</td>
                    <td data-label="Mínimo">
                      {level.product.minQuantity !== undefined ? units(level.product.minQuantity, level.product.unit) : "—"}
                    </td>
                    <td data-label="Custo por unidade">{brl(level.product.unitCost)}</td>
                    <td data-label="Usado em">
                      {proceduresUsing(data, level.product.id)
                        .map((u) => u.procedure.name)
                        .join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <h2 className={styles.label}>Lotes</h2>
          <table className={styles.table} data-rows="">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Quantidade</th>
                <th scope="col">Lote</th>
                <th scope="col">Validade</th>
                <th scope="col">Custo aprox.</th>
                <th scope="col">Usado em</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const product = productOf(lot);
                const status = lotStatus(data, lot);
                return (
                  <tr key={lot.id} data-status={status}>
                    <td data-label="Produto">
                      <strong>{product?.name}</strong>
                    </td>
                    <td data-label="Quantidade">{units(lot.quantity, product?.unit ?? "un")}</td>
                    <td data-label="Lote">{lot.lotCode}</td>
                    <td data-label="Validade">{expiry(daysFrom(data.now, lot.expiresAt))}</td>
                    <td data-label="Custo aprox.">{brl(lotValue(data, lot))}</td>
                    <td data-label="Usado em">
                      {proceduresUsing(data, lot.productId)
                        .map((u) => u.procedure.name)
                        .join(", ") || "—"}
                    </td>
                    <td data-label="Status">
                      <span className={styles.lotStatus} data-status={status}>
                        {STATUS[status]}
                      </span>
                      <button type="button" className={styles.inlineAction} onClick={() => setAdjusting(lot.id)}>
                        Ajustar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lots.length === 0 ? <p className={styles.fine}>Nenhum lote com saldo. Faça uma entrada de produto.</p> : null}
        </>
      )}

      <Sheet open={entering} onClose={() => setEntering(false)} title="Entrada de produto" kicker="Estoque">
        <StockInForm onDone={() => setEntering(false)} />
      </Sheet>
      {editable ? (
        <Sheet open={Boolean(edited)} onClose={() => setEditing(null)} title={edited?.name ?? ""} kicker="Produto">
          {edited ? <ProductForm key={edited.id} product={edited} onDone={() => setEditing(null)} /> : null}
        </Sheet>
      ) : null}
      <Sheet
        open={Boolean(adjusted)}
        onClose={() => setAdjusting(null)}
        title={adjusted ? (productOf(adjusted)?.name ?? "") : ""}
        kicker="Ajustar estoque"
      >
        {adjusted ? <AdjustForm key={adjusted.id} lot={adjusted} onDone={() => setAdjusting(null)} /> : null}
      </Sheet>
    </div>
  );
}

function StockInForm({ onDone }: { onDone: () => void }) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, submit } = useWrite();
  const [productId, setProductId] = useState(data.products.length ? "" : "novo");
  const product = data.products.find((p) => p.id === productId);

  const demoIn = async (form: FormData): Promise<Result> => {
    const get = (key: string) => String(form.get(key) ?? "").trim();
    const quantity = toNumber(get("quantity"));
    if (!productId) return { error: "Escolha o produto." };
    if (!get("lotCode")) return { error: "Informe o lote." };
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Informe a quantidade." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(get("expiresAt"))) return { error: "Informe a validade." };
    const unitCost = Math.round(toNumber(get("unitCost").replace(/[R$\s.]/g, "")) * 100);
    if (productId === "novo" && (!get("name") || !Number.isFinite(unitCost))) return { error: "Informe o nome e o custo do produto." };
    dispatch({
      type: "stockIn",
      productId: productId === "novo" ? undefined : productId,
      product: productId === "novo" ? { name: get("name"), unit: get("unit"), unitCost } : undefined,
      lot: { lotCode: get("lotCode"), quantity, expiresAt: `${get("expiresAt")}T00:00:00.000Z` },
    });
    return {};
  };

  return (
    <form className={styles.form} onSubmit={submit(live ? stockIn : demoIn, onDone)}>
      <Field label="Produto">
        <select className={styles.input} name="productId" value={productId} required onChange={(event) => setProductId(event.target.value)}>
          <option value="" disabled>
            Escolha o produto
          </option>
          <option value="novo">+ Produto novo</option>
          {data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {productId === "novo" ? (
        <>
          <Field label="Nome do produto">
            <input className={styles.input} name="name" required maxLength={200} autoComplete="off" />
          </Field>
          <div className={styles.twoFields}>
            <Field label="Unidade">
              <select className={styles.input} name="unit" defaultValue="frasco">
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Custo por unidade (R$)">
              <input className={styles.input} name="unitCost" required inputMode="decimal" placeholder="0" />
            </Field>
          </div>
          <Field label="Estoque mínimo (opcional)">
            <input className={styles.input} name="minQuantity" inputMode="decimal" placeholder="Ex.: 2" />
          </Field>
        </>
      ) : null}
      <div className={styles.twoFields}>
        <Field label="Lote">
          <input className={styles.input} name="lotCode" required maxLength={60} autoComplete="off" />
        </Field>
        <Field label={`Quantidade${product ? ` (${product.unit})` : ""}`}>
          <input className={styles.input} name="quantity" required inputMode="decimal" placeholder="0" />
        </Field>
      </div>
      <Field label="Validade">
        <input className={styles.input} name="expiresAt" type="date" required />
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          Registrar entrada
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Sets a lot to what is really on the shelf, and says why. */
function AdjustForm({ lot, onDone }: { lot: InventoryLot; onDone: () => void }) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, submit } = useWrite();
  const product = data.products.find((p) => p.id === lot.productId);

  const demoAdjust = async (form: FormData): Promise<Result> => {
    const quantity = toNumber(String(form.get("quantity") ?? ""));
    if (!Number.isFinite(quantity) || quantity < 0) return { error: "Informe a quantidade atual." };
    dispatch({ type: "adjustLot", id: lot.id, quantity, reason: String(form.get("reason")) as keyof typeof ADJUST_REASONS });
    return {};
  };

  return (
    <form className={styles.form} onSubmit={submit(live ? (form) => adjustLot(lot.id, form) : demoAdjust, onDone)}>
      <p className={styles.note}>
        Lote {lot.lotCode}: o Pulse conta {units(lot.quantity, product?.unit ?? "un")}. Se na prateleira há outra quantidade,
        corrija aqui.
      </p>
      <Field label={`Quantidade real${product ? ` (${product.unit})` : ""}`}>
        <input
          className={styles.input}
          name="quantity"
          required
          inputMode="decimal"
          defaultValue={decimal(lot.quantity)}
        />
      </Field>
      <Field label="Motivo">
        <select className={styles.input} name="reason" defaultValue="contagem">
          {(Object.keys(ADJUST_REASONS) as (keyof typeof ADJUST_REASONS)[]).map((reason) => (
            <option key={reason} value={reason}>
              {ADJUST_REASONS[reason].charAt(0).toUpperCase() + ADJUST_REASONS[reason].slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          Salvar ajuste
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** A product's details and its minimum: at or below it, the Pulse says to buy. */
function ProductForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const { pending, error, submit } = useWrite();
  const options = UNITS.includes(product.unit) ? UNITS : [product.unit, ...UNITS];
  return (
    <form className={styles.form} onSubmit={submit((form) => saveProduct(product.id, form), onDone)}>
      <Field label="Nome do produto">
        <input className={styles.input} name="name" required maxLength={200} defaultValue={product.name} autoComplete="off" />
      </Field>
      <div className={styles.twoFields}>
        <Field label="Unidade">
          <select className={styles.input} name="unit" defaultValue={product.unit}>
            {options.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Custo por unidade (R$)">
          <input className={styles.input} name="unitCost" required inputMode="decimal" defaultValue={reais(product.unitCost)} />
        </Field>
      </div>
      <Field label={`Estoque mínimo (${product.unit})`}>
        <input
          className={styles.input}
          name="minQuantity"
          inputMode="decimal"
          placeholder="Sem mínimo"
          defaultValue={product.minQuantity !== undefined ? decimal(product.minQuantity) : undefined}
        />
      </Field>
      <p className={styles.fine}>
        Sem mínimo, o Pulse avisa quando o produto dá para menos de 5 atendimentos. A quantidade de cada lote muda em Ajustar.
      </p>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          Salvar
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
