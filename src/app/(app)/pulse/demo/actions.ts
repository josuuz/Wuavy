"use server";

import { markJourney } from "@/lib/flow/session";

/** "Assinar" opened from the Pulse: a step of the person's journey, nothing more. */
export async function markSubscribeIntent() {
  await markJourney("subscribe");
}
