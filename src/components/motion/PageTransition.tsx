import { ViewTransition, type ReactNode } from "react";

/**
 * Route changes cross on the channel: the new page is uncovered by a
 * diagonal edge at 20.81°, left to right, while the old one recedes.
 * Native View Transitions through React's <ViewTransition> (no library);
 * the animation lives in styles/transitions.css. Browsers without the API
 * simply navigate. Reduced motion: an instant cut.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="channel-in" exit="channel-out" default="none">
      {children}
    </ViewTransition>
  );
}
