"use client";

import { brl } from "@/lib/flow/format";
import { change, numbers, type Numbers, type Period } from "@/lib/flow/indicators";
import type { FlowData } from "@/lib/flow/types";
import { NavIcon } from "../NavIcon";
import styles from "../ui.module.css";

/*
  The clinic's pulse over the last 30 days, each number against the 30 days
  before it, with a line of the last six weeks. Every value is calculated
  from the clinic's own visits (lib/flow/indicators.ts); nothing here is
  sampled or invented. Opportunities have no history yet, so they are not
  drawn as a trend.
*/

const MONTH: Period = { from: -29, to: 0 };
const PREVIOUS: Period = { from: -59, to: -30 };
/** Six weeks, oldest first. */
const WEEKS: Period[] = Array.from({ length: 6 }, (_, i) => ({ from: -7 * (5 - i) - 6, to: -7 * (5 - i) }));

const returnRate = (n: Numbers) => (n.patients ? Math.round((n.returning / n.patients) * 100) : null);

interface Trend {
  label: string;
  icon: string;
  tone: "orange" | "sage" | "sand";
  value: string;
  /** Percent change, or percentage points for a rate; null when there is no base to compare with. */
  delta: number | null;
  unit: "%" | "p.p.";
  series: number[];
}

function trends(d: FlowData): Trend[] {
  const now = numbers(d, MONTH);
  const then = numbers(d, PREVIOUS);
  const weeks = WEEKS.map((p) => numbers(d, p));
  const rateNow = returnRate(now);
  const rateThen = returnRate(then);
  return [
    { label: "Pacientes atendidos", icon: "pacientes", tone: "sage", value: String(now.patients), delta: change(now.patients, then.patients), unit: "%", series: weeks.map((w) => w.patients) },
    { label: "Receita", icon: "agenda", tone: "orange", value: brl(now.revenue), delta: change(now.revenue, then.revenue), unit: "%", series: weeks.map((w) => w.revenue) },
    { label: "Taxa de retorno", icon: "vendas", tone: "orange", value: rateNow === null ? "—" : `${rateNow}%`, delta: rateNow !== null && rateThen !== null ? rateNow - rateThen : null, unit: "p.p.", series: weeks.map((w) => returnRate(w) ?? 0) },
    { label: "Novos pacientes", icon: "oportunidades", tone: "sand", value: String(now.newPatients), delta: change(now.newPatients, then.newPatients), unit: "%", series: weeks.map((w) => w.newPatients) },
  ];
}

/** A small line of the six weeks; decorative, the number beside it is what is read. */
function Spark({ series }: { series: number[] }) {
  const w = 76;
  const h = 30;
  const max = Math.max(...series, 1);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg className={styles.spark} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <path className={styles.sparkArea} d={`${line}L${w},${h}L0,${h}Z`} />
      <path className={styles.sparkLine} d={line} />
    </svg>
  );
}

export function Trends({ data }: { data: FlowData }) {
  const list = trends(data);
  return (
    <section className={styles.trends} aria-labelledby="tendencias">
      <h2 id="tendencias" className={styles.label}>
        Últimos 30 dias <span>comparado aos 30 dias anteriores</span>
      </h2>
      <ul className={styles.trendList}>
        {list.map((t) => {
          const up = t.delta !== null && t.delta > 0;
          const down = t.delta !== null && t.delta < 0;
          return (
            <li key={t.label} className={styles.trend}>
              <span className={styles.trendIcon} data-tone={t.tone}>
                <NavIcon slug={t.icon} />
              </span>
              <span className={styles.trendBody}>
                <span className={styles.trendLabel}>{t.label}</span>
                <strong className={styles.trendValue}>{t.value}</strong>
                <span className={styles.trendDelta} data-dir={up ? "up" : down ? "down" : undefined}>
                  {t.delta === null ? (
                    "Sem base anterior"
                  ) : (
                    <>
                      <span aria-hidden="true">{up ? "↑" : down ? "↓" : "→"}</span> {Math.abs(t.delta)}
                      {t.unit === "%" ? "%" : " p.p."}
                      <span className="sr-only">{up ? " a mais" : down ? " a menos" : " estável"} que nos 30 dias anteriores</span>
                    </>
                  )}
                </span>
              </span>
              <Spark series={t.series} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
