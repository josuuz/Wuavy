import { PassoFigure } from "./PassoFigure";
import { PASSO_FEET, PASSO_HEIGHT, STAND } from "./passoRig";
import styles from "./PassoStill.module.css";

/*
  PASSO standing in the crowd, one more pedestrian. The overlay shares the
  photograph's coordinate space (1920 x 1282, cropped like object-fit: cover),
  so he stays on the same spot of the street at every screen size and moves
  with the photo. His shadow falls where everyone's does: down and to the left.

  The anchor marks his spot and height on screen. When the walk can run
  (PassoJourney), it takes over from this drawing, starting exactly here;
  without script he simply stays in the crowd.
*/

const PHOTO = { width: 1920, height: 1282 };
const SPOT = { x: 880, y: 700 }; // where he stands, in photo pixels
const HEIGHT = 72; // a little shorter than the people around him
const scale = HEIGHT / PASSO_HEIGHT;

export function PassoStill() {
  return (
    <svg
      className={styles.overlay}
      viewBox={`0 0 ${PHOTO.width} ${PHOTO.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={`translate(${SPOT.x} ${SPOT.y}) scale(${scale})`}>
        <rect data-passo-anchor="" x={-10} y={-PASSO_HEIGHT} width={20} height={PASSO_HEIGHT} fill="transparent" />
        <g className={styles.still}>
          <g transform="matrix(1 0 0.8 -0.55 0 0)" opacity="0.6">
            <g transform={`translate(${-PASSO_FEET.x} ${-PASSO_FEET.y})`}>
              <PassoFigure pose={STAND} variant="shadow" />
            </g>
          </g>
          <g transform={`translate(${-PASSO_FEET.x} ${-PASSO_FEET.y})`}>
            <g opacity="0.5">
              <PassoFigure pose={STAND} variant="outline" />
            </g>
            <PassoFigure pose={STAND} mode="idle" />
          </g>
        </g>
      </g>
    </svg>
  );
}
