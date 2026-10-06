"use client";

import { useState, type CSSProperties } from "react";

import { brl, daysFrom } from "@/lib/flow/format";
import {
  before,
  busiestDays,
  busiestHours,
  change,
  insights,
  numbers,
  procedureRanking,
  revenueSeries,
  type Period,
} from "@/lib/flow/indicators";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Indicadores, inside Visão geral: five numbers first, then what the Pulse
  reads in them, then four small charts. One period for all of it, picked
  above. Each chart is one series in the Pulse's Signal, its value on the
  tallest bar and on hover; the numbers behind each bar are in its label.
*/

type Range = "7" | "30" | "mes" | "custom";

function periodOf(range: Range, now: string, custom: { from: string; to: string }): Period {
  if (range === "7") return { from: -6, to: 0 };
  if (range === "30") return { from: -29, to: 0 };
  if (range === "mes") return { from: 1 - new Date(now).getUTCDate(), to: 0 };
  const from = daysFrom(now, `${custom.from}T12:00:00.000Z`);
  const to = daysFrom(now, `${custom.to}T12:00:00.000Z`);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function Indicators() {
  const { data } = useFlow();
  const today = data.now.slice(0, 10);
  const monthAgo = new Date(Date.parse(data.now) - 29 * 86_400_000).toISOString().slice(0, 10);
  const [range, setRange] = useState<Range>("30");
  const [custom, setCustom] = useState({ from: monthAgo, to: today });
  const period = periodOf(range, data.now, custom);
  const now = numbers(data, period);
  const then = before(data, period);
  const read = insights(data, period);
  const ranking = procedureRanking(data, period);
  const sold = ranking.filter((r) => r.count > 0);

  const tiles: { label: string; value: string; delta: number | null }[] = [
    { label: "Faturamento", value: brl(now.revenue), delta: change(now.revenue, then.revenue) },
    { label: "Lucro estimado", value: brl(now.profit), delta: change(now.profit, then.profit) },
    { label: "Ticket médio", value: now.ticket ? brl(now.ticket) : "—", delta: change(now.ticket, then.ticket) },
    { label: "Pacientes atendidos", value: String(now.patients), delta: change(now.patients, then.patients) },
    {
      label: "Conversão de leads",
      value: now.conversion === null ? "—" : `${now.conversion}%`,
      delta: now.conversion === null || then.conversion === null ? null : now.conversion - then.conversion,
    },
  ];

  return (
    <div className={styles.indicators}>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Período">
          {(
            [
              ["7", "7 dias"],
              ["30", "30 dias"],
              ["mes", "Este mês"],
              ["custom", "Período"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={range === id} onClick={() => setRange(id)}>
              {label}
            </button>
          ))}
        </div>
        {range === "custom" ? (
          <div className={styles.dates}>
            <label>
              <span className="sr-only">De</span>
              <input
                className={styles.input}
                type="date"
                max={today}
                value={custom.from}
                onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
              />
            </label>
            <span aria-hidden="true">–</span>
            <label>
              <span className="sr-only">Até</span>
              <input
                className={styles.input}
                type="date"
                max={today}
                value={custom.to}
                onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
              />
            </label>
          </div>
        ) : null}
      </div>

      <ul className={styles.kpis} aria-label="Números do período">
        {tiles.map((t) => (
          <li key={t.label}>
            <span className={styles.statValue}>{t.value}</span>
            <span className={styles.statLabel}>{t.label}</span>
            {t.delta !== null ? (
              <span className={styles.delta} data-tone={t.delta > 0 ? "up" : t.delta < 0 ? "down" : undefined}>
                {t.delta > 0 ? "↑" : t.delta < 0 ? "↓" : "="} {Math.abs(t.delta)}
                {t.label === "Conversão de leads" ? " p.p." : "%"} <span>vs. período anterior</span>
              </span>
            ) : (
              <span className={styles.delta}>
                <span>sem período anterior para comparar</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.fine}>O lucro estimado desconta só os produtos usados em cada procedimento.</p>

      {read.length ? (
        <section className={styles.readings} aria-labelledby="leitura">
          <h2 id="leitura" className={styles.label}>
            O que o Pulse leu no período
          </h2>
          <ol>
            {read.map((i) => (
              <li key={i.id} data-tone={i.tone}>
                <span className="pulse-dot" aria-hidden="true" />
                {i.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className={styles.charts}>
        <Bars title="Faturamento por período" items={revenueSeries(data, period)} format={brl} sparse />
        <section className={styles.chart} aria-labelledby="mais-vendidos">
          <h2 id="mais-vendidos" className={styles.label}>
            Procedimentos mais e menos vendidos
          </h2>
          {sold.length ? (
            <>
              <Ranking items={sold.slice(0, 5)} />
              {ranking.length > 5 ? (
                <>
                  <p className={styles.chartNote}>Menos vendidos</p>
                  <Ranking items={ranking.slice(-3).reverse()} max={sold[0].count} />
                </>
              ) : null}
            </>
          ) : (
            <p className={styles.fine}>Nenhum atendimento finalizado no período.</p>
          )}
        </section>
        <Bars title="Dias mais movimentados" items={busiestDays(data, period)} format={(n) => `${n} atend.`} />
        <Bars title="Horários mais movimentados" items={busiestHours(data, period)} format={(n) => `${n} atend.`} />
      </div>
    </div>
  );
}

/** One series of vertical bars: the tallest carries its value, every bar shows it on hover. */
function Bars({
  title,
  items,
  format,
  sparse,
}: {
  title: string;
  items: { label: string; value: number }[];
  format: (n: number) => string;
  /** Many bars: only some of the labels under them. */
  sparse?: boolean;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  const every = sparse ? Math.ceil(items.length / 8) : 1;
  const top = items.findIndex((i) => i.value === max);
  return (
    <section className={styles.chart} aria-label={title}>
      <h2 className={styles.label}>{title}</h2>
      {max > 0 ? (
        <ol className={styles.bars} style={{ "--n": items.length } as CSSProperties}>
          {items.map((item, i) => (
            <li
              key={`${item.label}-${i}`}
              aria-label={`${item.label}: ${format(item.value)}`}
              tabIndex={0}
              data-tip={i === top ? undefined : format(item.value)}
              style={{ "--h": item.value / max } as CSSProperties}
            >
              <span className={styles.bar}>
                {i === top ? <span className={styles.barValue}>{format(item.value)}</span> : null}
              </span>
              <span className={styles.barLabel} aria-hidden="true">
                {i % every === 0 ? item.label : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.fine}>Sem atendimentos no período.</p>
      )}
    </section>
  );
}

/** Procedures as horizontal bars, the count in ink beside each. */
function Ranking({ items, max }: { items: { procedure: { id: string; name: string }; count: number }[]; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className={styles.ranking}>
      {items.map(({ procedure, count }) => (
        <li key={procedure.id}>
          <span className={styles.rankName}>{procedure.name}</span>
          <span className={styles.rankTrack} aria-hidden="true">
            <span style={{ "--w": count / top } as CSSProperties} />
          </span>
          <span className={styles.rankCount}>{count}</span>
        </li>
      ))}
    </ol>
  );
}
