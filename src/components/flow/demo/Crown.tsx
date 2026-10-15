import { cn } from "@/lib/utils";
import styles from "./Crown.module.css";

/*
  The Pulse's crown: the mark of the subscription, wherever "Assinar" is
  offered. Fine strokes in currentColor (dark on the orange button, champagne
  in the dialog), three points with a jewel each. On hover or focus of the
  control around it, it lifts a little and a small spark catches the light.
  It marks the offer, never a status: no one is shown as subscribed by it.
*/
export function Crown({ className }: { className?: string }) {
  return (
    <svg className={cn(styles.crown, className)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g className={styles.body} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M4.6 9.2 8.4 13 12 6.6l3.6 6.4 3.8-3.8-1.5 8.3H6.1Z" />
        <path d="M6.3 19.6h11.4" />
      </g>
      <g className={styles.body} fill="currentColor">
        <circle cx="4.6" cy="9.2" r="1.1" />
        <circle cx="12" cy="6.6" r="1.1" />
        <circle cx="19.4" cy="9.2" r="1.1" />
      </g>
      <path className={styles.spark} fill="currentColor" d="M19.6 1.6l.55 1.45 1.45.55-1.45.55-.55 1.45-.55-1.45-1.45-.55 1.45-.55Z" />
    </svg>
  );
}
