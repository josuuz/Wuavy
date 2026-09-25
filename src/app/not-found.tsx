import type { Metadata } from "next";

import { SiteChrome } from "@/components/layout/SiteChrome";
import { TextLink } from "@/components/ui/TextLink";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <SiteChrome>
      <section
        data-surface="black"
        data-section="Não encontrada"
        id="nao-encontrada"
        className="surface frame min-h-[80svh] content-end gap-y-[var(--space-3)] pt-[calc(var(--header-h)+var(--space-5))] pb-[var(--space-4)]"
      >
        <p className="type-display col-span-12 text-[clamp(4rem,2rem+14vw,16rem)]">404</p>
        <h1 className="type-headline col-span-12 text-h2 lg:col-span-8">Esta página não existe.</h1>
        <p className="col-span-12 text-lead">
          <TextLink href="/">Voltar ao início</TextLink>
        </p>
      </section>
    </SiteChrome>
  );
}
