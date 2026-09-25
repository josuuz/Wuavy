# Motion layer

The brand moves in three ways only (`ID Wuavy/brand/DESIGN.md` → Motion):

1. **Propagation**: neighbours start 42 ms apart, like a wave.
2. **Width shift**: `font-stretch` 100 → 125 → 100. The start state is always visible.
3. **Channel wipe**: a diagonal at 20.81°, top left to bottom right.

Everything here serves one of the three. If an effect doesn't, it doesn't ship.

## Contract

- Sections import from `@/components/motion`, never from `motion/react` or any other library.
- An animated element's **base style is its final state**. Keyframes carry the start state, with `animation-fill-mode: both`.
- Every animated element carries `data-anim`. Inside a `data-reveal` container it stays paused until `RevealObserver` sets `data-inview`.
- Only `transform`, `opacity`, `clip-path` and `font-stretch` animate. Weight and size never do. Anything that runs every frame (scroll-driven or looping) animates `transform` or `opacity` only, so the compositor carries it; never `filter`, `backdrop-filter` or a custom property feeding `clip-path`.
- Scroll followers subscribe to `lib/motion/frame` (one scroll listener, one rAF, reads before writes) instead of adding their own listeners, and write to the DOM only when a value changed.
- Loops run only on screen: mark the element `data-loop` and pause its animation under `:not([data-onscreen])` (`RevealObserver` toggles it).

## Tiers

- **Full**: capable desktops.
- **Light** (`html[data-perf="lite"]`, set before first paint by the boot script in `app/layout.tsx`): touch screens, ≤2 cores or ≤2 GB, ≤4 cores with ≤4 GB, Save-Data, or a machine the intro timed as slow (median frame > 26 ms, remembered in `localStorage`). Keeps every signature animation; drops the grain, the hero card blur, native-scroll-only (no Lenis), and the width shift in the manifesto, the mobile menu and wave entries.
- **Reduced motion** (`prefers-reduced-motion: reduce`): reduce, don't remove. The intro, PASSO, the reveals and hovers stay; parallax (hero photo, work cards), the hero zoom, Lenis inertia, the manifesto letter wave and the loops (wave band, cursor rays) go. Windows reports this whenever "Show animations" is off, so it is common; the site must still feel alive there.
- Tokens: CSS in `src/styles/tokens.css` (`--wuavy-ease-out`, `--duration-*`, `--wuavy-wave-step`); JS mirror in `src/lib/motion/tokens.ts`.

## What exists

| Component | Engine | Used by |
|---|---|---|
| `TextReveal` | CSS, per word | Hero title |
| `LineReveal` | CSS + a line measure (ResizeObserver) | Ideia, Sistemas and Diferenciais headlines |
| `WidthWave` | CSS + a pointer listener | Service outcomes, contact |
| `ImageReveal` | CSS clip-path channel | Work covers, case page |
| `HeroChoreography` | Shared scroll frame, one transform | Hero: the wordmark's flight into the header |
| `CustomCursor` | One pointermove listener, work batched per frame | Root layout: module cursor, magnetic buttons, row lights |
| `PageTransition` | React `<ViewTransition>` + `styles/transitions.css` | `app/template.tsx`, `app/trabalho/template.tsx` |
| `RevealObserver` | IntersectionObservers (reveal once, videos, loops on screen) | Root layout |
| `WordmarkSequence`, `FrequencyBuild`, `WaveField` (in `components/brand`) | CSS | Hero, contact, footer |

Scroll-driven motion is plain CSS (`animation-timeline: view() / scroll()`), always inside `@supports`, so unsupported browsers get the static layout:
hero text leaving, the Ideia sheet's lift shadow, the services path marker and row focus, the manifesto sweep and width wave, the case image drift, the method rail.

## Hooks in the markup

- `data-cursor="view"` + `data-cursor-label` on case links; `data-cursor="action"` or any link/button for the channel state.
- `data-magnetic` / `data-magnetic-inner` on buttons: only the inner label moves.
- `data-spot-host` / `data-spot` on service rows: the light under the pointer.
- `data-hero`, `data-dock-target`, `data-field`, `data-hero-light`, `data-header-brand`: read by `HeroChoreography`.

## Still open

| Component | Where it goes |
|---|---|
| `ScrollSection` | Inside `components/layout/Section.tsx`, if a section ever needs JS scroll values; everything so far is CSS. Never pin. |
| Case preview video on hover | `CaseMedia` already renders video that plays only in view (`data-inview-play`); needs real case videos. |

## Adding a library

`motion` is not installed. Add it when a component needs springs or scroll-linked values (magnetic, scroll progress). Use `motion/react-mini` or `LazyMotion` + `m` with `domAnimation` to keep it small. For components copied from 21st.dev: replace `framer-motion` imports with `motion/react`, and wrap each one here so it respects reduced motion and hover capability.
