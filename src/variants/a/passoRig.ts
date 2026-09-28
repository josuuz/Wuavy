/*
  PASSO's rig, ported from ID Wuavy/propostas/c-deslocamento/personagem/passo.js
  (flat style: W 120, H 200, light body, Signal in the cut). The figure stands
  with its feet on the ground at (120, 284); the top of the head is y = 50.
  Legs turn at the hips, arms are one curve from the shoulder, and a pose is
  only numbers, so the walk can be scrubbed by the scroll.
*/

export const PASSO_FEET = { x: 120, y: 284 } as const;
export const PASSO_HEIGHT = 234;

export const HIP_L = { x: 96, y: 236 } as const;
export const HIP_R = { x: 144, y: 236 } as const;
export const SHOULDER_L = { x: 72, y: 174 } as const;
export const SHOULDER_R = { x: 168, y: 174 } as const;

/** Control point and hand position of an arm: [cx, cy, x, y]. */
export type Arm = readonly [number, number, number, number];

export interface PassoPose {
  legL: number;
  legR: number;
  armL: Arm;
  armR: Arm;
  /** How far the body sinks, so the feet stay on the ground mid-stride. */
  dy: number;
}

export const STAND: PassoPose = {
  legL: 4,
  legR: -4,
  armL: [52, 194, 55, 222],
  armR: [188, 194, 185, 222],
  dy: 0,
};

// The generator's two walking poses: "andando" and "andando2".
const STRIDE_A: PassoPose = {
  legL: 26,
  legR: -22,
  armL: [46, 196, 36, 214],
  armR: [194, 204, 207, 204],
  dy: 0,
};

const STRIDE_B: PassoPose = {
  legL: -18,
  legR: 24,
  armL: [56, 202, 66, 222],
  armR: [186, 198, 178, 222],
  dy: 0,
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixArm = (a: Arm, b: Arm, t: number): Arm => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
  mix(a[3], b[3], t),
];

/** Blend two poses: `t` 0 is `a`, 1 is `b`. */
export function mixPose(a: PassoPose, b: PassoPose, t: number): PassoPose {
  return {
    legL: mix(a.legL, b.legL, t),
    legR: mix(a.legR, b.legR, t),
    armL: mixArm(a.armL, b.armL, t),
    armR: mixArm(a.armR, b.armR, t),
    dy: mix(a.dy, b.dy, t),
  };
}

/**
 * The walk. `theta` runs the stride (one full cycle per 2π); `amount` blends
 * it over the standing pose, so he can ease into a step and out of it.
 */
export function walkPose(theta: number, amount: number): PassoPose {
  const s = Math.sin(theta);
  const stride = mixPose(STRIDE_B, STRIDE_A, (s + 1) / 2);
  // A leg at the end of its swing lifts its foot; the body sinks to meet the ground.
  stride.dy = 4.5 * Math.abs(s);
  return mixPose(STAND, stride, amount);
}

/**
 * Peeking over an edge at height `rim` (in his own units): legs straight,
 * both hands up on the edge just outside his body, the arms tucked behind it.
 */
export function peekPose(rim: number): PassoPose {
  const hand = rim - 9;
  return {
    legL: STAND.legL,
    legR: STAND.legR,
    armL: [54, hand + 12, 41, hand],
    armR: [194, hand + 12, 207, hand],
    dy: 0,
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function armPath(shoulder: { x: number; y: number }, arm: Arm): string {
  return `M${shoulder.x},${shoulder.y}Q${r1(arm[0])},${r1(arm[1])} ${r1(arm[2])},${r1(arm[3])}`;
}
