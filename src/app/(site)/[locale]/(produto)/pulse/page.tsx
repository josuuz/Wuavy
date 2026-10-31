import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal, Reveal } from "@/components/motion";
import { Pulse } from "@/components/flow/Pulse";
import { Fronts } from "@/components/pulse/Fronts";
import { HeroSequence } from "@/components/pulse/HeroSequence";
import { Scenarios } from "@/components/pulse/Scenarios";
import { Tour } from "@/components/pulse/Tour";
import { TrackLinks } from "@/components/pulse/TrackLinks";
import { Button } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import { isLocale, localizePath, ogLocale, pageAlternates } from "@/i18n/config";
import { getDictionary, talkHref } from "@/i18n/dictionaries";
import { shareImage, softwareJsonLd } from "@/lib/seo";
import { pad } from "@/lib/utils";
import styles from "./page.module.css";

/*
  PULSE by WUAVY, the public page.

  It answers six questions in the order a clinic asks them: what it is, is it
  for me, what does it fix in my day, how does it work, what does it cost, how
  do I start. Each one is a section, and each section is either light or dark
  so the page reads as a sequence of rooms rather than one long scroll.

  Three rules this file keeps:

  · nothing load-bearing waits for JavaScript. The title, the lead, both
    buttons, all seven fronts' names, the whole plan and the whole FAQ are
    server-rendered text. The four interactive pieces (the hero's sequence,
    the three situations, the fronts opening, the tour) add a picture and a
    choice on top of words that are already there;
  · every claim is one the code can back. The fronts are the opportunity
    engine's seven (lib/flow/insights.ts); the plan is PRICE and the terms;
    the three steps to start are the three routes that actually enforce the
    path (pulse/entrar → pulse/assinar → pulse/comecar). What is not built
    says "em breve" and sits apart from what the plan includes;
  · the product is the protagonist. The Pulse character appears twice — once
    to ask the question in "Como funciona", once at the close — and nowhere
    else. It guides; it never performs, and it is never shown doing something
    the product cannot do.

  The words are the dictionaries' `pulse` (src/i18n/dictionaries), in both
  languages. The product's own screens are drawn in components/pulse/product.tsx.
*/

export async function generateMetadata({ params }: PageProps<"/[locale]/pulse">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { title, description } = getDictionary(locale).pulse.meta;
  return {
    // `absolute`: the title already names the product and the agency.
    title: { absolute: title },
    description,
    alternates: pageAlternates(locale, "/pulse"),
    openGraph: { title, description, url: localizePath(locale, "/pulse"), locale: ogLocale(locale), images: [shareImage] },
  };
}

