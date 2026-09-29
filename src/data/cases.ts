import type { CaseStudy } from "@/lib/types";

import vidaNaturalAntes from "@/assets/work/vida-natural-antes.jpg";
import vidaNaturalDepois from "@/assets/work/vida-natural-depois.jpg";

/*
  Cases: real work only, newest first. Each one gets a row on the home page
  and its own page. Say what was actually done: an existing site redesigned
  is a redesign, not a brand built from zero. Add `result` only with a
  verified number.

  Vida Natural: its images are screenshots of the old site and of the new one.
*/

export const cases: CaseStudy[] = [
  {
    slug: "vida-natural",
    client: "Vida Natural",
    title: "Vida Natural",
    tagline: "Redesign do site de uma fábrica de méis com mais de 40 anos.",
    segment: "Méis e produtos naturais",
    services: ["sites"],
    scope: ["Redesign de site"],
    year: 2026,
    summary:
      "A fábrica, a marca e os produtos já existiam; o site não mostrava o peso deles. Redesenhamos o site existente para apresentar tudo com clareza.",
    url: "https://vidanaturall.vercel.app/",
    body: {
      challenge:
        "O site anterior funcionava como um catálogo: um banner decorativo no topo, as categorias concentradas em um único menu e os produtos listados sem contexto. A história de uma fábrica com quatro décadas não aparecia na tela.",
      approach:
        "Partimos do site e da marca que já existiam. Reorganizamos a navegação em torno do que o cliente procura (méis, própolis e abelhas sem ferrão), demos à fotografia de produto o papel principal e alinhamos cores e tipografia do site à identidade da marca.",
      outcome:
        "Um site à altura da fábrica: visual moderno, conteúdo organizado, navegação direta e produtos apresentados como protagonistas.",
    },
    before: {
      media: {
        kind: "image",
        src: vidaNaturalAntes,
        alt: "Página inicial antiga da Vida Natural: banner decorativo e menu de categorias.",
        treatment: "none",
      },
      changes: [
        "Visual moderno",
        "Conteúdo organizado",
        "Navegação mais clara",
        "Produtos em destaque",
        "Apresentação mais profissional",
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
];

export function getCase(slug: string): CaseStudy | undefined {
  return cases.find((c) => c.slug === slug);
}

export const publishedCases = cases.filter((c) => !c.placeholder);
