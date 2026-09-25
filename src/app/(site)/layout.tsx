import type { ReactNode } from "react";

import { SiteChrome } from "@/components/layout/SiteChrome";
import { SmoothScroll } from "@/components/motion";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <SiteChrome>{children}</SiteChrome>
    </>
  );
}
