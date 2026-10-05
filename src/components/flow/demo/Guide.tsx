"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import type { FlowData, Organization } from "@/lib/flow/types";
import { PassoFigure } from "@/variants/a/PassoFigure";
import { STAND, type PassoPose } from "@/variants/a/passoRig";
import { GUIDE, SCREEN_TIPS, VIEWS, viewHref, type GuideStepId } from "./copy";
import { useFlow } from "./store";
import styles from "./Guide.module.css";

/*
  The first-run guide. PASSO greets a clinic on its first visit, points at
  where to start (Configurações, in a real clinic) and walks a short list:
  each step is done when the data says so (a procedure exists, a patient,
  a booking) or, for the two screens to get to know, when they were opened.
  Any step can be skipped, the whole guide left for later or hidden; the
  Pulse stays usable throughout. Where it stands is kept in this browser
  (localStorage, per clinic) until there is a place for it on the server.
*/

type Step = (typeof GUIDE.steps)[number];
type GuideStep = Step & { done: boolean; skipped: boolean };

interface Saved {
  onboardingStarted: boolean;
  onboardingCompleted: boolean;
  currentOnboardingStep: GuideStepId | null;
  minimized: boolean;
  hidden: boolean;
  skipped: GuideStepId[];
  visited: string[];
  tips: string[];
}

const FRESH: Saved = {
  onboardingStarted: false,
  onboardingCompleted: false,
  currentOnboardingStep: null,
  minimized: false,
  hidden: false,
  skipped: [],
  visited: [],
  tips: [],
};

/**
 * What the clinic step asks of Configurações, filled or not: one list for the
 * guide's card and for the fields it highlights. Onboarding already asks the
 * name, the WhatsApp and the hours; the address is what makes the step real.
 */
export function clinicChecklist(org: Organization) {
  const f = GUIDE.clinicFields;
  return [
    { key: "logo", label: f.logo, filled: Boolean(org.logoUrl), optional: true },
    { key: "name", label: f.name, filled: Boolean(org.name.trim()), optional: false },
    { key: "whatsapp", label: f.whatsapp, filled: Boolean(org.whatsapp), optional: false },
    { key: "address", label: f.address, filled: Boolean(org.address), optional: false },
    { key: "hours", label: f.hours, filled: Boolean(org.hours), optional: false },
  ] as const;
}

export type ClinicField = ReturnType<typeof clinicChecklist>[number]["key"];

function done(step: Step, data: FlowData, visited: string[], demo: boolean) {
  switch (step.id) {
    case "clinica":
      return demo || clinicChecklist(data.organization).every((f) => f.filled || f.optional);
    case "procedimento":
      return data.procedures.length > 0;
    case "paciente":
      return data.patients.length > 0;
    case "agendamento":
      return data.appointments.length > 0;
    default:
      return visited.includes(step.view);
  }
}

interface GuideContext {
  ready: boolean;
  saved: Saved;
  steps: GuideStep[];
  current: GuideStep | null;
  doneCount: number;
  /** The guide is on screen (open or minimized): not hidden, not finished. */
  active: boolean;
  /** The menu entry to point at, while the guide is open. */
  target: string | null;
  slug: string;
  start: () => void;
  skip: () => void;
  later: () => void;
  open: () => void;
  hide: () => void;
  finish: () => void;
  restart: () => void;
  seeTip: (slug: string) => void;
}

const Context = createContext<GuideContext | null>(null);

export function useGuide() {
  const value = useContext(Context);
  if (!value) throw new Error("useGuide outside GuideProvider");
  return value;
}

/*
  The saved state, read from localStorage as an outside store: one cached
  copy per clinic, so every reader gets the same object until it changes,
  and nothing reads storage on the server (no saved state there: not ready).
*/
const cache = new Map<string, Saved>();
const listeners = new Set<() => void>();

function readSaved(key: string): Saved {
  let saved = cache.get(key);
  if (!saved) {
    saved = FRESH;
    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = { ...FRESH, ...(JSON.parse(raw) as Partial<Saved>) };
    } catch {
      // Storage blocked or unreadable: the guide starts fresh, for this visit.
    }
    cache.set(key, saved);
  }
  return saved;
}

