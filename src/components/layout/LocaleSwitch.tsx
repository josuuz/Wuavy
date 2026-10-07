"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useTransition } from "react";

import { LOCALE_COOKIE, LOCALE_MAX_AGE, localizePath, splitPath, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import styles from "./LocaleSwitch.module.css";

export interface LanguageOption {
  locale: Locale;
  /** "BR", "PT": the header's. */
  short: string;
  /** "Brasil", "Portugal": the menu's. */
  name: string;
  /** What a screen reader hears. */
  label: string;
}

export interface LanguageSwitchProps {
  current: Locale;
  /** The group's name ("Idioma"). */
  label: string;
  options: LanguageOption[];
}

/** The choice, for the proxy: this visit and the next. */
function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
}

// The same page in the other language: the reader stays where they were.
let heldScroll: number | null = null;
const holdScroll = () => {
  heldScroll = window.scrollY;
};
const releaseScroll = () => {
  if (heldScroll === null) return;
  window.scrollTo({ top: heldScroll, behavior: "instant" });
  heldScroll = null;
};

/**
 * Brasil / Portugal. The choice goes into a cookie (the proxy honours it on
 * every plain address from then on, this visit and the next) and the page
 * moves to its twin in that language (/termos ↔ /pt-pt/termos), same scroll.
 */
export function LocaleSwitch({
  current,
  label,
  options,
  variant = "short",
  className,
}: LanguageSwitchProps & { variant?: "short" | "name"; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const choose = (locale: Locale) => {
    if (locale === current || pending) return;
    // The header sets <html lang> once the page renders in the new language.
    remember(locale);
    holdScroll();
    const twin = localizePath(locale, splitPath(pathname).path);
    startTransition(() => router.push(twin, { scroll: false }));
  };

  useEffect(releaseScroll, [current]);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(styles.switch, variant === "name" && styles.named, className)}
      data-pending={pending ? "" : undefined}
    >
      {options.map((option, i) => (
        <Fragment key={option.locale}>
          {i > 0 ? (
            <span className={styles.slash} aria-hidden="true">
              /
            </span>
          ) : null}
          <button
            type="button"
            lang={option.locale}
            className={styles.option}
            aria-pressed={option.locale === current}
            onClick={() => choose(option.locale)}
          >
            {variant === "short" ? (
              <>
                {option.short}
                <span className="sr-only"> {option.label}</span>
              </>
            ) : (
              option.name
            )}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
