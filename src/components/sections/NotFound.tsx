import { TextLink } from "@/components/ui/TextLink";

export interface NotFoundWords {
  section: string;
  title: string;
  back: string;
}

/** The 404's body; the page around it (header, footer) is the caller's. */
export function NotFound({ t, home = "/" }: { t: NotFoundWords; home?: string }) {
  return (
    <section
      data-surface="black"
      data-section={t.section}
      id="nao-encontrada"
      className="surface frame min-h-[80svh] content-end gap-y-[var(--space-3)] pt-[calc(var(--header-h)+var(--space-5))] pb-[var(--space-4)]"
    >
      <p className="type-display col-span-12 text-[clamp(4rem,2rem+14vw,16rem)]">404</p>
      <h1 className="type-headline col-span-12 text-h2 lg:col-span-8">{t.title}</h1>
      <p className="col-span-12 text-lead">
        <TextLink href={home}>{t.back}</TextLink>
      </p>
    </section>
  );
}
