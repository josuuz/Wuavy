/*
  Whether this device should carry the Pulse's model.

  Kept apart from Pulse3D so that asking the question costs nothing: a device
  that cannot have the model never fetches the code that would draw it.
*/

/**
 * A phone is not excluded for being a phone — the model is small and the
 * canvas smaller — but the app decides before first paint, in app/layout.tsx,
 * that some devices should be spared the heavy work, and marks them
 * `data-perf="lite"`. Where it has said that, the drawing is the Pulse.
 * Saving data, two cores, two gigabytes or no WebGL say the same.
 */
export function supports3D(): boolean {
  if (typeof document === "undefined" || typeof navigator === "undefined") return false;
  if (document.documentElement.getAttribute("data-perf") === "lite") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if ((nav.hardwareConcurrency ?? 8) <= 2) return false;
  if ((nav.deviceMemory ?? 8) <= 2) return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    // A browser allows only a handful of live contexts: this one has answered
    // the question and must not sit on one of them.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}
