import type { ReactNode } from "react";

/*
  One quiet line icon per screen of the rail, keyed by the screen's slug
  (copy.ts VIEWS). Stroke only, in currentColor, so the active state is a
  colour change, not a different drawing.
*/
const ICONS: Record<string, ReactNode> = {
  "": <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  conversas: <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.4-4.2A7.5 7.5 0 1 1 20 12Z" />,
  oportunidades: (
    <>
      <path d="m11 4 1.8 4.9 4.9 1.8-4.9 1.8L11 17.4l-1.8-4.9-4.9-1.8 4.9-1.8z" />
      <path d="m18.5 15.5.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
    </>
  ),
  vendas: (
    <>
      <path d="m4 17 5-5 4 3.5L20 8" />
      <path d="M15 8h5v5" />
    </>
  ),
  pacientes: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.6a3.2 3.2 0 0 1 0 6" />
      <path d="M17.5 14.8c1.6.6 2.7 2.2 3 4.7" />
    </>
  ),
  agenda: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  procedimentos: (
    <>
      <path d="M5 19C5 10.5 10.5 5 19.5 4.5c.5 9-5 14.5-13 14.5Z" />
      <path d="m5 19 8-8" />
    </>
  ),
  estoque: (
    <>
      <path d="m4 8 8-4 8 4v8.5l-8 4-8-4z" />
      <path d="m4 8 8 4 8-4M12 12v8.5" />
    </>
  ),
  automacoes: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z" />,
  configuracoes: (
    <>
      <path d="M4.5 7h9M18.5 7h1M4.5 17h3M12.5 17h7" />
      <circle cx="16" cy="7" r="2.3" />
      <circle cx="10" cy="17" r="2.3" />
    </>
  ),
};

export function NavIcon({ slug, className }: { slug: string; className?: string }) {
  const icon = ICONS[slug];
  if (!icon) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  );
}
