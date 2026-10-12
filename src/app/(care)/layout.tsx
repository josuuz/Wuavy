import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { brandColors } from "@/lib/brand";

/*
  A manutenção de sites: a página de assinatura de cada cliente e o painel.

  Um grupo de rotas separado, fora do (app): a manutenção não é o Pulse e não
  herda o manifesto PWA nem o tema dele. Herda do documento (app/layout.tsx)
  a fonte, os tokens da marca e os observadores de movimento — a identidade
  do site, que é de quem este produto é.

  Em pt-BR, como o Pulse: estas páginas não são públicas e não entram no
  mapa de idiomas do site.
*/

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: brandColors.black,
};

export default function CareLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      {children}
    </>
  );
}
