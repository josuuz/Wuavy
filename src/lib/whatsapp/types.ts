/*
  What the screens know about the clinic's WhatsApp: the live connection as
  people see it (never its technical ids or credentials), and how the owner
  may connect a number from here. Loaded on the server (state.ts).
*/

export type ConnectionStatus = "connecting" | "connected" | "error";

export interface WhatsAppConnection {
  status: ConnectionStatus;
  /** Meta's test number, during the test phase. */
  test: boolean;
  /** The number stays on the WhatsApp Business app too (coexistence). */
  businessApp: boolean;
  displayPhone?: string;
  displayName?: string;
  connectedAt?: string;
}

export interface WhatsAppState {
  connection: WhatsAppConnection | null;
  /** Only for the owner: how a number can be connected now; null while it can't yet. */
  connect: "test" | "embedded_signup" | null;
  /** Meta's public ids for its Embedded Signup script, when that is the way. */
  embedded: { appId: string; configId: string; graphVersion: string } | null;
}

/** What the clinic said the number is: orientation only, the channel is the same. */
export type NumberChoice = "clinic" | "personal";
/** Where the number is on the phone today. */
export type NumberApp = "business" | "messenger";
