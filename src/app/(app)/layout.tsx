import type { ReactNode } from "react";

/* The Pulse's chrome: only the skip link (its screens hold #conteudo). The app speaks pt-BR. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      {children}
    </>
  );
}
