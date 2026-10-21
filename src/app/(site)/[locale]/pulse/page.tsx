import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties } from "react";

import { FlowGuide } from "@/components/flow/FlowGuide";
import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal, Reveal } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import { isLocale, localizePath, ogLocale, pageAlternates } from "@/i18n/config";
import { getDictionary, talkHref } from "@/i18n/dictionaries";
import { shareImage, softwareJsonLd } from "@/lib/seo";
import { pad } from "@/lib/utils";
import mockupOpportunities from "@/assets/pulse/mockup-opportunities.png";
import mockupOverview from "@/assets/pulse/mockup-overview.png";
import styles from "./page.module.css";

/*
  Wuavy Pulse, the commercial page: the clinic's real differential — showing
  where revenue sits idle, not just another booking calendar — carried end to
  end, hero to pricing. Every front named in "fronts" and every claim in
  "priority" was checked against src/lib/flow/insights.ts before writing: what
  isn't computed yet (automatic recovery) says "Em breve", never "now".
  PASSO (FlowGuide) stays in the hero only — a guide, not a mascot plastered
  on every section. Screenshots in "interfaces" are real captures of the demo,
  not illustrations. The words are the dictionaries' `pulse`.
*/

export async function generateMetadata({ params }: PageProps<"/[locale]/pulse">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { title, description } = getDictionary(locale).pulse.meta;
  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(locale, "/pulse"),
    openGraph: { title, description, url: localizePath(locale, "/pulse"), locale: ogLocale(locale), images: [shareImage] },
  };
}

