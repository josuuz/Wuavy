"use client";

import { useRef, useState } from "react";

import { AgendaCrop, AppFrame, OpportunitiesCrop, OverviewCrop, PatientsCrop, RecordCrop } from "./product";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  "E a rotina da clínica fica organizada" — the tour, one screen at a time.

  Centred, with the product wide: the tabs on top, the screen in the middle,
  what it is for written once underneath. The words follow the picture here
  (in the situations above they sit beside it) so that two sections in a row
  never share a layout.

  Not screenshots. Each crop is the real screen's content rebuilt in HTML with
  the product's own tokens (./product.tsx), which is what makes it readable on
  a phone — a whole screenshot at that width is a picture of a screen, not a
  screen. The rail on the left is the product's own navigation and stays where
  the product puts it; the tabs here are the control, so the rail is a drawing
  and nothing in it is clickable.

  "Prontuário" lives inside Pacientes in the product, so that is the rail
  entry it lights.
*/

export interface TourScreen {
  id: string;
  nav: string;
  title: string;
  text: string;
  benefit: string;
  note?: string;
}

/** Which of the product's screens each stop belongs to, by the rail's slug. */
const RAIL: Record<string, string> = {
  "visao-geral": "",
  agenda: "agenda",
  pacientes: "pacientes",
  prontuario: "pacientes",
  oportunidades: "oportunidades",
};

interface TourProps {
  screens: readonly TourScreen[];
  /** The seven fronts' names, for the Oportunidades crop, so they stay translated. */
  fronts: readonly { tag: string; name: string }[];
  hint: string;
  note: string;
}

export function Tour({ screens, fronts, hint, note }: TourProps) {
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const screen = screens[at];

  const choose = (next: number) => {
    setAt(next);
    track("screen", screens[next]?.id);
  };

  return (
    <div className={styles.tour}>
      <div
        ref={strip}
        className={styles.tourTabs}
        role="tablist"
        aria-label={hint}
        onKeyDown={(event) =>
          onTabKeys(event, at, screens.length, (next) => {
            choose(next);
            focusTab(strip.current, next);
          })
        }
      >
        {screens.map((item, i) => (
          <button
            key={item.id}
            type="button"
            data-tab=""
            role="tab"
            id={`tela-${item.id}`}
            aria-selected={i === at}
            aria-controls={`tela-painel-${item.id}`}
            tabIndex={tabIndex(i, at)}
            className={styles.tourTab}
            onClick={() => choose(i)}
          >
            {item.nav}
          </button>
        ))}
      </div>

      <div
        id={`tela-painel-${screen.id}`}
        role="tabpanel"
        aria-labelledby={`tela-${screen.id}`}
        tabIndex={-1}
        className={styles.tourPanel}
      >
        <div className={styles.tourScreen}>
          <AppFrame key={screen.id} screen={screen.nav} rail={RAIL[screen.id] ?? ""} chip="Demo" className={styles.tourFrame}>
            {screen.id === "visao-geral" ? <OverviewCrop /> : null}
            {screen.id === "agenda" ? <AgendaCrop /> : null}
            {screen.id === "pacientes" ? <PatientsCrop /> : null}
            {screen.id === "prontuario" ? <RecordCrop /> : null}
            {screen.id === "oportunidades" ? <OpportunitiesCrop fronts={fronts} /> : null}
          </AppFrame>
        </div>

        <div key={screen.id} className={styles.tourWords}>
          <h3 className={styles.tourTitle}>{screen.title}</h3>
          <p className={styles.tourText}>{screen.text}</p>
          <p className={styles.tourBenefit}>
            <span aria-hidden="true">→ </span>
            {screen.benefit}
          </p>
          {screen.note ? <p className={styles.tourNote}>{screen.note}</p> : null}
        </div>

        <p className={styles.note}>{note}</p>
      </div>
    </div>
  );
}
