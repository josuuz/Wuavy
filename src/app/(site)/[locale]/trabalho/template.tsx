import type { ReactNode } from "react";

import { PageTransition } from "@/components/motion";

/** Case to case: the root template does not re-mount between slugs, this one does. */
export default function CaseTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
