// The glasses are generated: scripts/pulse-model.py lays them on the eyes it
// finds in each traced pose and writes them back here. That makes two things
// worth holding down — that a regeneration cannot quietly drop them, and that
// it cannot mistake a mark for an eye. `tranquilidade` is the pose that would
// catch the second one out: it has no mouth, only two closed eyes, so a rule
// of "the smallest mark is the mouth" would hang one lens off a closed eye.
import test from "node:test";
import assert from "node:assert/strict";

import { PULSE_POSES, PULSE_WIRE } from "../src/components/flow/pulse-poses.ts";

const POSES = Object.entries(PULSE_POSES);

/** Every coordinate pair in a path, whatever commands hold them. */
const points = (d) => {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  return Array.from({ length: n.length >> 1 }, (_, i) => [n[i * 2], n[i * 2 + 1]]);
};

const middle = (pts) => [
  (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2,
  (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2,
];

/** A lens ring, as its centre and how far the ring runs from it. */
function lens(d) {
  const pts = points(d);
  const c = middle(pts);
  return { c, r: Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))) };
}

test("the frame has a weight to draw it with", () => {
  assert.equal(typeof PULSE_WIRE, "number");
  assert.ok(PULSE_WIRE > 0);
});

test("every pose wears a whole pair", () => {
  assert.equal(POSES.length, 6);
  for (const [name, pose] of POSES) {
    // Two lenses, a bridge and two arms.
    assert.equal(pose.glasses.length, 5, name);
    const [left, right] = pose.glasses;
    assert.ok(left.endsWith("Z") && right.endsWith("Z"), `${name}: the lenses are closed rings`);
    assert.ok(!pose.glasses.slice(2).some((d) => d.endsWith("Z")), `${name}: bridge and arms are open`);
  }
});

/*
  Pulse.tsx blinks `face[0]` and `face[1]` and nothing else. It cannot work out
  which marks are eyes at runtime — the generator already did that — so it
  trusts the order the art was traced in. This is what makes that trust safe:
  if a retrace ever put the mouth first, the Pulse would blink with its mouth,
  and this fails instead.
*/
test("the eyes are traced first, the mouth last", () => {
  const area = (d) => {
    const pts = points(d);
    const span = (i) => Math.max(...pts.map((p) => p[i])) - Math.min(...pts.map((p) => p[i]));
    return span(0) * span(1);
  };
  for (const [name, pose] of POSES) {
    const sizes = pose.face.map(area);
    assert.ok(sizes.length === 2 || sizes.length === 3, `${name}: two eyes, and a mouth or none`);
    // The mouth is a fraction of an eye, which is what makes the order
    // readable from the art rather than asserted by hand.
    if (sizes.length === 3) {
      assert.ok(sizes[2] < 0.4 * Math.min(sizes[0], sizes[1]), `${name}: the last mark is the mouth, far smaller`);
    }
    // And the first two are a pair: neither is a stray speck.
    assert.ok(Math.min(sizes[0], sizes[1]) > 0.25 * Math.max(sizes[0], sizes[1]), `${name}: the first two marks are the eyes`);
  }
});

test("each lens is laid on an eye, and no two on the same one", () => {
  for (const [name, pose] of POSES) {
    const marks = pose.face.map((d) => middle(points(d)));
    const taken = new Set();
    for (const ring of pose.glasses.slice(0, 2)) {
      const { c, r } = lens(ring);
      // The mark the lens is nearest to is the one it was laid on; a lens
      // hung off the mouth, or both hung off the same eye, fails here.
      const near = marks
        .map((m, i) => [i, Math.hypot(m[0] - c[0], m[1] - c[1])])
        .sort((a, b) => a[1] - b[1])[0];
      assert.ok(near[1] < r, `${name}: a lens sits off on its own, ${near[1].toFixed(1)} from any mark`);
      assert.ok(!taken.has(near[0]), `${name}: both lenses landed on the same mark`);
      taken.add(near[0]);
    }
  }
});
