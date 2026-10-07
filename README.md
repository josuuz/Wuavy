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
| Todos os textos do site (pt-BR e pt-PT) | `src/i18n/dictionaries/pt-BR.tsx` e `pt-PT.tsx`: mesma forma, o TypeScript acusa o que faltar em um dos dois |
| Idiomas e URLs | `src/i18n/config.ts`: pt-BR nas URLs atuais, pt-PT em `/pt-pt`. O `src/proxy.ts` leva para `/pt-pt` quem escolheu pt-PT (cookie) ou, sem escolha, quem está em Portugal (`x-vercel-ip-country`); robôs e o app Pulse nunca são redirecionados |
| Serviços | `src/data/services.ts` (adicione um item; `status: "soon"` esconde; textos nos dicionários) |
| Cases | `src/data/cases.ts` (fatos e mídia; textos nos dicionários, em `cases`; siga o "Padrão de case" abaixo) |
| Contato, redes, WhatsApp oficial | `src/data/site.ts` (troque e-mail por WhatsApp, calendário ou formulário aqui) |
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

## Padrão de case

Todo projeto entra do mesmo jeito: uma linha em **Projetos** na home e uma página em `/trabalho/<slug>`, sempre nesta ordem (capítulo sem conteúdo é pulado e a numeração fecha):

1. **Capa**: título, resumo, link "Ver o site no ar", fatos (cliente, segmento, serviço ou combo, ano) e imagem de capa
2. **Antes e depois**: só em redesign (`before`)
3. **Desafio** · **O que fizemos**: `body.challenge`, `body.approach`
4. **Em movimento**: vídeo do site no ar, 16:9 no computador e 9:16 no celular (`film`)
5. **Destaques técnicos**: 3 a 5 decisões técnicas, cada uma verdadeira no que foi entregue, com a stack (`highlights`, `stack`)
6. **O que mudou**: `body.outcome`, e `result` só com número verificado
7. **Galeria**: telas 16:9 (`gallery`; use `mobileAspect: 16 / 9` em prints que não podem ser cortados)

### Checklist de um case novo

| Peça | Formato | Onde |
|---|---|---|
| Capa | print 16:9 do topo, 2400×1350 JPG | `src/assets/work/<slug>-capa.jpg` |
| Antes (redesign) | print do site antigo, mesmo enquadramento | `src/assets/work/<slug>-antes.jpg` |
| Vídeos + pôsteres | gerados pelo script abaixo | `public/work/<slug>/`, `src/assets/work/` |
| Galeria | 2 a 4 prints 16:9 (detalhe, celulares, marca) | `src/assets/work/<slug>-*.jpg` |
| Texto | resumo, desafio, o que fizemos, o que mudou, destaques | `src/i18n/dictionaries/*` (`cases`), nos dois idiomas; stack em `src/data/cases.ts` |

O texto diz o que foi feito de verdade: redesign é redesign, imagem gerada por IA é dita como tal, e nenhum número entra sem ser verificado.

### Vídeo do case

`scripts/case-video.mjs` grava o site rolando do topo ao rodapé, quadro a quadro com o relógio da página congelado, então entradas, reveals e animações de scroll saem suaves em qualquer máquina. Gera `<slug>-desktop.mp4` (1600×900), `<slug>-mobile.mp4` (720×1280) e os dois pôsteres.

```bash
npm i --no-save playwright-core ffmpeg-static   # uma vez; não entra no package.json
npx playwright-core install chromium
node scripts/case-video.mjs --url https://site-do-cliente.com --slug cliente \
  --stops "#sobre:1.2,#produtos+40:1.4,end:1.6"
```

`--stops` lista onde a câmera para (`seletor[+deslocamento]:segundos`, `end` = rodapé); sem ele, o vídeo rola a página inteira de uma vez. Os vídeos tocam sem som, em loop e só quando aparecem na tela; com "reduzir movimento" ativo, esperam o toque.

## Motion

O contrato e os pontos de encaixe de `CustomCursor`, `MagneticButton`, `ScrollSection` e `PageTransition` estão em `src/components/motion/README.md`.

## Pendências de conteúdo (marcadas com `TODO` no código)

- E-mail de contato: `ola@wuavy.com` vem do brandbook. Confirmar.
- Perfis sociais e página de privacidade: sem link até existirem.
- Cases: os três são espaços reservados, com fotos de banco de imagens.
- Entregáveis de cada serviço: confirmar escopo.
- Os resultados de serviço em português ("Encontrar o mercado.", "Converter a atenção.") são texto novo: a marca só aprovou as versões em inglês.
