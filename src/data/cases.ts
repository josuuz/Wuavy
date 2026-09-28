import type { CaseStudy } from "@/lib/types";

import archConcrete from "@/assets/photo/arch-concrete.jpg";
import structureLines from "@/assets/photo/structure-lines.jpg";
import caseArchitecture from "@/assets/photo/case-architecture.jpg";
import vidaNaturalAntes from "@/assets/work/vida-natural-antes.jpg";
import vidaNaturalDepois from "@/assets/work/vida-natural-depois.jpg";

/*
  Cases. The first entry is the featured case on the home page.

  Vida Natural is real work: its images are screenshots of the old site and
  of the new one. The entries marked `placeholder` are reserved slots, not
  real projects: no client, result or metric there is real, and their images
  are licensed stock from the brandbook (src/assets/photo/CREDITS.md).
  To publish a case: replace the fields, set `placeholder: false`, and add
  `result` only with a verified number.
*/

const placeholderSummary =
  "Case em preparação. Aqui entram o desafio, o que construímos e o que mudou.";

export const cases: CaseStudy[] = [
  {
    slug: "vida-natural",
    client: "Vida Natural",
    title: "Vida Natural",
    tagline: "De catálogo antigo a marca de fábrica premium.",
    segment: "Méis e produtos naturais",
    services: ["sites"],
    scope: ["Website", "Identidade Visual"],
    year: 2026,
    summary:
      "Uma fábrica de mel com mais de 40 anos e um site que não mostrava isso. Redesenhamos marca e loja juntas, para o produto aparecer com o peso que tem.",
    url: "https://vidanaturall.vercel.app/",
    body: {
      challenge:
        "O site anterior funcionava como um catálogo: um banner decorativo no topo, as categorias concentradas em um único menu e os produtos listados sem contexto. A história de uma fábrica com quatro décadas não aparecia na tela.",
      approach:
        "Tratamos identidade visual e website como um só projeto. Paleta, tipografia e fotografia de produto passaram a falar a mesma língua, e a navegação foi reorganizada em torno do que o cliente procura: méis, própolis e abelhas sem ferrão.",
      outcome:
        "Uma marca com presença de fábrica premium: visual moderno, conteúdo organizado, navegação direta e produtos apresentados como protagonistas.",
    },
    before: {
      media: {
        kind: "image",
        src: vidaNaturalAntes,
        alt: "Página inicial antiga da Vida Natural: banner decorativo e menu de categorias.",
        treatment: "none",
      },
      changes: [
        "Visual moderno e premium",
        "Conteúdo organizado",
        "Navegação mais clara",
        "Produtos em destaque",
        "Identidade profissional",
      ],
    },
    cover: {
      kind: "image",
      src: vidaNaturalDepois,
      alt: "Nova página inicial da Vida Natural: título editorial e os produtos em destaque.",
      treatment: "none",
    },
    placeholder: false,
  },
  {
    slug: "projeto-01",
    client: "Cliente a publicar",
    title: "Case em preparação",
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
    title: "Case em preparação",
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
    title: "Case em preparação",
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
