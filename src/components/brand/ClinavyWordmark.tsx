import { cn } from "@/lib/utils";
import { small, standard } from "./clinavy-paths";

interface ClinavyWordmarkProps {
  /** `standard` from 20 px cap height up; `small` for 14 to 20 px. */
  size?: "standard" | "small";
  className?: string;
  /** Hide from assistive tech when the link around it already names Clinavy. */
  decorative?: boolean;
}

/** The CLINAVY wordmark, vector, one colour: `currentColor`. Never retyped in a font. */
export function ClinavyWordmark({ size = "standard", className, decorative = false }: ClinavyWordmarkProps) {
  const master = size === "small" ? small : standard;
  const { c, l, i, n, a, v, y } = master.letters;

  return (
    <svg
      viewBox={master.viewBox}
      className={cn("block h-auto w-full", className)}
      xmlns="http://www.w3.org/2000/svg"
      {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-label": "Clinavy" })}
    >
      <g fill="currentColor" fillRule="evenodd">
        <path d={c} />
        <path d={l} />
        <path d={i} />
        <path d={n} />
        <path d={a} />
        <path d={v} />
        <path d={y} />
      </g>
    </svg>
  );
}
