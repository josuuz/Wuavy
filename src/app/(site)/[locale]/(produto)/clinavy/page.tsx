import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { Section } from "@/components/layout/Section";
import { Reveal } from "@/components/motion";
import { Fronts } from "@/components/pulse/Fronts";
import { HeroDemo } from "@/components/pulse/HeroDemo";
import { HowSim } from "@/components/pulse/HowSim";
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
  Clinavy, the public page — told as a story, in six chapters.

    1  Existe uma oportunidade passando despercebida   the first screen: the
       promise, centred, and the product already moving under it
    2  Você provavelmente reconhece esta situação       three short, specific
       situations, in type. No product yet: this is the "that is us" moment
    3  Veja como o Clinavy ajuda sua equipe a agir        the same situations, now
       with the product: the problem, what it identified, the next step
    4  E a rotina da clínica fica organizada            agenda, patients, the
       clinical file and the opportunities, one screen at a time
    5  Veja o que ele acompanha                         the seven fronts, now
       that the visitor knows why they matter — the page's one light section
    6  Quanto custa e como começar                      the plan, the three
       steps, the questions, and the way in

  The argument is made once and then built on: what Clinavy finds is the
  first screen's animation; the situations name it; the interactive section
  lets the visitor pick one; the tour shows the rest of the day; the seven
  fronts are the full list; and only then the price.

  Three rules this file keeps:

  · nothing load-bearing waits for JavaScript. The title, the lead, both
    buttons, all seven fronts' names, the whole plan and the whole FAQ are
    server-rendered text. The interactive pieces add a picture and a choice on
    top of words that are already there;
  · every claim is one the code can back. The fronts are the opportunity
    engine's seven (lib/flow/insights.ts); the plan is PRICE and the terms; the
    three steps to start are the three routes that actually enforce the path
    (pulse/entrar → pulse/assinar → pulse/comecar). What is not built says
    "em breve"/"ainda não faz parte do plano" and sits apart from what is sold;
  · the product is the protagonist. Clinavy character appears as a guide: in
    the first screen's notes and once at the close, and nowhere else.

  The words are the dictionaries' `pulse` (src/i18n/dictionaries), in both
  languages. The product's own screens are drawn in components/pulse/product.tsx.
*/

export async function generateMetadata({ params }: PageProps<"/[locale]/clinavy">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { title, description } = getDictionary(locale).pulse.meta;
  return {
    // `absolute`: the title already names the product and the agency.
    title: { absolute: title },
    description,
    alternates: pageAlternates(locale, "/clinavy"),
    openGraph: { title, description, url: localizePath(locale, "/clinavy"), locale: ogLocale(locale), images: [shareImage] },
  };
}

