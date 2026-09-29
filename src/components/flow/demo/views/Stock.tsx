"use client";

import { useRouter } from "next/navigation";

import { brl, daysFrom, plural, units } from "@/lib/flow/format";
import { expiringLots, lotStatus, lotValue, proceduresUsing, type LotStatus } from "@/lib/flow/insights";
import type { InventoryLot } from "@/lib/flow/types";
import { BASE } from "../copy";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* Stock by lot. What is close to its date comes first, with where it can still be used. */

const STATUS: Record<LotStatus, string> = { proximo: "Próximo da validade", atencao: "Atenção", normal: "Normal" };
const ORDER: Record<LotStatus, number> = { proximo: 0, atencao: 1, normal: 2 };

export function Stock() {
  const { data, dispatch } = useFlow();
  const router = useRouter();
  const near = expiringLots(data);
  const nearValue = near.reduce((s, l) => s + lotValue(data, l), 0);
  const lots = [...data.lots].sort(
    (a, b) => ORDER[lotStatus(data, a)] - ORDER[lotStatus(data, b)] || a.expiresAt.localeCompare(b.expiresAt),
  );
  const analyse = () => {
    dispatch({ type: "focus", kind: "stock_expiry" });
    router.push(`${BASE}/oportunidades`);
  };
  // The one worth the most is the one worth acting on first.
  const lead = [...near].sort((a, b) => lotValue(data, b) - lotValue(data, a))[0];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Estoque</h1>
        <p className={styles.lead}>
          {plural(near.length, "lote próximo", "lotes próximos")} da validade, {brl(nearValue)} em estoque.
        </p>
      </header>

      {lead ? <Featured lot={lead} onAnalyse={analyse} /> : null}

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
            const product = data.products.find((p) => p.id === lot.productId)!;
            const status = lotStatus(data, lot);
            return (
              <tr key={lot.id} data-status={status}>
                <td data-label="Produto">
                  <strong>{product.name}</strong>
                </td>
                <td data-label="Quantidade">
                  {units(lot.quantity, product.unit)}
                </td>
                <td data-label="Lote">{lot.lotCode}</td>
                <td data-label="Validade">em {daysFrom(data.now, lot.expiresAt)} dias</td>
                <td data-label="Custo aprox.">{brl(lotValue(data, lot))}</td>
                <td data-label="Usado em">
                  {proceduresUsing(data, lot.productId)
                    .map((u) => u.procedure.name)
                    .join(", ")}
                </td>
                <td data-label="Status">
                  <span className={styles.lotStatus} data-status={status}>
                    {STATUS[status]}
                  </span>
                  {status === "proximo" ? (
                    <button type="button" className={styles.inlineAction} onClick={analyse}>
                      Analisar oportunidade
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Featured({ lot, onAnalyse }: { lot: InventoryLot; onAnalyse: () => void }) {
  const { data } = useFlow();
  const product = data.products.find((p) => p.id === lot.productId)!;
  return (
    <article className={styles.featured}>
      <p className={styles.kicker}>Maior valor perto da validade</p>
      <h2 className={styles.featuredName}>{product.name}</h2>
      <p className={styles.featuredFacts}>
        <span>
          {units(lot.quantity, product.unit)}
        </span>
        <span>vence em {daysFrom(data.now, lot.expiresAt)} dias</span>
        <span>{brl(lotValue(data, lot))} em estoque</span>
      </p>
      <p className={styles.label}>Utilizado em</p>
      <ul className={styles.usedIn}>
        {proceduresUsing(data, lot.productId).map((u) => (
          <li key={u.procedure.id}>{u.procedure.name}</li>
        ))}
      </ul>
      <button type="button" className={styles.primary} onClick={onAnalyse}>
        Analisar oportunidade
      </button>
    </article>
  );
}