function writeSaved(key: string, change: (s: Saved) => Saved) {
  const before = readSaved(key);
  const next = change(before);
  if (next === before) return;
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const { data, base, access } = useFlow();
  const pathname = usePathname();
  const slug = VIEWS.find((v) => viewHref(v.slug, base) === pathname)?.slug ?? "";
  const key = `wuavy-pulse-guide:${data.organization.id}`;
  const saved = useSyncExternalStore(
    subscribe,
    () => readSaved(key),
    () => null,
  );
  const update = useCallback((change: (s: Saved) => Saved) => writeSaved(key, change), [key]);

  const state = saved ?? FRESH;
  const steps = GUIDE.steps.map(
    (step): GuideStep => ({
      ...step,
      done: done(step, data, state.visited, access.isDemoMode),
      skipped: state.skipped.includes(step.id),
    }),
  );
  const current = steps.find((s) => !s.done && !s.skipped) ?? null;
  const doneCount = steps.filter((s) => s.done).length;
  const active = Boolean(saved) && !state.hidden && !state.onboardingCompleted;
  const currentId = current?.id ?? null;

  // Opening the two screens to get to know is what completes them; the current step is kept with the rest.
  useEffect(() => {
    if (!saved) return;
    const visit = (slug === "conversas" || slug === "oportunidades") && !saved.visited.includes(slug);
    if (visit || saved.currentOnboardingStep !== currentId) {
      update((s) => ({ ...s, visited: visit ? [...s.visited, slug] : s.visited, currentOnboardingStep: currentId }));
    }
  }, [saved, slug, currentId, update]);

  const value: GuideContext = {
    ready: Boolean(saved),
    saved: state,
    steps,
    current,
    doneCount,
    active,
    target: active && !state.minimized && current && current.view !== slug ? current.view : null,
    slug,
    start: () => update((s) => ({ ...s, onboardingStarted: true, minimized: false })),
    skip: () => update((s) => (current ? { ...s, skipped: [...s.skipped, current.id] } : s)),
    later: () => update((s) => ({ ...s, minimized: true })),
    open: () => update((s) => ({ ...s, minimized: false, onboardingStarted: true })),
    hide: () => update((s) => ({ ...s, hidden: true })),
    finish: () => update((s) => ({ ...s, onboardingCompleted: true })),
    restart: () => update((s) => ({ ...FRESH, visited: s.visited, onboardingStarted: true })),
    seeTip: (tip: string) => update((s) => (s.tips.includes(tip) ? s : { ...s, tips: [...s.tips, tip] })),
  };

  return <Context value={value}>{children}</Context>;
}

/** PASSO pointing up, at the menu above him. */
const POINT: PassoPose = { ...STAND, armR: [196, 150, 200, 112] };

function Passo({ point }: { point?: boolean }) {
  return (
    <svg className={styles.passo} viewBox="0 40 216 252" aria-hidden="true" focusable="false">
      <PassoFigure pose={point ? POINT : STAND} variant="outline" />
      <PassoFigure pose={point ? POINT : STAND} mode="idle" />
    </svg>
  );
}

