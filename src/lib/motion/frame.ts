/**
 * One scroll listener, one resize listener and one requestAnimationFrame for
 * everything that follows the scroll. Each frame runs every job's `read`
 * (layout reads) before any job's `write` (DOM writes), so jobs never force
 * a layout on each other. Nothing runs while the page is still.
 *
 * On hover devices the same listener raises an invisible shield over the
 * page while it moves, so hover effects (waves, row bands, previews) don't
 * fire on everything that slides under a resting pointer. One fixed element
 * shown and hidden: switching pointer-events on the body instead would
 * restyle every element on the page at each start and stop.
 */

export interface FrameJob {
  read?: (now: number) => void;
  write?: (now: number) => void;
}

const jobs = new Set<FrameJob>();
let frame = 0;
let settle = 0;
let shield: HTMLDivElement | null | undefined;

const SCROLL_REST_MS = 140;

function getShield() {
  if (shield === undefined) {
    shield = null;
    if (window.matchMedia("(hover: hover)").matches) {
      shield = document.createElement("div");
      shield.setAttribute("aria-hidden", "true");
      shield.style.cssText = "position:fixed;inset:0;z-index:190;display:none";
      document.body.append(shield);
    }
  }
  return shield;
}

function onScroll() {
  const cover = getShield();
  if (cover) {
    if (cover.style.display === "none") cover.style.display = "block";
    clearTimeout(settle);
    settle = window.setTimeout(() => {
      cover.style.display = "none";
    }, SCROLL_REST_MS);
  }
  requestFrame();
}

function run(now: number) {
  frame = 0;
  const list = Array.from(jobs);
  for (const job of list) job.read?.(now);
  for (const job of list) job.write?.(now);
}

/** Ask for one frame. A job that is still moving calls this again from its write. */
export function requestFrame() {
  if (!frame && jobs.size) frame = requestAnimationFrame(run);
}

/** Run `job` on every scroll or resize frame, and whenever requestFrame is called. */
export function subscribeFrame(job: FrameJob): () => void {
  if (jobs.size === 0) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestFrame);
  }
  jobs.add(job);
  requestFrame();
  return () => {
    jobs.delete(job);
    if (jobs.size === 0) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", requestFrame);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      frame = 0;
      shield?.remove();
      shield = undefined;
    }
  };
}
