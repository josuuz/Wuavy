import type { StaticImageData } from "next/image";

/* ── Media ─────────────────────────────────────────────────── */

/** `mono` applies the brand photo treatment. Client work keeps its colour: use `none`. */
export type PhotoTreatment = "mono" | "none";

export interface ImageMedia {
  kind: "image";
  src: StaticImageData;
  alt: string;
  treatment?: PhotoTreatment;
  /** Frame below 768 px. Defaults to a 4:5 crop; use 16 / 9 for screenshots that must stay whole. */
  mobileAspect?: number;
}

/** Prepared for case videos. Plays only in view, never preloads. */
export interface VideoMedia {
  kind: "video";
  src: string;
  poster: StaticImageData;
  alt: string;
  treatment?: PhotoTreatment;
  mobileAspect?: number;
}

export type Media = ImageMedia | VideoMedia;

/* ── Services ──────────────────────────────────────────────── */

export interface Service {
  id: string;
  /** Discipline name, e.g. "Websites". */
  name: string;
  /** The outcome it delivers, set in display caps. Offers are framed as outcomes. */
  outcome: string;
  summary: string;
  deliverables: string[];
  /** The fine print that must be said, e.g. ad budget is separate. */
  note?: string;
  /** `soon` keeps a service in the data without showing it on the site. */
  status: "active" | "soon";
  /** Set when the service gets its own page; the row then becomes a link. */
  href?: string;
}

/* ── Cases ─────────────────────────────────────────────────── */

export interface CaseResult {
  value: string;
  label: string;
}

/** One technical decision, said plainly: what was built and why it matters. */
export interface CaseHighlight {
  title: string;
  text: string;
}

/**
 * A screen recording of the live project, made with scripts/case-video.mjs:
 * a 16:9 desktop film and, when there is one, a 9:16 phone film.
 */
export interface CaseFilm {
  desktop: { src: string; poster: StaticImageData };
  mobile?: { src: string; poster: StaticImageData };
  alt: string;
}

export interface CaseStudy {
  slug: string;
  client: string;
  title: string;
  /** One line on what the work changed, for the projects list. */
  tagline?: string;
  segment: string;
  services: Service["id"][];
  year: number;
  summary: string;
  /** What was delivered, as the work reads it: two or more make a combo ("Website + Identidade Visual"). Defaults to the services' names. */
  scope?: string[];
  /** Only real, verifiable results. Never estimates. */
  result?: CaseResult;
  /** The live project, when it can be visited. */
  url?: string;
  /** The cover is the "after"; this is where the client started, and what changed. */
  before?: { media: Media; changes: string[] };
  cover: Media;
  gallery?: Media[];
  body?: {
    challenge?: string;
    approach?: string;
    outcome?: string;
  };
  /** The project in motion ("Em movimento"). */
  film?: CaseFilm;
  /** "Destaques técnicos": three to five, each one true of the shipped work. */
  highlights?: CaseHighlight[];
  /** Tools and platforms, listed under the highlights. */
  stack?: string[];
  /**
   * Placeholder cases are labelled on the page, kept out of the sitemap
   * and marked noindex. Replace them with real work in src/data/cases.ts.
   */
  placeholder: boolean;
}

/* ── Contact (decoupled: pick the channel in src/data/site.ts) ─ */

export type ContactChannel =
  | { kind: "email"; label: string; address: string; subject?: string }
  | { kind: "whatsapp"; label: string; number: string; message?: string }
  | { kind: "calendar"; label: string; url: string }
  | { kind: "form"; label: string; href: string };

/* ── Site ──────────────────────────────────────────────────── */

export interface NavItem {
  label: string;
  href: string;
  /** A product link: marked with ↗ and this line on hover. */
  hint?: string;
}

export interface SocialLink {
  label: string;
  /** Empty until the profile exists; rendered as plain text meanwhile. */
  href: string;
}

export interface SiteConfig {
  name: string;
  url: string;
  contact: {
    primary: ContactChannel;
    channels: ContactChannel[];
  };
  social: SocialLink[];
}
