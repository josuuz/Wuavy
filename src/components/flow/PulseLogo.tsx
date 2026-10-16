import { Wordmark } from "@/components/brand/Wordmark";
import { cn } from "@/lib/utils";
import styles from "./PulseLogo.module.css";

/*
  The Pulse's name, PULSE first: the product leads the mark, in the Pulse
  orange; WUAVY signs it underneath, small, the way an agency signs its
  work. The link around it names the product for assistive tech, so the
  drawing itself stays quiet.
*/
export function PulseLogo({ className }: { className?: string }) {
  return (
    <span className={cn(styles.logo, className)} aria-hidden="true">
      <span className={styles.pulse}>PULSE</span>
      <span className={styles.by}>
        by
        <span className={styles.wordmark}>
          <Wordmark size="small" decorative />
        </span>
      </span>
    </span>
  );
}