/** The guide's card, in the rail under the menu (low on the screen on a phone): the welcome, the current step, or the end. */
export function GuideCard() {
  const guide = useGuide();
  const { base, data } = useFlow();
  if (!guide.active || guide.saved.minimized) return null;
  const { current, steps, doneCount, slug } = guide;
  const total = steps.length;
  const label = (view: string) => VIEWS.find((v) => v.slug === view)?.label ?? view;

  let body: ReactNode;
  if (!guide.saved.onboardingStarted) {
    const first = current ?? steps[0];
    const clinic = first.id === "clinica";
    body = (
      <>
        <p className={styles.text}>{clinic ? GUIDE.welcome.clinic : GUIDE.welcome.tour}</p>
        <div className={styles.actions}>
          <Link href={viewHref(first.view, base)} className={styles.primary} onClick={guide.start} data-cursor="action">
            {clinic ? GUIDE.welcome.start.clinic : GUIDE.welcome.start.tour}
          </Link>
          <button type="button" className={styles.quiet} onClick={guide.later}>
            {GUIDE.welcome.later}
          </button>
        </div>
      </>
    );
  } else if (!current) {
    const skipped = steps.filter((s) => s.skipped && !s.done).length;
    body = (
      <>
        <p className={styles.text}>{skipped ? GUIDE.done.skipped(skipped) : GUIDE.done.text}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={guide.finish}>
            {GUIDE.done.cta}
          </button>
        </div>
      </>
    );
  } else {
    const here = current.view === slug;
    body = (
      <>
        <p className={styles.step}>
          <span>
            Etapa {steps.indexOf(current) + 1} de {total}
          </span>
          {current.title}
        </p>
        <p className={styles.text} data-away={here ? undefined : ""}>
          {here ? current.here : current.go}
        </p>
        {here && current.id === "clinica" ? (
          <ul className={styles.fields}>
            {clinicChecklist(data.organization).map((field) => (
              <li key={field.key} data-done={field.filled ? "" : undefined}>
                {field.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.actions}>
          {here ? null : (
            <Link href={viewHref(current.view, base)} className={styles.primary} data-cursor="action">
              {GUIDE.go(label(current.view))}
            </Link>
          )}
          <button type="button" className={styles.quiet} onClick={guide.skip}>
            {GUIDE.skip}
          </button>
          <button type="button" className={styles.quiet} onClick={guide.later}>
            {GUIDE.later}
          </button>
        </div>
      </>
    );
  }

  return (
    <aside className={styles.card} aria-label={GUIDE.title} aria-live="polite">
      <Passo point={guide.target !== null || !guide.saved.onboardingStarted} />
      <div className={styles.body}>
        {body}
        <p className={styles.progress}>
          <span className={styles.bar} aria-hidden="true">
            {steps.map((s) => (
              <span key={s.id} data-on={s.done ? "" : undefined} />
            ))}
          </span>
          {GUIDE.progress(doneCount, total)}
        </p>
      </div>
    </aside>
  );
}

/** The guide left for later: a small way back, with its progress. */
export function GuidePill() {
  const guide = useGuide();
  if (!guide.active || !guide.saved.minimized) return null;
  return (
    <div className={styles.pill}>
      <button type="button" className={styles.pillOpen} onClick={guide.open}>
        <span className="pulse-dot" aria-hidden="true" />
        {GUIDE.title}
        <span className={styles.pillCount}>
          {guide.doneCount}/{guide.steps.length}
        </span>
      </button>
      <button type="button" className={styles.pillHide} onClick={guide.hide} aria-label={GUIDE.hide} title={GUIDE.hide}>
        ×
      </button>
    </div>
  );
}

/** Tips shown during this page load: they stay until dismissed, though already marked as seen. */
const shownThisVisit = new Set<string>();

/** PASSO's tip on a screen's first visit: shown once, gone for good once seen. */
export function ScreenTip() {
  const { slug, ready, saved, seeTip } = useGuide();
  const tip = SCREEN_TIPS[slug];
  const [dismissed, setDismissed] = useState<string[]>([]);
  const seen = saved.tips.includes(slug);

  // Marked as seen the moment it shows: it stays for this visit, never comes back.
  useEffect(() => {
    if (ready && tip && !seen) {
      shownThisVisit.add(slug);
      seeTip(slug);
    }
  }, [ready, tip, seen, slug, seeTip]);

  if (!tip || !shownThisVisit.has(slug) || dismissed.includes(slug)) return null;
  return (
    <aside className={styles.tip} aria-label="Dica do PASSO">
      <Passo />
      <p>{tip}</p>
      <button type="button" className={styles.quiet} onClick={() => setDismissed((d) => [...d, slug])}>
        Entendi
      </button>
    </aside>
  );
}
