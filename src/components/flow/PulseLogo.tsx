import { Wordmark } from "@/components/brand/Wordmark";
import { cn } from "@/lib/utils";
import styles from "./PulseLogo.module.css";

/*
  The Pulse's name inside the product, as on the approved board: the
  WUAVY wordmark and the PULSE tag outlined in the Pulse orange. The link
  around it names the product for assistive tech, so the drawing is quiet.
*/
export function PulseLogo({ className }: { className?: string }) {
  return (
    <span className={cn(styles.logo, className)} aria-hidden="true">
      <span className={styles.wordmark}>
        <Wordmark size="small" decorative />
      </span>
      <span className={styles.tag}>PULSE</span>
    </span>
  );
}
