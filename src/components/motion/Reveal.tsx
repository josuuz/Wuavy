import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface RevealProps {
  /** Delay after entering the viewport, in ms. Pairs with propagation (42ms steps). */
  delay?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Plain fade-up for cards and list items that don't need TextReveal's or
 * ImageReveal's own machinery: wraps `children` in the reveal gate with the
 * `.m-fade` keyframe (see styles/motion.css). The wrapper itself carries
 * [data-anim], so its base style is already the final state.
 */
export function Reveal({ delay = 0, className, children }: RevealProps) {
  return (
    <div className={cn("m-fade", className)} style={{ "--d": `${delay}ms` } as CSSProperties} data-reveal="" data-anim="">
      {children}
    </div>
  );
}
