import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, ViewTransition } from "react";

import { ChapterHead, Section } from "@/components/layout/Section";
import { ImageReveal } from "@/components/motion";
import { Contact } from "@/components/sections/Contact";
import { TextLink } from "@/components/ui/TextLink";
import { CaseFilm } from "@/components/work/CaseFilm";
import { CaseMedia } from "@/components/work/CaseMedia";
import { getCase, getCases } from "@/data/cases";
import { serviceName } from "@/data/services";
import { site } from "@/data/site";
import { isLocale, localizePath, ogLocale, pageAlternates } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { breadcrumbJsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import styles from "./page.module.css";

/*
  Case template. Every case in src/data/cases.ts gets a static page per
  language (its words are in the dictionaries), always in the same order: cover and facts, then Antes e depois, Desafio, O que
  fizemos, Em movimento, Destaques técnicos, O que mudou, gallery, next case.
  A chapter without content is skipped and the numbers close up.
  Placeholder cases render with a notice and are kept out of search (noindex)
  and out of the sitemap until they are real.
*/

export const dynamicParams = false;

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return [];
  return getCases(params.locale).map((item) => ({ slug: item.slug }));
}

export async function generateMetadata(props: PageProps<"/[locale]/trabalho/[slug]">): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!isLocale(locale)) return {};
  const item = getCase(slug, locale);
  if (!item) return {};

  const cover = item.cover.kind === "image" ? item.cover.src : item.cover.poster;
  return {
    title: item.title,
    description: item.summary,
    alternates: pageAlternates(locale, `/trabalho/${item.slug}`),
    openGraph: {
      title: item.title,
      description: item.summary,
      images: [{ url: cover.src }],
      locale: ogLocale(locale),
      url: localizePath(locale, `/trabalho/${item.slug}`),
    },
    robots: item.placeholder ? { index: false, follow: true } : undefined,
  };
}

interface Chapter {
  key: string;
  name: string;
  node: ReactNode;
  /** Takes the whole width under its head (media), instead of the text column. */
  wide?: boolean;
}

