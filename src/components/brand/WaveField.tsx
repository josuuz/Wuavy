import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import styles from "./WaveField.module.css";

interface WaveFieldProps {
  /** Number of lines across the band. Mobile draws every other one. */
  count?: number;
  className?: string;
}

/*
  T04 Wave. The frequency device kept alive: a band of vertical lines whose
  heights travel as a wave, each line 42 ms behind its neighbour (the brand's
  propagation). One CSS animation per line, transform only, runs on the
  compositor, and only while the band is on screen (data-loop).
*/
export function WaveField({ count = 72, className }: WaveFieldProps) {
  return (
    <div className={cn(styles.field, className)} aria-hidden="true" data-loop="">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.line} style={{ "--i": i, left: `${((i + 0.5) / count) * 100}%` } as CSSProperties} />
      ))}
    </div>
  );
}
