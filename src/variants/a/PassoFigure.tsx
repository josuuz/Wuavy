import { cn } from "@/lib/utils";
import { HIP_L, HIP_R, SHOULDER_L, SHOULDER_R, armPath, type PassoPose } from "./passoRig";
import styles from "./PassoFigure.module.css";

/*
  PASSO drawn from his rig, in his own coordinates (feet at 120, 284).
  Colours come from custom properties so one drawing serves the photo, the
  header on any surface and the cast shadow:
  --pb body · --pe eyes and details · --ps Signal (the cut and the sneakers).
  Moving parts carry data-part, so the walk can update them in place.
  The shadow and the outline are the same drawing in black (the outline a
  little fatter): plain vectors, no SVG filters, cheap to repaint mid-stride.
*/

interface PassoFigureProps {
  pose: PassoPose;
  /** "shadow": the silhouette in black. "outline": the same, fatter, drawn under the figure. */
  variant?: "figure" | "shadow" | "outline";
  /** "idle" looks around; "walk" looks up, where he is going; "docked" stays still. */
  mode?: "idle" | "walk" | "docked";
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function rect(x: number, y: number, w: number, h: number, r: number) {
  const a = `A${r},${r} 0 0 1 `;
  return (
    `M${r1(x + r)},${y}H${r1(x + w - r)}${a}${r1(x + w)},${r1(y + r)}` +
    `V${r1(y + h - r)}${a}${r1(x + w - r)},${r1(y + h)}H${r1(x + r)}${a}${r1(x)},${r1(y + h - r)}` +
    `V${r1(y + r)}${a}${r1(x + r)},${y}Z`
  );
}

/** A leg in its sneaker: chunky Signal upper, light sole, a stripe on the channel angle. */
function Leg({ hip, angle, part }: { hip: { x: number; y: number }; angle: number; part: string }) {
  const x = hip.x;
  const upper =
    `M${x - 12},278V268.5Q${x - 12},264 ${x - 7.5},264H${x + 5}Q${x + 9},264 ${x + 12},267.5` +
    `L${x + 22.5},271.4Q${x + 28},273.2 ${x + 28},277.5V278Z`;
  const stripe = `M${x - 1},277L${x + 2.8},266.8H${x + 6.6}L${x + 2.8},277Z`;

  return (
    <g data-part={part} transform={`rotate(${r1(angle)} ${x} ${hip.y})`}>
      <path className={styles.body} d={rect(x - 9, hip.y, 18, 36, 4.5)} />
      <path className={styles.signal} d={upper} />
      <path className={styles.mark} d={stripe} />
      <path className={styles.mark} d={rect(x - 14.5, 265.5, 3.5, 7, 1.5)} />
      <path className={styles.body} d={rect(x - 13, 277, 41, 7, 3.5)} />
    </g>
  );
}

export function PassoFigure({ pose, variant = "figure", mode }: PassoFigureProps) {
  const silhouette = variant !== "figure";
  return (
    <g className={cn(silhouette && styles.shadow, variant === "outline" && styles.outline)} data-mode={mode}>
      <g data-part="bob" transform={`translate(0 ${r1(pose.dy)})`}>
        <path className={styles.signal} d="M61,140.8h118v13.2h-118Z" />

        <Leg hip={HIP_L} angle={pose.legL} part="legL" />
        <Leg hip={HIP_R} angle={pose.legR} part="legR" />

        <path data-part="armL" className={styles.limb} d={armPath(SHOULDER_L, pose.armL)} />
        <circle data-part="handL" className={styles.body} cx={r1(pose.armL[2])} cy={r1(pose.armL[3])} r={7.9} />
        <path data-part="armR" className={styles.limb} d={armPath(SHOULDER_R, pose.armR)} />
        <circle data-part="handR" className={styles.body} cx={r1(pose.armR[2])} cy={r1(pose.armR[3])} r={7.9} />

        {/* The U of the wordmark: the bottom half stays, the top half has already stepped forward. */}
        <path className={styles.body} d="M60,154H180V190A60,60 0 0 1 60,190Z" />
        <path className={styles.body} d="M60,54A4,4 0 0 1 64,50H176A4,4 0 0 1 180,54V140.8H60Z" transform="translate(13.4 0)" />

        {silhouette ? null : (
          <g className={styles.look}>
            <g className={styles.blink}>
              <path className={styles.eye} d="M126.2,84.6A10.8,10.8 0 0 1 147.8,84.6V99A10.8,10.8 0 0 1 126.2,99Z" />
              <path className={styles.eye} d="M158.6,84.6A10.8,10.8 0 0 1 180.2,84.6V99A10.8,10.8 0 0 1 158.6,99Z" />
              <g className={styles.pupils}>
                <circle className={styles.pupil} cx={140.95} cy={94.6} r={7.35} />
                <circle className={styles.pupil} cx={173.35} cy={94.6} r={7.35} />
              </g>
            </g>
          </g>
        )}
      </g>
    </g>
  );
}
