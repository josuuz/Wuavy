import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { FlowGuide } from "@/components/flow/FlowGuide";
import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import { flow } from "@/data/flow";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { pad } from "@/lib/utils";
import styles from "./page.module.css";

/*
  Wuavy Flow: the product inside "Sistemas de crescimento", first for
  aesthetic clinics. Black hero with PASSO as the guide, the four gaps on
  Paper, how it works on Black (the five stages and one worked example), and
  the call on Carbon running into the footer. The demo link waits on
  flow.close.demo.ready.
*/

export const metadata: Metadata = {
  title: flow.meta.title,
  description: flow.meta.description,
  alternates: { canonical: "/flow" },
  openGraph: { title: flow.meta.title, description: flow.meta.description, url: "/flow" },
};

export default function FlowPage() {
  const { hero, gaps, how, close } = flow;
  const talk = contactHref(site.contact.primary, flow.name);

  return (
    <>
      <Section id="flow" surface="black" label={flow.name} className={`tx-grain ${styles.hero}`}>
        <div className={`tx-light ${styles.light}`} data-tone="signal" aria-hidden="true" />
        <div className={`frame ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <p className={styles.label}>
              <span className={styles.labelName}>{hero.label}</span>
              <span>{flow.pitch}</span>
            </p>
            <h1 className={styles.title}>
              <LineReveal text={hero.title} step={120} />
            </h1>
            <p className={styles.lead}>{hero.lead}</p>
            <div className={styles.actions}>
              <Button href={talk}>{hero.cta}</Button>
              <TextLink href={hero.secondary.href}>{hero.secondary.label}</TextLink>
            </div>
            <p className={styles.market}>{hero.market}</p>
          </div>
          <FlowGuide className={styles.guide} />
        </div>
      </Section>

      <Section id="oportunidades" surface="paper" label={gaps.chapter} className={`tx-grain ${styles.gaps}`}>
        <div className="frame">
          <ChapterHead index={1} name={gaps.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{gaps.title}</h2>
          <ol className={styles.gapList}>
            {gaps.items.map((item, i) => (
              <li key={item.name} className={styles.gap}>
                <span className={styles.index}>{pad(i + 1)}</span>
                <h3 className={styles.gapName}>{item.name}</h3>
                <p className={styles.gapText}>{item.text}</p>
                <p className={styles.gapAction}>
                  <span aria-hidden="true">→ </span>
                  {item.action}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="como-funciona" surface="black" label={how.chapter} className={`tx-grain ${styles.how}`}>
        <div className="frame">
          <ChapterHead index={2} name={how.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{how.title}</h2>
          <p className={styles.howLead}>{how.lead}</p>

          <ol className={styles.stages}>
            {how.stages.map((stage, i) => (
              <li key={stage.name} className={styles.stage} style={{ "--i": i } as CSSProperties}>
                <span className={styles.index}>{pad(i + 1)}</span>
                <h3 className={styles.stageName}>{stage.name}</h3>
                <p className={styles.stageText}>{stage.text}</p>
              </li>
            ))}
          </ol>

          <div className={styles.example}>
            <p className={styles.exampleHead}>
              <span>{how.example.title}</span>
              <span className={styles.note}>{how.example.note}</span>
            </p>
            <ol className={styles.chain}>
              {how.example.steps.map((step, i) => (
                <li key={step.label} className={styles.link} style={{ "--i": i } as CSSProperties}>
                  <span className={styles.linkLabel}>{step.label}</span>
                  <p className={styles.linkText}>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section id="conhecer" surface="carbon" label={close.chapter} className={`tx-grain ${styles.close}`}>
        <div className={`tx-light ${styles.closeLight}`} data-tone="signal" aria-hidden="true" />
        <div className={`frame ${styles.closeGrid}`}>
          <ChapterHead index={3} name={close.chapter} className={styles.chapter} />
          <h2 className={styles.closeTitle}>{close.title}</h2>
          <div className={styles.closeAction}>
            <p className={styles.closeLead}>{close.lead}</p>
            <div className={styles.actions}>
              <Button href={talk}>{close.cta}</Button>
              {close.demo.ready ? (
                <TextLink href={close.demo.href}>{close.demo.label}</TextLink>
              ) : (
                <span className={styles.soon}>{close.demo.soon}</span>
              )}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