export default async function PulsePage({ params }: PageProps<"/[locale]/pulse">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const pulse = getDictionary(locale).pulse;
  const { hero, scenarios, fronts, routine, start, pricing, faq, close } = pulse;
  const talk = talkHref(locale, pulse.name);

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
            softwareJsonLd({ name: pulse.name, description: pulse.meta.description, url: localizePath(locale, "/pulse") }),
          ),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <TrackLinks />

      {/* ── 1. What it is, and what it does, in one screen ─────────────── */}
      <Section id="pulse" surface="black" label={pulse.brand} className={`tx-grain ${styles.hero}`}>
        <div className={`tx-light ${styles.heroLight}`} data-tone="signal" aria-hidden="true" />
        <div className={`frame ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>{hero.label}</p>
            {/* Plain text, deliberately. LineReveal hides its words until the
                reveal observer has run, and the one headline on this page that
                must never wait for a script is this one. */}
            <h1 className={styles.title}>{hero.title}</h1>
            <p className={styles.lead}>{hero.lead}</p>

            <div className={styles.actions}>
              <Button href={hero.ctaHref}>{hero.cta}</Button>
              <TextLink href={hero.secondary.href}>{hero.secondary.label}</TextLink>
            </div>

            <p className={styles.heroFoot}>
              <TextLink href={hero.signIn.href} className={styles.quietLink}>
                {hero.signIn.label}
              </TextLink>
              <span className={styles.market}>{hero.market}</span>
            </p>
          </div>

          <HeroSequence
            className={styles.heroSequence}
            sequence={hero.sequence}
            // The same front the first situation below states: one source for both.
            screen={scenarios.items[0].screen}
            draftLabel={scenarios.labels.draft}
            reviewNote={scenarios.labels.review}
          />
        </div>
      </Section>

      {/* ── 2. Does it fix my day? Three situations, one demonstration ──── */}
      <Section id="como-funciona" surface="paper" label={scenarios.chapter} className={`tx-grain ${styles.section}`}>
        <div className="frame">
          <ChapterHead index={1} name={scenarios.chapter} className={styles.chapter} />
          <div className={styles.head}>
            <h2 className={styles.h2}>
              <span className={styles.guide} aria-hidden="true">
                <Pulse state="welcome" greet interactive />
              </span>
              {scenarios.title}
            </h2>
            <p className={styles.sectionLead}>{scenarios.lead}</p>
          </div>

          <div className={styles.full}>
            <Scenarios pick={scenarios.pick} labels={scenarios.labels} items={scenarios.items} note={scenarios.note} />
          </div>
        </div>
      </Section>

      {/* ── 3. The commercial difference: the seven fronts ──────────────── */}
      <Section id="oportunidades" surface="carbon" label={fronts.chapter} className={`tx-grain ${styles.section}`}>
        <div className="frame">
          <ChapterHead index={2} name={fronts.chapter} className={styles.chapter} />
          <div className={styles.head}>
            <h2 className={styles.h2}>
              <LineReveal text={fronts.title} step={90} />
            </h2>
            <p className={styles.sectionLead}>{fronts.lead}</p>
          </div>

          <div className={styles.full}>
            <Fronts items={fronts.items} hint={fronts.hint} doesLabel={fronts.doesLabel} />
          </div>

          <aside className={styles.caveat}>
            <p className={styles.caveatLabel}>{fronts.caveatLabel}</p>
            <p>{fronts.caveat}</p>
          </aside>
        </div>
      </Section>

      {/* ── 4. The routine: five screens, one task each ─────────────────── */}
      <Section id="por-dentro" surface="fog" label={routine.chapter} className={`tx-grain ${styles.section}`}>
        <div className="frame">
          <ChapterHead index={3} name={routine.chapter} className={styles.chapter} />
          <div className={styles.head}>
            <h2 className={styles.h2}>
              <LineReveal text={routine.title} step={90} />
            </h2>
            <p className={styles.sectionLead}>{routine.lead}</p>
          </div>

          <div className={styles.full}>
            <Tour screens={routine.screens} fronts={fronts.items} hint={routine.hint} note={routine.note} />
          </div>
        </div>
      </Section>

      {/* ── 5. How to start: the three steps the routes really enforce ──── */}
      <Section id="comecar" surface="black" label={start.chapter} className={`tx-grain ${styles.section}`}>
        <div className="frame">
          <ChapterHead index={4} name={start.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{start.title}</h2>

          <ol className={styles.steps}>
            {start.steps.map((step, i) => (
              <li key={step.label} className={styles.startStep} style={{ "--i": i } as CSSProperties}>
                <Reveal delay={i * 42}>
                  <span className={styles.stepIndex} aria-hidden="true">
                    {pad(i + 1)}
                  </span>
                  <h3 className={styles.stepName}>{step.label}</h3>
                  <p className={styles.stepText}>{step.text}</p>
                  <p className={styles.stepDetail}>{step.detail}</p>
                  {step.cta && step.href ? (
                    <span data-pulse-track={step.href.includes("assinar") ? "subscribe" : "demo_full"}>
                      <TextLink href={step.href}>{step.cta}</TextLink>
                    </span>
                  ) : null}
                </Reveal>
              </li>
            ))}
          </ol>

          <p className={styles.startNote}>{start.note}</p>
        </div>
      </Section>

      {/* ── 6. The plan: one price, and the conditions as the terms state ── */}
      <Section id="plano" surface="paper" label={pricing.chapter} className={`tx-grain ${styles.section}`}>
        <div className="frame">
          <ChapterHead index={5} name={pricing.chapter} className={styles.chapter} />
          <div className={styles.head}>
            <h2 className={styles.h2}>{pricing.title}</h2>
            <p className={styles.sectionLead}>{pricing.lead}</p>
          </div>

          <div className={styles.planGrid}>
            <div className={styles.plan}>
              <p className={styles.planName}>{pricing.planName}</p>
              <p className={styles.price}>
                <span className={styles.priceValue}>{pricing.price}</span>
                <span className={styles.pricePer}>{pricing.per}</span>
              </p>
              <p className={styles.billing}>{pricing.billing}</p>

              <div className={styles.planActions} data-pulse-track="subscribe">
                <Button href={pricing.ctaHref}>{pricing.cta}</Button>
                <TextLink href={talk}>{pricing.talk}</TextLink>
              </div>
            </div>

            <div className={styles.planLists}>
              <section className={styles.includes}>
                <h3 className={styles.listTitle}>{pricing.includesLabel}</h3>
                <ul>
                  {pricing.includes.map((item, i) => (
                    <li key={item} style={{ "--i": i } as CSSProperties}>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Apart from the list above, and labelled: what is coming is not what is sold. */}
              <section className={styles.coming}>
                <h3 className={styles.listTitle}>{pricing.comingLabel}</h3>
                <ul>
                  {pricing.coming.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <dl className={styles.conditions}>
                <dt>{pricing.cancelLabel}</dt>
                <dd>{pricing.cancel}</dd>
                <dt>{pricing.founderLabel}</dt>
                <dd>{pricing.founder}</dd>
              </dl>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 7. The questions, answered from the real behaviour ──────────── */}
      <Section id="faq" surface="carbon" label={faq.chapter} className={`tx-grain ${styles.section}`}>
        <div className="frame">
          <ChapterHead index={6} name={faq.chapter} className={styles.chapter} />
          <h2 className={styles.h2}>{faq.title}</h2>

          <div className={styles.faqList}>
            {faq.items.map((item, i) => (
              <details key={item.q} className={styles.faqItem} name="pulse-faq">
                <summary className={styles.faqQuestion}>
                  <span className={styles.faqIndex} aria-hidden="true">
                    {pad(i + 1)}
                  </span>
                  <span>{item.q}</span>
                  <span className={styles.faqMark} aria-hidden="true" />
                </summary>
                <p className={styles.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 8. The close: the demo, or the plan ─────────────────────────── */}
      <Section id="conhecer" surface="black" label={close.chapter} className={`tx-grain ${styles.close}`}>
        <div className={`tx-light ${styles.closeLight}`} data-tone="signal" aria-hidden="true" />
        <div className={`frame ${styles.closeGrid}`}>
          <ChapterHead index={7} name={close.chapter} className={styles.chapter} />
          <h2 className={styles.closeTitle}>
            <LineReveal text={close.title} step={110} />
          </h2>

          <div className={styles.closeAction}>
            <span className={styles.closeGuide} aria-hidden="true">
              <Pulse state="happy" interactive />
            </span>
            <p className={styles.closeLead}>{close.lead}</p>
            <div className={styles.actions}>
              <span data-pulse-track="subscribe">
                <Button href={close.ctaHref}>{close.cta}</Button>
              </span>
              {close.demo.ready ? (
                <span data-pulse-track="demo_full">
                  <TextLink href={close.demo.href}>{close.demo.label}</TextLink>
                </span>
              ) : (
                <span className={styles.soon}>{close.demo.soon}</span>
              )}
            </div>
            <p className={styles.closeTalk}>
              <TextLink href={talk} className={styles.quietLink}>
                {close.talk}
              </TextLink>
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
