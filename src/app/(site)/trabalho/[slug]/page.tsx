import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, ViewTransition } from "react";

import { ChapterHead, Section } from "@/components/layout/Section";
import { ImageReveal } from "@/components/motion";
import { Contact } from "@/components/sections/Contact";
import { TextLink } from "@/components/ui/TextLink";
import { CaseFilm } from "@/components/work/CaseFilm";
import { CaseMedia } from "@/components/work/CaseMedia";
import { cases, getCase } from "@/data/cases";
import { serviceName } from "@/data/services";
import { cn } from "@/lib/utils";
import styles from "./page.module.css";

/*
  Case template. Every case in src/data/cases.ts gets a static page, always
  in the same order: cover and facts, then Antes e depois, Desafio, O que
  fizemos, Em movimento, Destaques técnicos, O que mudou, gallery, next case.
  A chapter without content is skipped and the numbers close up.
  Placeholder cases render with a notice and are kept out of search (noindex)
  and out of the sitemap until they are real.
*/

export const dynamicParams = false;

export function generateStaticParams() {
  return cases.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata(props: PageProps<"/trabalho/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const item = getCase(slug);
  if (!item) return {};

  const cover = item.cover.kind === "image" ? item.cover.src : item.cover.poster;
  return {
    title: item.title,
    description: item.summary,
    alternates: { canonical: `/trabalho/${item.slug}` },
    openGraph: { title: item.title, description: item.summary, images: [{ url: cover.src }] },
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

export default async function CasePage(props: PageProps<"/trabalho/[slug]">) {
  const { slug } = await props.params;
  const item = getCase(slug);
  if (!item) notFound();

  const index = cases.indexOf(item);
  const next = cases[(index + 1) % cases.length];
  const combo = item.scope && item.scope.length > 1;
  // The before/after, when there is one, opens the story as chapter 01.
  const first = item.before ? 2 : 1;

  // The story, always in this order; a case shows only the chapters it has.
  const text = (value?: string) => (value ? <p className={styles.text}>{value}</p> : null);
  const story: Chapter[] = [
    { key: "challenge", name: "Desafio", node: text(item.body?.challenge) },
    { key: "approach", name: "O que fizemos", node: text(item.body?.approach) },
    { key: "film", name: "Em movimento", node: item.film ? <CaseFilm film={item.film} /> : null, wide: true },
    {
      key: "highlights",
      name: "Destaques técnicos",
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
              <span className={styles.stackLabel}>Stack</span>
              {item.stack.map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null,
    },
    { key: "outcome", name: "O que mudou", node: text(item.body?.outcome) },
  ];
  const chapters = story.filter((c) => Boolean(c.node));
  const told = chapters.some((c) => c.key === "challenge" || c.key === "approach" || c.key === "outcome");

  return (
    <>
      <Section id="case" surface="black" label="Case" className={styles.intro}>
        <div className="frame">
          <p className={styles.back}>
            <TextLink href="/#projetos">Projetos</TextLink>
          </p>
          <h1 className={styles.title}>{item.title}</h1>
          <p className={`type-body ${styles.summary}`}>{item.summary}</p>
          {item.url ? (
            <p className={styles.live}>
              <TextLink href={item.url}>Ver o site no ar ↗</TextLink>
            </p>
          ) : null}

          <dl className={styles.facts}>
            <div>
              <dt>Cliente</dt>
              <dd>{item.client}</dd>
            </div>
            <div>
              <dt>Segmento</dt>
              <dd>{item.segment}</dd>
            </div>
            {combo ? (
              <div>
                <dt>Combo</dt>
                <dd className={styles.combo}>{item.scope?.join(" + ")}</dd>
              </div>
            ) : (
              <div>
                <dt>{item.services.length > 1 ? "Serviços" : "Serviço"}</dt>
                <dd>{(item.scope ?? item.services.map(serviceName)).join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>Ano</dt>
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

      <Section id="case-conteudo" surface="paper" label="Conteúdo" className={styles.body}>
        <div className="frame">
          {item.before ? (
            <div className={styles.compare}>
              <ChapterHead index={1} name="Antes e depois" className={styles.label} />
              {[
                { media: item.before.media, label: "Antes" },
                { media: item.cover, label: "Depois" },
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
              <ChapterHead index={1} name="Em preparação" className={styles.label} />
              <p className={styles.text}>
                Este case ainda está sendo escrito. Quando publicado, esta página mostra o desafio, o que construímos e o que mudou, com resultados verificados.
              </p>
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
            <p className={styles.nextLabel}>Próximo case</p>
            <TextLink href={`/trabalho/${next.slug}`} className={styles.nextLink}>
              {next.title}
            </TextLink>
          </div>
        ) : null}
      </Section>

      <Contact index={2} />
    </>
  );
}
