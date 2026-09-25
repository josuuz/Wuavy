# WUAVY — site

Site oficial da WUAVY, construído sobre a identidade **Direção A — Frequência**. A fonte da marca fica em `C:\Users\User\ID Wuavy\` (`brand/DESIGN.md`, `brand/tokens`, `brand/logo`, brandbook). Este projeto não altera nada lá.

## Rodar

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + build
npm run build && npm start
```

Defina `NEXT_PUBLIC_SITE_URL` no deploy (usado em metadata, sitemap e Open Graph). Sem ela, o site assume `https://wuavy.com`.

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. Nenhuma biblioteca de animação: o motion desta versão é CSS mais um único IntersectionObserver.

## Onde editar

| O quê | Arquivo |
|---|---|
| Textos da home | `src/data/home.ts` (cada linha marcada como `approved` ou `new`) |
| Serviços | `src/data/services.ts` (adicione um item; `status: "soon"` esconde) |
| Cases | `src/data/cases.ts` (os três atuais são placeholders) |
| Método | `src/data/process.ts` |
| Contato, navegação, redes | `src/data/site.ts` (troque e-mail por WhatsApp, calendário ou formulário aqui) |
| Tokens (cor, tipo, grid, motion) | `src/styles/tokens.css` (único lugar com os valores da marca) |

## Estrutura

```
src/
  app/                 rotas, layout, metadata, robots, sitemap, OG, /trabalho/[slug]
  components/
    brand/             Wordmark, WordmarkSequence, FrequencyBuild, FrequencyRow, paths do logo
    layout/            Header, MobileMenu, Footer, Section (+ ChapterHead)
    sections/          Hero, Idea, Services, Manifesto, Work, Process, Contact
    work/              WorkCard, CaseMedia (imagem hoje, vídeo preparado)
    motion/            TextReveal, WidthWave, ImageReveal, RevealObserver + README
    ui/                Button, TextLink
  data/                conteúdo tipado
  hooks/               usePrefersMotion
  lib/                 types, contact, frequency, seo, brand, motion/tokens, motion/wave
  styles/              tokens.css, base.css, motion.css
  assets/photo/        fotos licenciadas (créditos em CREDITS.md)
```

## Motion

O contrato e os pontos de encaixe de `CustomCursor`, `MagneticButton`, `ScrollSection` e `PageTransition` estão em `src/components/motion/README.md`.

## Pendências de conteúdo (marcadas com `TODO` no código)

- E-mail de contato: `ola@wuavy.com` vem do brandbook. Confirmar.
- Perfis sociais e página de privacidade: sem link até existirem.
- Cases: os três são espaços reservados, com fotos de banco de imagens.
- Entregáveis de cada serviço: confirmar escopo.
- Os resultados de serviço em português ("Encontrar o mercado.", "Converter a atenção.") são texto novo: a marca só aprovou as versões em inglês.
