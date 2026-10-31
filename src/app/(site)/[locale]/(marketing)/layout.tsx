import { notFound } from "next/navigation";

import { SiteChrome } from "@/components/layout/SiteChrome";
import { isLocale } from "@/i18n/config";

/** The agency's pages: the site header with the whole menu, and the footer. */
export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <SiteChrome locale={locale}>{children}</SiteChrome>;
}
