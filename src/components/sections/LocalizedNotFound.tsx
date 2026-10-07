"use client";

import { useParams } from "next/navigation";

import { defaultLocale, isLocale, localizePath } from "@/i18n/config";
import { NotFound, type NotFoundWords } from "./NotFound";

/** A not-found file gets no params; the segment it renders in has them. */
export function LocalizedNotFound({ words }: { words: Record<string, NotFoundWords> }) {
  const { locale } = useParams<{ locale?: string }>();
  const current = isLocale(locale) ? locale : defaultLocale;
  return <NotFound t={words[current]} home={localizePath(current, "/")} />;
}
