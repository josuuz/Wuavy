import type { CSSProperties } from "react";

import { frequencyBuild } from "@/lib/frequency";
import { cn } from "@/lib/utils";
import styles from "./FrequencyBuild.module.css";

/*
  The hero's opening gesture: módulo → intervalo → repetição → frequência.
  One line appears (the module). Lines repeat at an interval. The interval
  halves, then halves again, until the row reaches full frequency.

  Landscape: one row, built in time — each level propagates left to right,
  twice as fast as the one before.
  Portrait: the same build laid out in space — one row per level, stacked,
  so a tall screen reads the formula from top to bottom.
*/

const LEVELS = 5;
const LEVEL_START = [0, 160, 520, 700, 880];
const LEVEL_STEP = [0, 84, 42, 21, 10.5];

export function FrequencyBuild({ className, field = false }: { className?: string; field?: boolean }) {
  const lines = frequencyBuild(32);

  return (
    <div className={className} aria-hidden="true" {...(field ? { "data-field": "" } : {})}>
      <div className={styles.row}>
        {lines.map((line, i) => (
          <span
            key={i}
            className={styles.line}
            data-level={line.level}
            style={
              {
                left: `${line.x * 100}%`,
                "--d": `${Math.round(LEVEL_START[line.level] + line.order * LEVEL_STEP[line.level])}ms`,
              } as CSSProperties
            }
            data-anim=""
          />
        ))}
      </div>

      <div className={styles.stack}>
        {Array.from({ length: LEVELS }, (_, level) => {
          const rowLines = lines.filter((line) => line.level <= level);
          return (
            <div key={level} className={cn(styles.row, styles.stackRow)}>
              {rowLines.map((line, i) => (
                <span
                  key={i}
                  className={styles.line}
                  data-level={line.level}
                  style={
                    {
                      left: `${line.x * 100}%`,
                      "--d": `${Math.round(LEVEL_START[level] + i * LEVEL_STEP[level])}ms`,
                    } as CSSProperties
                  }
                  data-anim=""
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
