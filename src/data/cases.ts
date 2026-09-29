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

  Vida Natural: its images are screenshots of the old site and of the new one;
  its highlights come from the project's own README.
  Meldê: brand built from zero, so no "before". Its photography is AI-made art
  direction, labelled on the site; the film is a recording of the landing.
*/

export const cases: CaseStudy[] = [
  {
    slug: "melde",
    client: "Meldê",
    title: "Meldê",
    tagline: "Marca, rótulo e landing de lançamento de um mel cremoso.",
    segment: "Alimentos · mel cremoso",
    services: ["sites"],
    scope: ["Identidade visual", "Landing page"],
    year: 2026,
    summary:
      "Uma marca de mel cremoso criada do zero: o nome em minúsculas com o ê como assinatura, o rótulo, o design system e a landing que valida o lançamento antes da loja.",
    url: "https://melde.vercel.app/",
    body: {
      challenge:
        "Mel cremoso é pouco conhecido e, quando aparece, vem vestido de rústico: abelha, favo, papel kraft. A Meldê precisava parecer um produto de prateleira desejável, perto do doce de leite no uso e longe da loja natural e do suplemento.",
      approach:
        "Criamos a identidade do zero e fizemos da página o rótulo do pote aberto em plano: fundos branco de rótulo e marrom de tampa, o dourado guardado para o produto e para a ação, fotografia macro da textura e um único fio de mel que atravessa a página do topo até o pedido final.",
      outcome:
        "Uma marca pronta para a prateleira e para a loja: logo, rótulo, manual de marca, design system documentado e uma landing leve com lista de espera, que mede o interesse antes do e-commerce.",
    },
    film: {
      desktop: { src: "/work/melde/melde-desktop.mp4", poster: meldeDesktop },
      mobile: { src: "/work/melde/melde-mobile.mp4", poster: meldeMobile },
      alt: "Gravação da landing da Meldê rolando do topo ao rodapé, no computador e no celular.",
    },
    highlights: [
      {
        title: "Um fio de mel que acompanha a leitura",
        text: "Desenhado em SVG a partir do layout real, o fio cresce com o scroll: grosso na colher, afinando com o peso, com borda âmbar e uma gota na ponta. A cada quadro só o trecho da ponta é redesenhado.",
      },
      {
        title: "Rótulo aplicado por código",
        text: "O pote de referência foi gerado com o rótulo em branco. O rótulo real foi enrolado no vidro por projeção cilíndrica e recortado com máscara própria, num script em Python.",
      },
      {
        title: "Design system pronto para a loja",
        text: "Cores, tipografia, espaçamento e movimento em tokens CSS; botões, campos, tabelas e janelas como componentes separados da página. O e-commerce nasce sobre a mesma base.",
      },
      {
        title: "Leve, sem framework",
        text: "HTML, CSS e JavaScript puros, sem build: uma única fonte variável hospedada no projeto, imagens WebP responsivas e nenhuma dependência externa.",
      },
      {
        title: "Acessível por padrão",
        text: "Contraste AA verificado nos pares de texto, seletor de momentos navegável pelo teclado e, com “reduzir movimento” ativo, a página aparece pronta e o fio já desenhado.",
      },
    ],
    stack: ["HTML", "CSS", "JavaScript", "SVG", "Python", "Vercel"],
    cover: {
      kind: "image",
      src: meldeCapa,
      alt: "Topo da landing da Meldê: o título “Mel, só que cremoso.” ao lado do pote e de uma colher puxando o mel.",
      treatment: "none",
      mobileAspect: 16 / 9,
    },
    gallery: [
      {
        kind: "image",
        src: meldeRotulo,
        alt: "A frente do pote em escala de parede: rótulo meldê, Original, mel cremoso, 100% mel e 250 g, com o creme aparecendo pelo vidro.",
        treatment: "none",
        mobileAspect: 16 / 9,
      },
      {
        kind: "image",
        src: meldeCelulares,
        alt: "Três telas da landing no celular: o topo com o pote, a frente do rótulo e a lista de espera.",
        treatment: "none",
        mobileAspect: 16 / 9,
      },
      {
        kind: "image",
        src: meldeMarca,
        alt: "Capa do manual de marca: o wordmark meldê em creme sobre marrom, com o circunflexo dourado.",
        treatment: "none",
        mobileAspect: 16 / 9,
      },
      {
        kind: "image",
        src: meldeMarcaCor,
        alt: "Página de cor do manual: mel dourado, marrom profundo, branco e creme.",
        treatment: "none",
        mobileAspect: 16 / 9,
      },
    ],
    placeholder: false,
  },
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
    highlights: [
      {
        title: "Catálogo real, nada inventado",
        text: "Produtos, preços, descrições e fotos foram extraídos do site antigo e levados para um banco de dados. Um script recorta o fundo branco das fotos, para as embalagens flutuarem sobre a página.",
      },
      {
        title: "Preço calculado no servidor",
        text: "O navegador nunca envia preço: o carrinho é recalculado a partir do banco a cada mudança e de novo antes de o pedido ser gravado.",
      },
      {
        title: "Checkout pronto para ativar",
        text: "Mercado Pago com PIX, cartão e boleto e webhook assinado. Sem as credenciais, o pedido segue pelo WhatsApp, como a loja já opera.",
      },
      {
        title: "Testado de ponta a ponta",
        text: "Fluxo de compra, interface e links cobertos por testes automatizados, sem quebra de layout em cinco larguras de tela.",
      },
    ],
    stack: ["Next.js", "React", "Prisma", "Tailwind CSS", "Zod", "Mercado Pago"],
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
