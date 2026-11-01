import { cn } from "@/lib/utils";
import styles from "./PulseLogo.module.css";

/*
  The product's name, CLINAVY alone, in the product's orange. The agency is
  not signed under it: Wuavy is reached by the link back to the agency, not
  by a lockup. The link around it names the product for assistive tech, so
  the drawing itself stays quiet.
*/
export function PulseLogo({ className }: { className?: string }) {
  return (
    <span className={cn(styles.logo, className)} aria-hidden="true">
      <span className={styles.pulse}>CLINAVY</span>
    </span>
  );
}
