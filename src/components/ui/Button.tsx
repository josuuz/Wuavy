import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { isExternal } from "@/lib/contact";
import { cn } from "@/lib/utils";
import styles from "./Button.module.css";

type Size = "md" | "sm";

interface BaseProps {
  children: ReactNode;
  size?: Size;
  className?: string;
}

type LinkButtonProps = BaseProps & { href: string } & Omit<ComponentPropsWithoutRef<"a">, "href" | "className">;
type NativeButtonProps = BaseProps & { href?: undefined } & Omit<ComponentPropsWithoutRef<"button">, "className">;

/**
 * The action. Fill: the surface's mark (Signal on Black and Paper, Black on
 * Signal). Hover: the channel wipes across at 20.81°.
 * `data-magnetic` / `data-magnetic-inner` are hooks for a future MagneticButton.
 */
export function Button(props: LinkButtonProps | NativeButtonProps) {
  const { children, size = "md", className, ...rest } = props;
  const classes = cn(styles.button, styles[size], className);
  const inner = (
    <span className={styles.label} data-magnetic-inner="">
      {children}
    </span>
  );

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as LinkButtonProps;
    const external = isExternal(href);
    const plain = external || href.startsWith("mailto:") || href.startsWith("tel:");
    const shared = { className: classes, "data-magnetic": "", "data-cursor": "action", ...anchor };

    return plain ? (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener" } : {})} {...shared}>
        {inner}
      </a>
    ) : (
      <Link href={href} {...shared}>
        {inner}
      </Link>
    );
  }

  const { type = "button", ...button } = rest as NativeButtonProps;
  return (
    <button type={type} className={classes} data-magnetic="" data-cursor="action" {...button}>
      {inner}
    </button>
  );
}
