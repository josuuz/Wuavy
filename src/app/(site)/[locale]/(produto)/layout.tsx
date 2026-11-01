import { notFound } from "next/navigation";

import { PulseChrome } from "@/components/pulse/PulseChrome";
import { isLocale } from "@/i18n/config";

/** Clinavy's pages: the product's own header and short footer, not the agency's. */
export default async function ProductLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <PulseChrome locale={locale}>{children}</PulseChrome>;
}
