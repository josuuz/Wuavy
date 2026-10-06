import ui from "@/components/flow/demo/ui.module.css";

/* While a screen loads: the Pulse's sign, never a blank page. */

export default function Loading() {
  return (
    <p className={ui.fine} role="status" aria-live="polite">
      <span className="pulse-dot" aria-hidden="true" /> Carregando…
    </p>
  );
}
