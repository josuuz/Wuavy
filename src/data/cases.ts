import type { Locale } from "@/i18n/config";
import { getDictionary, type Dictionary } from "@/i18n/dictionaries";
import type { CaseStudy } from "@/lib/types";

import meldeCapa from "@/assets/work/melde-capa.jpg";
import meldeCelulares from "@/assets/work/melde-celulares.jpg";
import meldeDesktop from "@/assets/work/melde-desktop.jpg";
import meldeMarca from "@/assets/work/melde-marca.jpg";
import meldeMarcaCor from "@/assets/work/melde-marca-cor.jpg";
import meldeMobile from "@/assets/work/melde-mobile.jpg";
import meldeRotulo from "@/assets/work/melde-rotulo.jpg";
import vidaNaturalAntes from "@/assets/work/vida-natural-antes.jpg";
import vidaNaturalDepois from "@/assets/work/vida-natural-depois.jpg";

/*
  Cases: real work only, newest first. Each one gets a row on the home page
  and its own page. Say what was actually done: an existing site redesigned
  is a redesign, not a brand built from zero. Add `result` only with a
  verified number. The full checklist for a new case is in README.md
  ("Padrão de case").

  Here: the facts and the media. The words (summary, story, highlights, alt
  texts) are in each locale's dictionary (src/i18n), under `cases.<slug>`.

  Vida Natural: its images are screenshots of the old site and of the new one;
  its highlights come from the project's own README.
  Meldê: brand built from zero, so no "before". Its photography is AI-made art
  direction, labelled on the site; the film is a recording of the landing.
*/

type Words = Dictionary["cases"];

const builders: Array<(t: Words) => CaseStudy> = [
  ({ melde: t }) => ({
    slug: "melde",
    client: "Meldê",
    title: "Meldê",
    tagline: t.tagline,
    segment: t.segment,
    services: ["sites"],
    scope: t.scope,
    year: 2026,
    summary: t.summary,
    url: "https://melde.vercel.app/",
    body: t.body,
    film: {
      desktop: { src: "/work/melde/melde-desktop.mp4", poster: meldeDesktop },
      mobile: { src: "/work/melde/melde-mobile.mp4", poster: meldeMobile },
      alt: t.alt.film,
    },
    highlights: t.highlights,
    stack: ["HTML", "CSS", "JavaScript", "SVG", "Python", "Vercel"],
    cover: { kind: "image", src: meldeCapa, alt: t.alt.cover, treatment: "none", mobileAspect: 16 / 9 },
    gallery: [
      { kind: "image", src: meldeRotulo, alt: t.alt.label, treatment: "none", mobileAspect: 16 / 9 },
      { kind: "image", src: meldeCelulares, alt: t.alt.phones, treatment: "none", mobileAspect: 16 / 9 },
      { kind: "image", src: meldeMarca, alt: t.alt.brandbook, treatment: "none", mobileAspect: 16 / 9 },
      { kind: "image", src: meldeMarcaCor, alt: t.alt.colours, treatment: "none", mobileAspect: 16 / 9 },
    ],
    placeholder: false,
  }),
  ({ "vida-natural": t }) => ({
    slug: "vida-natural",
    client: "Vida Natural",
    title: "Vida Natural",
    tagline: t.tagline,
    segment: t.segment,
    services: ["sites"],
    scope: t.scope,
    year: 2026,
    summary: t.summary,
    url: "https://vidanaturall.vercel.app/",
    body: t.body,
    highlights: t.highlights,
    stack: ["Next.js", "React", "Prisma", "Tailwind CSS", "Zod", "Mercado Pago"],
    before: {
      media: { kind: "image", src: vidaNaturalAntes, alt: t.alt.before, treatment: "none" },
      changes: t.changes,
    },
    cover: { kind: "image", src: vidaNaturalDepois, alt: t.alt.cover, treatment: "none" },
    placeholder: false,
  }),
];

export function getCases(locale: Locale): CaseStudy[] {
  const words = getDictionary(locale).cases;
  return builders.map((build) => build(words));
}

export function getCase(slug: string, locale: Locale): CaseStudy | undefined {
  return getCases(locale).find((c) => c.slug === slug);
}

export const publishedCases = (locale: Locale) => getCases(locale).filter((c) => !c.placeholder);
