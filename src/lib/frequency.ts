/**
 * The frequency device: data drawn as rows of vertical lines where density
 * is the value (brand/DESIGN.md → Graphic devices). Same construction as
 * propostas/a-frequencia/build.py: lines evenly spaced at (i + .5) * spacing,
 * with a deterministic jitter so server and client always agree.
 */

function hash(k: number): number {
  return (Math.imul(k, 2654435761) >>> 0) / 4294967296;
}

/**
 * Horizontal positions (0–1) for `count` lines.
 * @param jitter fraction of the spacing a line may drift (brand uses .28)
 * @param seed   changes the jitter pattern between rows
 */
export function linePositions(count: number, jitter = 0.28, seed = 1): number[] {
  const spacing = 1 / count;
  return Array.from({ length: count }, (_, i) => {
    const drift = (hash(seed * 997 + i + 1) - 0.5) * 2 * jitter * spacing;
    const x = (i + 0.5) * spacing + drift;
    return Math.min(1, Math.max(0, x));
  });
}

/**
 * The hero build-up: one module, then the interval, then the interval halving
 * until the row reaches full frequency. Returns each line's position and the
 * level at which it appears (0 = the module, 4 = full frequency).
 */
export function frequencyBuild(intervals = 32): Array<{ x: number; level: number; order: number }> {
  const lines: Array<{ x: number; level: number; order: number }> = [];
  for (let i = 0; i <= intervals; i++) {
    let level: number;
    if (i === 0) level = 0;
    else if (i % 8 === 0) level = 1;
    else if (i % 4 === 0) level = 2;
    else if (i % 2 === 0) level = 3;
    else level = 4;
    lines.push({ x: i / intervals, level, order: 0 });
  }
  // Order within each level runs left to right: that is the propagation.
  const counters = [0, 0, 0, 0, 0];
  for (const line of lines) line.order = counters[line.level]++;
  return lines;
}
