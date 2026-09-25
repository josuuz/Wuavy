import type { CaseStudy } from "@/lib/types";

import archConcrete from "@/assets/photo/arch-concrete.jpg";
import structureLines from "@/assets/photo/structure-lines.jpg";
import caseArchitecture from "@/assets/photo/case-architecture.jpg";

/*
  Cases. The first entry is the featured case on the home page.

  PLACEHOLDER: every entry below is a reserved slot, not a real project.
  No client, result or metric here is real. Images are licensed stock from
  the brandbook (credits in src/assets/photo/CREDITS.md).
  To publish a case: replace the fields, set `placeholder: false`, and add
  `result` only with a verified number.
*/

const placeholderSummary =
  "Case em preparação. Aqui entram o desafio, o que construímos e o que mudou.";

export const cases: CaseStudy[] = [
  {
    slug: "projeto-01",
    client: "Cliente a publicar",
    title: "Projeto 01",
    segment: "Segmento a publicar",
    services: ["sites", "trafego-pago"],
    year: 2026,
    summary: placeholderSummary,
    cover: {
      kind: "image",
      src: archConcrete,
      alt: "Fachada de concreto em preto e branco. Imagem de referência.",
      treatment: "mono",
    },
    placeholder: true,
  },
  {
    slug: "projeto-02",
    client: "Cliente a publicar",
    title: "Projeto 02",
    segment: "Segmento a publicar",
    services: ["trafego-pago"],
    year: 2026,
    summary: placeholderSummary,
    cover: {
      kind: "image",
      src: structureLines,
      alt: "Torres e cabos de uma ponte vistos de baixo. Imagem de referência.",
      treatment: "mono",
    },
    placeholder: true,
  },
  {
    slug: "projeto-03",
    client: "Cliente a publicar",
    title: "Projeto 03",
    segment: "Segmento a publicar",
    services: ["sites"],
    year: 2026,
    summary: placeholderSummary,
    cover: {
      kind: "image",
      src: caseArchitecture,
      alt: "Escada de concreto em um interior claro. Imagem de referência em cor, como um trabalho de cliente.",
      treatment: "none",
    },
    placeholder: true,
  },
];

export function getCase(slug: string): CaseStudy | undefined {
  return cases.find((c) => c.slug === slug);
}

export const publishedCases = cases.filter((c) => !c.placeholder);
