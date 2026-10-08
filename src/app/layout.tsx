import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";

import { CustomCursor, RevealObserver } from "@/components/motion";
import { site } from "@/data/site";
import { defaultLocale, ogLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { brandColors } from "@/lib/brand";
import { shareImage } from "@/lib/seo";
import "./globals.css";

// One family. Both axes: weight builds hierarchy, width is reserved for motion.
const mona = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-mona",
});

// The defaults (pt-BR). The public site's layout restates them in the visitor's language.
const { meta } = getDictionary(defaultLocale);

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: meta.title,
    template: `%s | ${site.name}`,
  },
  description: meta.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    locale: ogLocale(defaultLocale),
    siteName: site.name,
    title: meta.title,
    description: meta.description,
    url: "/",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: meta.title,
    description: meta.description,
    images: [shareImage.url],
  },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  themeColor: brandColors.black,
  colorScheme: "dark light",
};

/*
  Marks the document as scripted before first paint, so reveal content can
  wait for the viewport. If the app never boots, the mark is removed and
  everything simply shows (see styles/motion.css).

  It also picks the motion tier before first paint: html[data-perf="lite"]
  for touch screens, machines with few cores or little memory, Save-Data,
  or a machine the intro measured as slow on an earlier visit. The light
  tier keeps every signature animation and drops the costly extras.

  And it sets the Pulse's theme: light, the default, unless dark was
  chosen (components/flow/ThemeToggle), so the app never flashes the other.
*/
const bootScript = `document.documentElement.classList.add('js');try{var t=null;try{t=localStorage.getItem('wuavy-pulse-theme')}catch(e){}if(t!=='dark')document.documentElement.setAttribute('data-pulse-theme','light')}catch(e){}try{if(sessionStorage.getItem('wuavy-intro'))document.documentElement.setAttribute('data-intro-done','')}catch(e){}try{var n=navigator,c=n.hardwareConcurrency||8,d=n.deviceMemory||8,s=n.connection&&n.connection.saveData;if(matchMedia('(pointer: coarse)').matches||c<=2||d<=2||(c<=4&&d<=4)||s||localStorage.getItem('wuavy-perf')==='lite')document.documentElement.setAttribute('data-perf','lite')}catch(e){}setTimeout(function(){if(!window.__wuavyReveal)document.documentElement.classList.remove('js')},4000);`;

/*
  The document only. Page chrome lives in route groups: (site)/[locale]
  renders the site's skip link, header and footer in the visitor's language
  (and sets <html lang> once it runs); (app) is the Pulse's, in pt-BR.
*/
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={mona.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        {children}
        <RevealObserver />
        <CustomCursor />
      </body>
    </html>
  );
}
