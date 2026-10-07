import type { ReactNode } from "react";

/** What a legal page needs from the site to be written: contact and price, never hardcoded. */
export interface LegalContext {
  email: string;
  whatsapp: string;
  /** A WhatsApp link with the topic already typed. */
  talk: string;
  /** The Pulse plan's monthly price, formatted. */
  price: string;
  /** The privacy policy, in the page's language. */
  privacyHref: string;
}

export interface LegalDoc {
  metaTitle: string;
  metaDescription: string;
  title: string;
  updated: string;
  lead: ReactNode;
  sections: Array<{ title: string; body: ReactNode }>;
}
