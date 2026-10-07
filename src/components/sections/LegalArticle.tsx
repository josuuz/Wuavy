import { Section } from "@/components/layout/Section";
import type { LegalDoc } from "@/i18n/types";
import styles from "./LegalArticle.module.css";

/** A legal page (privacy, terms): the same article in every language. */
export function LegalArticle({ id, doc }: { id: string; doc: LegalDoc }) {
  return (
    <Section id={id} surface="paper" label={doc.title} className={styles.page}>
      <div className="frame">
        <article className={styles.article}>
          <header>
            <p className={styles.updated}>{doc.updated}</p>
            <h1 className={styles.title}>{doc.title}</h1>
          </header>
          <p className={styles.lead}>{doc.lead}</p>

          {doc.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </Section>
  );
}