export default async function CasePage(props: PageProps<"/[locale]/trabalho/[slug]">) {
  const { locale, slug } = await props.params;
  if (!isLocale(locale)) notFound();
  const cases = getCases(locale);
  const item = cases.find((c) => c.slug === slug);
  if (!item) notFound();
  const t = getDictionary(locale).caseStudy;

  const trail = breadcrumbJsonLd([
    { name: site.name, path: localizePath(locale, "/") },
    { name: t.back, path: localizePath(locale, "/#projetos") },
    { name: item.title, path: localizePath(locale, `/trabalho/${item.slug}`) },
  ]);

  const index = cases.indexOf(item);
  const next = cases[(index + 1) % cases.length];
  const combo = item.scope && item.scope.length > 1;
  // The before/after, when there is one, opens the story as chapter 01.
  const first = item.before ? 2 : 1;

  // The story, always in this order; a case shows only the chapters it has.
  const text = (value?: string) => (value ? <p className={styles.text}>{value}</p> : null);
  const story: Chapter[] = [
    { key: "challenge", name: t.challenge, node: text(item.body?.challenge) },
    { key: "approach", name: t.approach, node: text(item.body?.approach) },
    { key: "film", name: t.film, node: item.film ? <CaseFilm film={item.film} /> : null, wide: true },
    {
      key: "highlights",
      name: t.highlights,
      node: item.highlights?.length ? (
        <div className={styles.tech}>
          <ul className={styles.highlights}>
            {item.highlights.map((h) => (
              <li key={h.title} className={styles.highlight}>
                <h3 className={styles.highlightTitle}>{h.title}</h3>
                <p className={styles.highlightText}>{h.text}</p>
              </li>
            ))}
          </ul>
          {item.stack?.length ? (
            <p className={styles.stack}>
              <span className={styles.stackLabel}>{t.stack}</span>
              {item.stack.map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null,
    },
    { key: "outcome", name: t.outcome, node: text(item.body?.outcome) },
  ];
  const chapters = story.filter((c) => Boolean(c.node));
  const told = chapters.some((c) => c.key === "challenge" || c.key === "approach" || c.key === "outcome");

  return (
    <>
      {item.placeholder ? null : (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(trail) }} />
      )}
      <Section id="case" surface="black" label={t.sections.intro} className={styles.intro}>
        <div className="frame">
          <p className={styles.back}>
            <TextLink href={localizePath(locale, "/#projetos")}>{t.back}</TextLink>
          </p>
          <h1 className={styles.title}>{item.title}</h1>
          <p className={`type-body ${styles.summary}`}>{item.summary}</p>
          {item.url ? (
            <p className={styles.live}>
              <TextLink href={item.url}>{t.live}</TextLink>
            </p>
          ) : null}

          <dl className={styles.facts}>
            <div>
              <dt>{t.client}</dt>
              <dd>{item.client}</dd>
            </div>
            <div>
              <dt>{t.segment}</dt>
              <dd>{item.segment}</dd>
            </div>
            {combo ? (
              <div>
                <dt>{t.combo}</dt>
                <dd className={styles.combo}>{item.scope?.join(" + ")}</dd>
              </div>
            ) : (
              <div>
                <dt>{item.services.length > 1 ? t.services : t.service}</dt>
                <dd>{(item.scope ?? item.services.map((id) => serviceName(id, locale))).join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>{t.year}</dt>
              <dd>{item.year}</dd>
            </div>
          </dl>
        </div>

        {/* Same name as the home card: the cover morphs from the card into place. */}
        <ViewTransition name={`case-${item.slug}`} share="case-morph" default="none">
          <ImageReveal aspect={16 / 9} mobileAspect={item.cover.mobileAspect ?? 4 / 5} className={styles.cover}>
            <CaseMedia media={item.cover} sizes="100vw" priority />
          </ImageReveal>
        </ViewTransition>
      </Section>

      <Section id="case-conteudo" surface="paper" label={t.sections.content} className={styles.body}>
        <div className="frame">
          {item.before ? (
            <div className={styles.compare}>
              <ChapterHead index={1} name={t.beforeAfter} className={styles.label} />
              {[
                { media: item.before.media, label: t.before },
                { media: item.cover, label: t.after },
              ].map(({ media, label }) => (
                <figure key={label} className={styles.shot}>
                  <div className={styles.shotMedia}>
                    <CaseMedia media={media} sizes="(min-width: 1024px) 50vw, 100vw" />
                  </div>
                  <figcaption className={styles.shotLabel}>{label}</figcaption>
                </figure>
              ))}
              <ul className={styles.changes}>
                {item.before.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.placeholder || !told ? (
            <>
              <ChapterHead index={1} name={t.preparing} className={styles.label} />
              <p className={styles.text}>{t.preparingText}</p>
            </>
          ) : (
            chapters.map((chapter, i) => (
              <div key={chapter.key} className={cn(styles.block, chapter.wide && styles.wide)}>
                <ChapterHead index={i + first} name={chapter.name} className={styles.label} />
                {chapter.node}
              </div>
            ))
          )}

          {item.result ? (
            <p className={styles.result}>
              <span className={styles.resultValue}>{item.result.value}</span>
              <span className={styles.resultLabel}>{item.result.label}</span>
            </p>
          ) : null}
        </div>

        {item.gallery?.map((media, i) => (
          <ImageReveal key={i} aspect={16 / 9} mobileAspect={media.mobileAspect ?? 4 / 5} className={styles.gallery}>
            <CaseMedia media={media} sizes="100vw" />
          </ImageReveal>
        ))}

        {next && next.slug !== item.slug ? (
          <div className={`frame ${styles.next}`}>
            <p className={styles.nextLabel}>{t.next}</p>
            <TextLink href={localizePath(locale, `/trabalho/${next.slug}`)} className={styles.nextLink}>
              {next.title}
            </TextLink>
          </div>
        ) : null}
      </Section>

      <Contact locale={locale} index={2} />
    </>
  );
}
