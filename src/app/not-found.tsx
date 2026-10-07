import type { Metadata } from "next";

import { SiteChrome } from "@/components/layout/SiteChrome";
import { NotFound } from "@/components/sections/NotFound";
import { defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

/*
  The 404 outside the public site (an unknown Pulse address), in pt-BR like
  the Pulse. A missing site address gets (site)/[locale]/not-found instead, in
  the visitor's language. Static: reading the cookie here would make every
  page dynamic.
*/

const t = getDictionary(defaultLocale).notFound;

export const metadata: Metadata = {
  title: t.meta,
  robots: { index: false },
};

export default function RootNotFound() {
  return (
    <SiteChrome locale={defaultLocale}>
      <NotFound t={t} />
    </SiteChrome>
  );
}
