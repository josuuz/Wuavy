"use server";

import { markJourney } from "@/lib/flow/session";

/** "Assinar" opened from Clinavy: a step of the person's journey, nothing more. */
export async function markSubscribeIntent() {
  await markJourney("subscribe");
}
