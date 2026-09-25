import { cn } from "@/lib/utils";
import { small, standard } from "./paths";

interface WordmarkProps {
  /** `standard` above 32 px cap height; `small` from 14 to 32 px. */
  size?: "standard" | "small";
  className?: string;
  /** Hide from assistive tech when a visible label already names WUAVY. */
  decorative?: boolean;
}

/** The WUAVY wordmark, static. Colour comes from `currentColor`. */
export function Wordmark({ size = "standard", className, decorative = false }: WordmarkProps) {
  const master = size === "small" ? small : standard;
  const { w, u, a, v, y } = master.letters;

  return (
    <svg
      viewBox={master.viewBox}
      className={cn("block h-auto w-full", className)}
      xmlns="http://www.w3.org/2000/svg"
      {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-label": "WUAVY" })}
    >
      <g fill="currentColor" fillRule="evenodd">
        <path d={w} />
        <path d={u} />
        <path d={a} />
        <path d={v} />
        <path d={y} />
      </g>
    </svg>
  );
}
