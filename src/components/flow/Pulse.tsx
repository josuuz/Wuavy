"use client";

import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";
import { PULSE_POSES, type PulsePose } from "./pulse-poses";
import styles from "./Pulse.module.css";

/*
  The Pulse, the Wuavy Pulse assistant (Direction 6).

  The silhouettes and faces are traced from the approved renders
  (pulse-poses.ts) and the volume is painted on as light: a creamy body, a
  warm glow rising from below, a soft highlight, the floor's light. Where the
  Pulse is shown large, `solid` gives it a stage of its own, which for now the
  drawing fills by itself.

  States, each one of the approved expressions:
  · idle: the main pose, floating and breathing;
  · welcome: acolhimento, arriving once, then settling to idle;
  · thinking: foco, only while something is really being calculated;
  · happy / celebrating: alegria, a short hop, then back;
  · surprised: surpresa, composed from the approved parts;
  · calm: tranquilidade, eyes closed, for reading.
  Motion is transform/opacity only; turned down, the decorative loops stop and
  only the short moves that carry meaning are left.
*/

export type PulseState = "idle" | "welcome" | "happy" | "thinking" | "surprised" | "celebrating" | "calm";

const POSE: Record<PulseState, PulsePose> = {
  idle: "presenca",
  welcome: "acolhimento",
  happy: "alegria",
  thinking: "foco",
  surprised: "surpresa",
  celebrating: "alegria",
  calm: "tranquilidade",
};

const ALL = Object.keys(PULSE_POSES) as PulsePose[];
/** The frame every pose is centred in: poses are 100 tall and up to ~116 wide. */
const FRAME = 118;

interface PulseProps {
  state?: PulseState;
  /** Arrive with the welcome expression, then settle to `state`. */
  greet?: boolean;
  /** One pose only, no expression changes: for avatars and repeated marks. */
  still?: boolean;
  /** Leans toward the pointer or keyboard focus of its parent. */
  interactive?: boolean;
  /** Where the Pulse is shown large: give it a stage of its own. */
  solid?: boolean;
  className?: string;
  /** A name for assistive tech; omitted, the figure is decorative. */
  label?: string;
}

export function Pulse({
  state = "idle",
  greet = false,
  still = false,
  interactive = false,
  solid = false,
  className,
  label,
}: PulseProps) {
  const id = useId().replace(/:/g, "");
  const [greeting, setGreeting] = useState(greet);

  useEffect(() => {
    if (!greeting) return;
    const t = window.setTimeout(() => setGreeting(false), 1800);
    return () => window.clearTimeout(t);
  }, [greeting]);

  // The welcome yields to anything real: a question asked during it shows thinking at once.
  const shown: PulseState = greeting && state === "idle" ? "welcome" : state;
  const pose = POSE[shown];
  const poses = still ? [pose] : ALL;

  const drawing = (
    <svg
      className={cn(styles.pulse, !solid && className)}
      viewBox={`-12 -10 ${FRAME + 24} 128`}
      data-state={shown}
      data-pose={pose}
      data-greet={greeting ? "" : undefined}
      data-interactive={interactive ? "" : undefined}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}
    >
      <defs>
        <radialGradient id={`${id}base`} cx="0.36" cy="0.28" r="0.86">
          <stop offset="0" stopColor="#fffdf9" />
          <stop offset="0.5" stopColor="#f7efe6" />
          <stop offset="0.82" stopColor="#efdccb" />
          <stop offset="1" stopColor="#f3b98f" />
        </radialGradient>
        <radialGradient id={`${id}warm`} cx="0.5" cy="1.02" r="0.62">
          <stop offset="0" stopColor="#ff8a4c" stopOpacity="0.62" />
          <stop offset="0.55" stopColor="#ffa36c" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffb98a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}shine`} cx="0.34" cy="0.22" r="0.34">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#ff7a3d" stopOpacity="0" />
          <stop offset="1" stopColor="#ff7a3d" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id={`${id}floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff7a3d" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff7a3d" stopOpacity="0" />
        </radialGradient>
        {poses.map((p) => (
          <path key={p} id={`${id}${p}`} d={PULSE_POSES[p].body} />
        ))}
      </defs>

      <ellipse className={styles.floor} cx={FRAME / 2} cy="111" rx="40" ry="5" fill={`url(#${id}floor)`} />
      <g className={styles.float}>
        <g className={styles.lean}>
          {poses.map((p) => {
            const href = `#${id}${p}`;
            return (
              <g key={p} className={styles.pose} data-pose={p} transform={`translate(${(FRAME - PULSE_POSES[p].w) / 2} 0)`}>
                <use href={href} fill={`url(#${id}base)`} />
                <use href={href} fill={`url(#${id}warm)`} />
                <use href={href} fill={`url(#${id}shine)`} />
                <use href={href} fill="none" stroke={`url(#${id}rim)`} strokeWidth="1.4" />
                <g fill="#3a281d">
                  {PULSE_POSES[p].face.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </g>
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );

  if (!solid) return drawing;

  // Shown large, the Pulse gets a stage of its own: the drawing fills it.
  return <span className={cn(styles.solid, className)}>{drawing}</span>;
}
