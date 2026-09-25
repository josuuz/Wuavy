import Link from "next/link";
import type { ReactNode } from "react";

import { isExternal } from "@/lib/contact";
import { cn } from "@/lib/utils";

interface TextLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

/** Secondary action: text with a rule under it. The rule thickens on hover. */
export function TextLink({ href, children, className }: TextLinkProps) {
  const classes = cn(
    "inline-block py-[0.6em] font-[640] underline decoration-[max(1px,0.08em)] underline-offset-[0.28em] transition-[text-decoration-thickness,text-decoration-color] duration-[180ms] hover:decoration-[0.14em] hover:decoration-signal active:opacity-70",
    className,
  );

  if (isExternal(href) || href.startsWith("mailto:") || href.startsWith("#")) {
    return (
      <a href={href} className={classes} {...(isExternal(href) ? { target: "_blank", rel: "noopener" } : {})}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
