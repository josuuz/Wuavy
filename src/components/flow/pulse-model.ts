/*
  The Pulse's model, fetched once.

  scripts/pulse-model.py writes public/pulse.glb. The bytes are the same for
  everyone and for every mount, so they are fetched once per page and kept;
  each mount parses its own scene from them, which is what lets one mount
  dispose its geometry without reaching into another's.
*/

export const PULSE_MODEL_URL = "/pulse.glb";

let pending: Promise<ArrayBuffer> | null = null;

async function fetchModel(): Promise<ArrayBuffer> {
  const response = await fetch(PULSE_MODEL_URL);
  if (!response.ok) throw new Error(`${PULSE_MODEL_URL}: ${response.status}`);
  return response.arrayBuffer();
}

/**
 * The model's bytes. Asking again — a remount, a second visit to the screen —
 * reuses the first answer rather than fetching 383 KB again. A failure is not
 * kept, so the next mount is free to try once more.
 */
export function loadPulseModel(fetcher: () => Promise<ArrayBuffer> = fetchModel): Promise<ArrayBuffer> {
  pending ??= fetcher().catch((reason: unknown) => {
    pending = null;
    throw reason;
  });
  return pending;
}

/** Forget what was loaded. For tests; nothing in the app needs it. */
export function forgetPulseModel(): void {
  pending = null;
}
