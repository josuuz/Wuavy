import type { ReactNode } from "react";

import { PageTransition } from "@/components/motion";

/** Re-mounts on every route change, so each page enters and leaves on the channel. */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
