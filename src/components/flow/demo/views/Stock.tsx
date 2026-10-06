"use client";

import { useState } from "react";

import { adjustLot, saveProduct, stockIn, type Result } from "@/lib/flow/actions";
import { brl, daysFrom, plural, units } from "@/lib/flow/format";
import {
  EXPIRY_DAYS,
  expiryOpportunities,
  lotStatus,
  lotValue,
  lowStock,
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
  them, and says what using it in time would bring. Then the products, with
  a few filters (running low, near their date, by brand) and each one's
  alert on its own row; the lots, one tap away, with a way to set one to
  what is really on the shelf.
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
  const { data, editable: live, can } = useFlow();
  // Receiving and adjusting: the front desk and the owner. Costs: the owner only (the others read none).
  const editable = live && can.stock;
  const [entering, setEntering] = useState(false);
  const [adjusting, setAdjusting] = useState<ID | null>(null);
  const [editing, setEditing] = useState<ID | null>(null);
  const [filter, setFilter] = useState<"todos" | "baixo" | "vencimento" | "vencidos">("todos");
  const [brand, setBrand] = useState("");
  const levels = stockLevels(data);
  const edited = data.products.find((p) => p.id === editing);
  const near = expiryOpportunities(data);
  const low = new Set(lowStock(data).map((s) => s.product.id));
  // The nearest date among a product's lots with something left: what "próximo do vencimento" reads.
  const nearest = (productId: ID) =>
    data.lots
      .filter((l) => l.productId === productId && l.quantity > 0)
      .reduce<string | null>((min, l) => (!min || l.expiresAt < min ? l.expiresAt : min), null);
  const daysLeft = (productId: ID) => {
    const date = nearest(productId);
    return date === null ? null : daysFrom(data.now, date);
  };
  const expiring = (productId: ID) => {
    const days = daysLeft(productId);
    return days !== null && days >= 0 && days <= EXPIRY_DAYS;
  };
  const expired = (productId: ID) => (daysLeft(productId) ?? 0) < 0;
  const brands = [...new Set(data.products.map((p) => p.brand).filter((b): b is string => Boolean(b)))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const shown = levels.filter(
    (l) =>
      (filter === "todos" ||
        (filter === "baixo"
          ? low.has(l.product.id)
          : filter === "vencidos"
            ? expired(l.product.id)
            : expiring(l.product.id))) &&
      (!brand || l.product.brand === brand),
  );
  const expiringCount = levels.filter((l) => expiring(l.product.id)).length;
  const expiredCount = levels.filter((l) => expired(l.product.id)).length;
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
        {can.stock ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setEntering(true)}>
              Entrada de produto
            </button>
          </div>
        ) : null}
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
                        {units(x.lot.quantity, x.product?.unit ?? "un")} · lote {x.lot.lotCode}
                        {can.finance ? ` · ${brl(lotValue(data, x.lot))} em produto` : ""} · usado em{" "}
                        {x.procedures.map((p) => p.name).join(", ") || "nenhum procedimento"}
                      </p>
                      <p className={styles.expiryText}>
                        {x.people ? (
                          <>
                            Encontramos <strong>{plural(x.people, "oportunidade", "oportunidades")}</strong>:{" "}
                            {[
                              x.patients.length ? plural(x.patients.length, "paciente que já fez", "pacientes que já fizeram") : "",
                              x.leads.filter((l) => l.stage !== "orcamento").length
                                ? plural(x.leads.filter((l) => l.stage !== "orcamento").length, "contato que perguntou", "contatos que perguntaram")
                                : "",
                              x.leads.filter((l) => l.stage === "orcamento").length
                                ? plural(x.leads.filter((l) => l.stage === "orcamento").length, "orçamento em aberto", "orçamentos em aberto")
                                : "",
                            ]
                              .filter(Boolean)
                              .join(", ")}
                            .
                          </>
                        ) : (
                          "Ninguém fez ou pediu os procedimentos que usam este produto ainda."
                        )}
                      </p>
                      {x.potential ? (
                        <p className={styles.oppValue}>
                          {brl(x.potential)} <span>de receita possível antes do vencimento</span>
                        </p>
                      ) : null}
                      {x.people ? (
                        <FocusLink focus={{ to: "opportunity", kind: "stock_expiry" }} className={styles.primary}>
                          Ver pessoas
                        </FocusLink>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <section aria-labelledby="produtos" className={styles.stockList}>
            <div className={styles.toolbar}>
              <h2 id="produtos" className={styles.label}>
                Produtos <span>{shown.length}</span>
              </h2>
              <div className={styles.chips} role="group" aria-label="Filtrar produtos">
                <button type="button" aria-pressed={filter === "todos"} onClick={() => setFilter("todos")}>
                  Todos
                </button>
                <button type="button" aria-pressed={filter === "baixo"} onClick={() => setFilter("baixo")}>
                  Estoque baixo{low.size ? ` · ${low.size}` : ""}
                </button>
                <button type="button" aria-pressed={filter === "vencimento"} onClick={() => setFilter("vencimento")}>
                  Próximos do vencimento{expiringCount ? ` · ${expiringCount}` : ""}
                </button>
                <button type="button" aria-pressed={filter === "vencidos"} onClick={() => setFilter("vencidos")}>
                  Vencidos{expiredCount ? ` · ${expiredCount}` : ""}
                </button>
              </div>
              {brands.length ? (
                <label className={styles.brandFilter}>
                  <span className="sr-only">Marca</span>
                  <select className={styles.input} value={brand} onChange={(event) => setBrand(event.target.value)}>
                    <option value="">Todas as marcas</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {shown.length ? (
              <table className={styles.table} data-rows="">
                <thead>
                  <tr>
                    <th scope="col">Produto</th>
                    <th scope="col">Em estoque</th>
                    <th scope="col">Mínimo</th>
                    {can.finance ? <th scope="col">Preço de compra</th> : null}
                    <th scope="col">Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((level) => {
                    const product = level.product;
                    const date = nearest(product.id);
                    const days = date ? daysFrom(data.now, date) : null;
                    const alert =
                      days !== null && days < 0 ? "vencido" : days !== null && days <= EXPIRY_DAYS ? "proximo" : low.has(product.id) ? "baixo" : null;
                    return (
                      <tr key={product.id} data-status={alert ? "atencao" : undefined}>
                        <td data-label="Produto">
                          {editable ? (
                            <button type="button" className={styles.rowButton} onClick={() => setEditing(product.id)}>
                              {product.name}
                            </button>
                          ) : (
                            <strong>{product.name}</strong>
                          )}
                          {product.brand || product.category ? (
                            <span className={styles.brand}>{[product.brand, product.category].filter(Boolean).join(" · ")}</span>
                          ) : null}
                        </td>
                        <td data-label="Em estoque">
                          {level.quantity > 0 ? units(level.quantity, product.unit) : "Sem estoque"}
                          {alert === "baixo" ? (
                            <span className={styles.lotStatus} data-status="atencao">
                              Baixo
                            </span>
                          ) : null}
                        </td>
                        <td data-label="Mínimo">{product.minQuantity !== undefined ? units(product.minQuantity, product.unit) : "—"}</td>
                        {can.finance ? (
                          <td data-label="Preço de compra">
                            {brl(product.unitCost ?? 0)} <span className={styles.unitNote}>/ {product.unit}</span>
                          </td>
                        ) : null}
                        <td data-label="Validade">
                          {days === null ? "—" : expiry(days)}
                          {alert === "vencido" || alert === "proximo" ? (
                            <span className={styles.lotStatus} data-status={alert}>
                              {STATUS[alert]}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className={styles.fine}>Nenhum produto neste filtro.</p>
            )}
          </section>

          <details className={styles.costs}>
            <summary>Lotes · {lots.length}</summary>
            {lots.length ? (
              <table className={styles.table} data-rows="">
                <thead>
                  <tr>
                    <th scope="col">Produto</th>
                    <th scope="col">Quantidade</th>
                    <th scope="col">Lote</th>
                    <th scope="col">Validade</th>
                    {can.finance ? <th scope="col">Custo aprox.</th> : null}
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
                        {can.finance ? <td data-label="Custo aprox.">{brl(lotValue(data, lot))}</td> : null}
                        <td data-label="Status">
                          <span className={styles.lotStatus} data-status={status}>
                            {STATUS[status]}
                          </span>
                          {can.stock ? (
                            <button type="button" className={styles.inlineAction} onClick={() => setAdjusting(lot.id)}>
                              Ajustar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className={styles.fine}>Nenhum lote com saldo. Faça uma entrada de produto.</p>
            )}
          </details>
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
      product:
        productId === "novo"
          ? {
              name: get("name"),
              unit: get("unit"),
              unitCost,
              brand: get("brand") || undefined,
              category: get("category") || undefined,
              supplier: get("supplier") || undefined,
            }
          : undefined,
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
          <div className={styles.twoFields}>
            <Field label="Nome do produto">
              <input className={styles.input} name="name" required maxLength={200} autoComplete="off" />
            </Field>
            <Field label="Marca (opcional)">
              <input className={styles.input} name="brand" maxLength={80} autoComplete="off" />
            </Field>
          </div>
          <div className={styles.twoFields}>
            <Field label="Categoria (opcional)">
              <input className={styles.input} name="category" maxLength={60} autoComplete="off" list="categorias" />
            </Field>
            <Field label="Fornecedor (opcional)">
              <input className={styles.input} name="supplier" maxLength={120} autoComplete="off" />
            </Field>
          </div>
          <Categories />
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
            <Field label="Preço de compra por unidade (R$)">
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
  const { can } = useFlow();
  const { pending, error, submit } = useWrite();
  const options = UNITS.includes(product.unit) ? UNITS : [product.unit, ...UNITS];
  return (
    <form className={styles.form} onSubmit={submit((form) => saveProduct(product.id, form), onDone)}>
      <div className={styles.twoFields}>
        <Field label="Nome do produto">
          <input className={styles.input} name="name" required maxLength={200} defaultValue={product.name} autoComplete="off" />
        </Field>
        <Field label="Marca (opcional)">
          <input className={styles.input} name="brand" maxLength={80} defaultValue={product.brand} autoComplete="off" />
        </Field>
      </div>
      <div className={styles.twoFields}>
        <Field label="Categoria (opcional)">
          <input className={styles.input} name="category" maxLength={60} defaultValue={product.category} autoComplete="off" list="categorias" />
        </Field>
        <Field label="Fornecedor (opcional)">
          <input className={styles.input} name="supplier" maxLength={120} defaultValue={product.supplier} autoComplete="off" />
        </Field>
      </div>
      <Categories />
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
        {can.finance ? (
          <Field label="Preço de compra por unidade (R$)">
            <input className={styles.input} name="unitCost" required inputMode="decimal" defaultValue={reais(product.unitCost ?? 0)} />
          </Field>
        ) : null}
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

/** The categories already in use, offered while typing one: one spelling per category. */
function Categories() {
  const { data } = useFlow();
  const used = [...new Set(data.products.map((p) => p.category).filter(Boolean))];
  return (
    <datalist id="categorias">
      {used.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}