export default async function FlowPage({ params }: PageProps<"/[locale]/pulse">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const flow = getDictionary(locale).pulse;
  const { hero, guide, fronts, priority, interfaces, pricing, faq, close } = flow;
  const talk = talkHref(locale, flow.name);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            softwareJsonLd({ name: flow.name, description: flow.meta.description, url: localizePath(locale, "/pulse") }),
          ),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* ── Hero: the promise, the number it stands on, PASSO beside it ── */}
      <Section id="pulse" surface="black" label={flow.name} className={`tx-grain ${styles.hero}`}>
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
              <Button href={hero.ctaHref}>{hero.cta}</Button>
              <TextLink href={hero.secondary.href}>{hero.secondary.label}</TextLink>
            </div>
            <p className={styles.talk}>
              <TextLink href={talk}>{hero.talk}</TextLink>
            </p>
            <p className={styles.market}>{hero.market}</p>
          </div>

          <div className={styles.heroSide}>
            <Reveal delay={160} className={styles.stat}>
              <span className={styles.statValue}>{hero.stat.value}</span>
              <span className={styles.statLabel}>{hero.stat.label}</span>
              <span className={styles.statNote}>{hero.stat.note}</span>
            </Reveal>
            <FlowGuide guide={guide} className={styles.guide} />
          </div>
        </div>
      </Section>

      {/* ── The seven fronts: real, audited against the opportunity engine ── */}
      <Section id="frentes" surface="paper" label={fronts.chapter} className={`tx-grain ${styles.fronts}`}>
        <div className="frame">
          <ChapterHead index={1} name={fronts.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{fronts.title}</h2>
          <p className={styles.frontsLead}>{fronts.lead}</p>

          <ol className={styles.frontList}>
            {fronts.items.map((item, i) => (
              <li key={item.name} className={styles.front} style={{ "--i": i } as CSSProperties}>
                <span className={styles.frontTag}>{item.tag}</span>
                <h3 className={styles.frontName}>{item.name}</h3>
                <p className={styles.frontText}>{item.text}</p>
                <p className={styles.frontExample}>
                  <span aria-hidden="true">→ </span>
                  {item.example}
                </p>
              </li>
            ))}
          </ol>

          <p className={styles.caveat}>{fronts.caveat}</p>
        </div>
      </Section>

      {/* ── How the engine turns those fronts into one decision ── */}
      <Section id="prioridade" surface="black" label={priority.chapter} className={`tx-grain ${styles.priority}`}>
        <div className="frame">
          <ChapterHead index={2} name={priority.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{priority.title}</h2>
          <p className={styles.priorityLead}>{priority.lead}</p>

          <ol className={styles.priorityChain}>
            {priority.steps.map((step, i) => (
              <li key={step.label} className={styles.priorityStep} style={{ "--i": i } as CSSProperties}>
                <span className={styles.priorityLabel}>{step.label}</span>
                <p className={styles.priorityText}>{step.text}</p>
              </li>
            ))}
          </ol>

          <p className={styles.priorityNote}>{priority.note}</p>
        </div>
      </Section>

      {/* ── The real interface: two captures of the actual demo, not drawings ── */}
      <Section id="interfaces" surface="carbon" label={interfaces.chapter} className={`tx-grain ${styles.interfaces}`}>
        <div className="frame">
          <ChapterHead index={3} name={interfaces.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{interfaces.title}</h2>
          <p className={styles.interfacesLead}>{interfaces.lead}</p>

          <div className={styles.screens}>
            <figure className={styles.screen}>
              <div className={styles.chrome} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <Image src={mockupOverview} alt="" className={styles.screenImage} sizes="(min-width: 1024px) 50vw, 100vw" priority />
              <figcaption className={styles.screenCaption}>
                <span className={styles.screenLabel}>{interfaces.overview.label}</span>
                {interfaces.overview.caption}
              </figcaption>
            </figure>

            <figure className={styles.screen} style={{ "--i": 1 } as CSSProperties}>
              <div className={styles.chrome} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <Image src={mockupOpportunities} alt="" className={styles.screenImage} sizes="(min-width: 1024px) 50vw, 100vw" />
              <figcaption className={styles.screenCaption}>
                <span className={styles.screenLabel}>{interfaces.opportunities.label}</span>
                {interfaces.opportunities.caption}
              </figcaption>
            </figure>
          </div>
        </div>
      </Section>

      {/* ── Pricing: one plan, the founder guarantee, nothing hidden ── */}
      <Section id="assinatura" surface="paper" label={pricing.chapter} className={`tx-grain ${styles.pricing}`}>
        <div className="frame">
          <ChapterHead index={4} name={pricing.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{pricing.title}</h2>
          <p className={styles.pricingLead}>{pricing.lead}</p>

          <div className={styles.plan}>
            <p className={styles.price}>
              <span className={styles.priceValue}>{pricing.price}</span>
              <span className={styles.pricePer}>{pricing.per}</span>
            </p>

            <ul className={styles.includes}>
              {pricing.includes.map((item, i) => (
                <li key={item} style={{ "--i": i } as CSSProperties}>
                  {item}
                </li>
              ))}
            </ul>

            <p className={styles.comingLabel}>{pricing.comingLabel}</p>
            <ul className={styles.coming}>
              {pricing.coming.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <p className={styles.founder}>{pricing.founder}</p>

            <div className={styles.actions}>
              <Button href={pricing.ctaHref}>{pricing.cta}</Button>
              <TextLink href={talk}>{pricing.talk}</TextLink>
            </div>
          </div>
        </div>
      </Section>

      {/* ── FAQ: native <details>, one open at a time, FAQPage JSON-LD above ── */}
      <Section id="faq" surface="fog" label={faq.chapter} className={`tx-grain ${styles.faqSection}`}>
        <div className="frame">
          <ChapterHead index={5} name={faq.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{faq.title}</h2>

          <div className={styles.faqList}>
            {faq.items.map((item, i) => (
              <details key={item.q} className={styles.faqItem} name="pulse-faq">
                <summary className={styles.faqQuestion}>
                  <span className={styles.index}>{pad(i + 1)}</span>
                  <span>{item.q}</span>
                  <span className={styles.faqIcon} aria-hidden="true" />
                </summary>
                <p className={styles.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <Section id="conhecer" surface="carbon" label={close.chapter} className={`tx-grain ${styles.close}`}>
        <div className={`tx-light ${styles.closeLight}`} data-tone="signal" aria-hidden="true" />
        <div className={`frame ${styles.closeGrid}`}>
          <ChapterHead index={6} name={close.chapter} className={styles.chapter} />
          <h2 className={styles.closeTitle}>{close.title}</h2>
          <div className={styles.closeAction}>
            <p className={styles.closeLead}>{close.lead}</p>
            <div className={styles.actions}>
              <Button href={close.ctaHref}>{close.cta}</Button>
              {close.demo.ready ? (
                <TextLink href={close.demo.href}>{close.demo.label}</TextLink>
              ) : (
                <span className={styles.soon}>{close.demo.soon}</span>
              )}
            </div>
            <p className={styles.talk}>
              <TextLink href={talk}>{close.talk}</TextLink>
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
