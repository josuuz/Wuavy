import { WaveField } from "@/components/brand/WaveField";
import { ChapterHead, Section } from "@/components/layout/Section";
import { WidthWave } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { home } from "@/data/home";
import { site } from "@/data/site";
import { contactHref, contactValue, isExternal } from "@/lib/contact";
import { cn, hasDescender } from "@/lib/utils";
import styles from "./Contact.module.css";

/*
  07 — The call. v2: no longer a full Signal field. Carbon, a warm light
  low behind the action (T03, Signal-tinted) and the frequency band running
  into the footer (T04). Signal marks only what matters: the last line —
  the verb — and the button. Signal on Carbon is 6:1.
  The contact channel comes from site config, so e-mail, WhatsApp, calendar
  or form is a data change.
*/

export function Contact({ index = 7 }: { index?: number }) {
  const { chapter, lines, body, cta } = home.contact;
  const { primary, channels } = site.contact;

  return (
    <Section id="contato" surface="carbon" label={chapter} className={`tx-grain ${styles.section}`}>
      <div className={`tx-light ${styles.light}`} data-tone="signal" aria-hidden="true" />
      <div className={`frame ${styles.content}`}>
        <ChapterHead index={index} name={chapter} className={styles.chapter} />

        <p className={styles.display}>
          {lines.map((line, i) => (
            <WidthWave
              key={line}
              text={line}
              entry="settle"
              hover
              delay={i * 160}
              className={cn(
                styles.line,
                hasDescender(line) && styles.descender,
                i === lines.length - 1 && styles.accent,
              )}
            />
          ))}
        </p>

        <div className={styles.action}>
          <p className={`type-body ${styles.body}`}>{body}</p>
          <Button href={contactHref(primary)}>{cta}</Button>
        </div>

        <ul className={styles.channels}>
          {channels.map((channel) => (
            <li key={channel.kind}>
              <span className={styles.channelLabel}>{channel.label}</span>
              <a
                href={contactHref(channel)}
                className={styles.channelValue}
                {...(isExternal(contactHref(channel)) ? { target: "_blank", rel: "noopener" } : {})}
              >
                {contactValue(channel)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <WaveField className={styles.wave} />
    </Section>
  );
}