export default async function PulsePage({ params }: PageProps<"/[locale]/clinavy">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const pulse = getDictionary(locale).pulse;
  const { hero, recognize, scenarios, fronts, routine, start, pricing, faq, close } = pulse;
  const talk = talkHref(locale, pulse.name);
  // The tour is four screens: the overview is the first screen's own subject, not a stop of its own.
  const tour = routine.screens.filter((screen) => screen.id !== "visao-geral");

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
            softwareJsonLd({ name: pulse.name, description: pulse.meta.description, url: localizePath(locale, "/clinavy") }),
          ),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <TrackLinks />

      {/* ── 1. The promise, centred, and the product already moving ─────── */}
      <Section id="pulse" surface="black" label={pulse.brand} className={`tx-grain ${styles.hero}`}>
        <div className={styles.heroInner}>
          <p className={styles.pill}>
            <span className={styles.pillDot} aria-hidden="true" />
            {hero.label}
          </p>

          {/* Plain text, deliberately. LineReveal hides its words until the reveal observer has run,
              and the one headline on this page that must never wait for a script is this one. */}
          <h1 className={styles.title}>
            <span className={styles.line}>{hero.title}</span>
            <span className={`${styles.line} ${styles.accent}`}>{hero.titleAccent}</span>
          </h1>

          <p className={styles.lead}>{hero.lead}</p>

          <div className={styles.actions}>
            <Button href={hero.ctaHref}>{hero.cta}</Button>
            <TextLink href={hero.secondary.href} className={styles.quiet}>
              {hero.secondary.label} <span aria-hidden="true">→</span>
            </TextLink>
          </div>
        </div>

        <div className={styles.heroStage}>
          <HeroDemo demo={hero.demo} />
        </div>
      </Section>

      {/* ── 2. "That is us": three situations, said plainly ─────────────── */}
      <Section id="reconhecer" surface="carbon" label={recognize.chapter} className={`tx-grain ${styles.section}`}>
        <div className={styles.narrow}>
          <h2 className={`${styles.h2} ${styles.center}`}>{recognize.title}</h2>

          <ol className={styles.signs}>
            {recognize.items.map((item, i) => (
              <li key={item.line} className={styles.sign}>
                <span className={styles.signIndex} aria-hidden="true">
                  {pad(i + 1)}
                </span>
                <div>
                  <p className={styles.signLine}>{item.line}</p>
                  <p className={styles.signDetail}>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className={styles.signsClose}>{recognize.close}</p>
        </div>
      </Section>

      {/* ── 3. The same situations, with the product ────────────────────── */}
      <Section id="como-funciona" surface="black" label={scenarios.chapter} className={`tx-grain ${styles.section}`}>
        <div className={styles.wide}>
          {/* The title and the line under it are part of the split scene: they sit on its words' side. */}
          <HowSim copy={scenarios} />
        </div>
      </Section>

      {/* ── 4. The rest of the day, one screen at a time ────────────────── */}
      <Section id="por-dentro" surface="carbon" label={routine.chapter} className={`tx-grain ${styles.section}`}>
        <div className={`${styles.wide} ${styles.wideTight}`}>
          <header className={`${styles.head} ${styles.headCenter}`}>
            <h2 className={`${styles.h2} ${styles.center}`}>{routine.title}</h2>
            <p className={`${styles.sectionLead} ${styles.center}`}>{routine.lead}</p>
          </header>

          <Tour screens={tour} fronts={fronts.items} hint={routine.hint} note={routine.note} />
        </div>
      </Section>

      {/* ── 5. The seven fronts: the page's one light section ───────────── */}
      <Section id="oportunidades" surface="paper" label={fronts.chapter} className={`tx-grain ${styles.section}`}>
        <div className={styles.wide}>
          <header className={`${styles.head} ${styles.headCenter}`}>
            <h2 className={`${styles.h2} ${styles.center}`}>{fronts.title}</h2>
            <p className={`${styles.sectionLead} ${styles.center}`}>{fronts.lead}</p>
          </header>

          <Fronts
            items={fronts.items}
            hint={fronts.hint}
            doesLabel={fronts.doesLabel}
            count={fronts.count}
            countLabel={fronts.countLabel}
          />

          <aside className={styles.caveat}>
            <p className={styles.caveatLabel}>{fronts.caveatLabel}</p>
            <p>{fronts.caveat}</p>
          </aside>
        </div>
      </Section>

      {/* ── 6. The plan, and the way in ─────────────────────────────────── */}
      <Section id="plano" surface="black" label={pricing.chapter} className={`tx-grain ${styles.section}`}>
        <div className={styles.narrow}>
          <h2 className={`${styles.h2} ${styles.center}`}>{pricing.title}</h2>
          <p className={`${styles.sectionLead} ${styles.center}`}>{pricing.lead}</p>

          <div className={styles.plan}>
            <p className={styles.planName}>{pricing.planName}</p>
            <p className={styles.price}>
              <span className={styles.priceValue}>{pricing.price}</span>
              <span className={styles.pricePer}>{pricing.per}</span>
            </p>
            <p className={styles.billing}>{pricing.billing}</p>

            <div className={styles.planActions} data-pulse-track="subscribe">
              <Button href={pricing.ctaHref}>{pricing.cta}</Button>
              <TextLink href={talk} className={styles.quiet}>
                {pricing.talk}
              </TextLink>
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

            <div className={styles.apart}>
              {/* Apart from the list beside it, and labelled: what is coming is not what is sold. */}
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

          <div className={styles.start}>
            <h3 className={`${styles.h3} ${styles.center}`}>{start.title}</h3>

            <ol className={styles.steps}>
              {start.steps.map((step, i) => (
                <li key={step.label} className={styles.startStep}>
                  <Reveal delay={i * 42}>
                    <span className={styles.stepIndex} aria-hidden="true">
                      {pad(i + 1)}
                    </span>
                    <h4 className={styles.stepName}>{step.label}</h4>
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
        </div>
      </Section>

      {/* ── The questions, answered from the real behaviour ─────────────── */}
      <Section id="faq" surface="carbon" label={faq.chapter} className={`tx-grain ${styles.section}`}>
        <div className={styles.narrow}>
          <h2 className={`${styles.h2} ${styles.center}`}>{faq.title}</h2>

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

      {/* ── The close: the demo, or the plan ────────────────────────────── */}
      <Section id="conhecer" surface="black" label={close.chapter} className={`tx-grain ${styles.close}`}>
        <div className={`tx-light ${styles.closeLight}`} data-tone="signal" aria-hidden="true" />
        <div className={styles.closeInner}>
          <span className={styles.closeGuide} aria-hidden="true">
            <Pulse state="happy" interactive />
          </span>
          <h2 className={`${styles.h2} ${styles.center}`}>{close.title}</h2>
          <p className={`${styles.sectionLead} ${styles.center}`}>{close.lead}</p>

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

          <p>
            <TextLink href={talk} className={styles.quiet}>
              {close.talk}
            </TextLink>
          </p>
        </div>
      </Section>
    </>
  );
}
