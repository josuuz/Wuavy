import type { CSSProperties, ReactNode } from "react";

import { angleRun } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

interface ImageRevealProps {
  /** Width / height of the frame. Reserves the space, so nothing shifts. */
  aspect: number;
  /** Aspect below 768 px, when the mobile crop differs. */
  mobileAspect?: number;
  /** Delay after entering the viewport, in ms. */
  delay?: number;
  className?: string;
  children: ReactNode;
}

/**
 * The channel wipe (brand motion #3) used as an image reveal: a diagonal
 * edge at 20.81° crosses the frame from top left to bottom right while the
 * image settles. Wrap any media (image, video) that fills its parent.
 */
export function ImageReveal({ aspect, mobileAspect, delay = 0, className, children }: ImageRevealProps) {
  // Horizontal run of the brand angle across the frame's height, as a fraction of
  // its width. It depends on the aspect, so the edge is 20.81° at any crop.
  const vars: Record<string, string | number> = {
    "--ar": aspect,
    "--dx": (angleRun / aspect).toFixed(4),
    "--d": `${delay}ms`,
  };
  if (mobileAspect) {
    vars["--ar-m"] = mobileAspect;
    vars["--dx-m"] = (angleRun / mobileAspect).toFixed(4);
  }

  return (
    <div
      className={cn("m-channel relative overflow-hidden", className)}
      style={vars as CSSProperties}
      data-reveal=""
      data-anim=""
    >
      <div className="m-channel-media absolute inset-0" data-anim="">
        {children}
      </div>
    </div>
  );
}
