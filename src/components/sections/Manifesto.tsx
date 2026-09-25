import type { CSSProperties } from "react";

import { Section } from "@/components/layout/Section";
import { WidthWave } from "@/components/motion";
import { home } from "@/data/home";
import { cn, hasDescender } from "@/lib/utils";
import styles from "./Manifesto.module.css";

/*
  04 — The break. Pure type at architectural scale, cropped by the frame:
  the one rupture of this layout is VOLUME. cut by the bottom edge.

  v2 (transition #3) — the words hold still while a Paper plane crosses
  behind them along the channel angle, 20.81°, driven by the scroll. The
  letters invert as it passes (difference blend), and on capable machines
  the width axis travels through them letter by letter with the same scroll:
  frequency drawn as motion. CSS scroll-driven animations only; where they
  are not supported, the section is the static Paper break of v1.
*/

interface ManifestoProps {
  /** Display lines; defaults to the approved "Frequência / vence / volume.". */
  lines?: readonly string[];
  /** Width of the longest line in em (sets the fit to the frame). */
  fit?: number;
}

export function Manifesto({ lines = home.manifesto.lines, fit }: ManifestoProps) {
  return (
    <Section id="manifesto" surface="black" label="Manifesto" className={`tx-grain ${styles.section}`}>
      <div className={styles.stage} style={fit ? ({ "--fit": fit } as CSSProperties) : undefined}>
        <span className={styles.plane} aria-hidden="true" />
        <p className={styles.lines}>
          {lines.map((line) => (
            <WidthWave key={line} text={line} className={cn(styles.line, hasDescender(line) && styles.descender)} />
          ))}
        </p>
      </div>
    </Section>
  );
}
