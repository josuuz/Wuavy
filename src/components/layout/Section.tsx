import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn, pad } from "@/lib/utils";

export type Surface = "black" | "carbon" | "graphite" | "paper" | "fog" | "signal";

interface SectionProps extends Omit<ComponentPropsWithoutRef<"section">, "id" | "children"> {
  id: string;
  surface: Surface;
  /** Name shown in the frequency index and read by assistive tech. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * The one wrapper every home section uses. It paints the surface, registers
 * the section for the header and the frequency index (data-section), and is
 * where a future ScrollSection plugs in without touching the sections.
 */
export function Section({ id, surface, label, className, children, ...rest }: SectionProps) {
  return (
    <section
      {...rest}
      id={id}
      data-surface={surface}
      data-section={label}
      aria-label={label}
      className={cn("surface relative", className)}
    >
      {children}
    </section>
  );
}

interface ChapterHeadProps {
  index: number;
  name: string;
  className?: string;
}

/** "01 Ideia": the chapter head from the brand boards, top left of a section. */
export function ChapterHead({ index, name, className }: ChapterHeadProps) {
  return (
    <h2 className={cn("type-chapter flex gap-[0.9em]", className)}>
      <span aria-hidden="true">{pad(index)}</span>
      <span>{name}</span>
    </h2>
  );
}
