import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PwaShell } from "@/components/flow/PwaShell";

/*
  The Pulse's chrome: only the skip link (its screens hold #conteudo). The app
  speaks pt-BR.

  It is also where the Pulse becomes installable. The manifest is linked here
  and nowhere else, so the public site is never offered as an app: its scope
  is /pulse/, which starts the app on /pulse/app and leaves wuavy.com alone.

  Safari builds no launch screen of its own (WebKit 268643), so every iPhone
  size is listed below; Android draws its own from the manifest. The screens
  are the Pulse's light ground with the mark, so the launch runs into the app.
*/

/** Portrait iPhones in circulation: CSS width, CSS height, pixel ratio. */
const IPHONES = [
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [360, 780, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
] as const;

export const metadata: Metadata = {
  manifest: "/pulse.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pulse",
    statusBarStyle: "default",
    startupImage: IPHONES.map(([w, h, ratio]) => ({
      url: `/splash/${w * ratio}x${h * ratio}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  // Installed, the app owns the whole screen; the shell pads itself back off the notch.
  viewportFit: "cover",
  themeColor: "#f3f3f0",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      {children}
      <PwaShell />
    </>
  );
}
