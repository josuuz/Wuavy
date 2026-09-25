import Image from "next/image";
import type { CSSProperties } from "react";

import { WordmarkRise } from "@/components/brand/WordmarkRise";
import { Section } from "@/components/layout/Section";
import { HeroChoreography } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import { home } from "@/data/home";
import { heroImage, phrases } from "@/data/variants";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import styles from "./HeroA.module.css";
import { PassoJourney } from "./PassoJourney";
import { PassoStill } from "./PassoStill";

/*
  A · Editorial — the brand moment as a photograph. The intro opens on a
  full-bleed black-and-white street; the wordmark rises out of the bottom
  edge (cover proportions); a glass card carries the one sentence and the
  action. On scroll the photo drifts and darkens and the wordmark docks
  into the header (HeroChoreography).
*/

export function HeroA() {
  return (
    <Section id="inicio" surface="black" label="Início" className={`tx-grain ${styles.hero}`} data-hero="">
      <div className={styles.photo} data-intro-image="">
        <Image src={heroImage.src} alt={heroImage.alt} fill priority sizes="100vw" className={styles.image} />
        <PassoStill />
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <div className={`frame ${styles.top}`}>
        <ul className={styles.details}>
          {home.hero.details.map((d, i) => (
            <li key={d} style={{ "--i": i } as CSSProperties}>
              {d}
            </li>
          ))}
        </ul>

        <div className={styles.card}>
          <h1 className={styles.title}>
            <span className="sr-only">WUAVY. </span>
            {phrases.frequency}
          </h1>
          <p className={styles.lead}>{home.hero.lead}</p>
          <div className={styles.actions}>
            <Button href={contactHref(site.contact.primary)} size="sm">
              {site.cta.label}
            </Button>
            <TextLink href={home.hero.secondary.href} className={styles.secondary}>
              {home.hero.secondary.label}
            </TextLink>
          </div>
        </div>
      </div>

      <div className={styles.brandZone}>
        <div className={styles.wordmark} data-dock-target="">
          <WordmarkRise delay={260} />
        </div>
      </div>

      <HeroChoreography />
      <PassoJourney />
    </Section>
  );
}
