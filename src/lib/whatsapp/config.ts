import "server-only";

/*
  The WhatsApp integration's settings, from the server's environment only
  (Vercel → Settings → Environment Variables). Nothing here has the
  NEXT_PUBLIC_ prefix, and this module is server-only, so the App Secret and
  the tokens never reach a browser. The Meta App ID and the Embedded Signup
  configuration id are public by nature (Meta's own script needs them in the
  browser) and are handed to the owner's screen on purpose.

  Two ways to connect, both Meta's official WhatsApp Business Platform
  (Cloud API):
  - test: Meta's test number, for one clinic only (the owner whose e-mail is
    WHATSAPP_TEST_OWNER_EMAIL). Its token is an environment variable.
  - embedded_signup: a clinic's own number, through Meta's Embedded Signup.
    Its token is stored in Supabase Vault, per clinic.
*/

const env = (name: string) => process.env[name]?.trim() || null;

/** Meta's examples for Cloud API use v25.0; a newer version is a variable away. */
export const graphVersion = () => {
  const v = env("WHATSAPP_GRAPH_VERSION");
  return v && /^v\d{2,3}\.\d$/.test(v) ? v : "v25.0";
};

export const appSecret = () => env("META_APP_SECRET");
export const verifyToken = () => env("WHATSAPP_VERIFY_TOKEN");

/** Receiving works once Meta can reach the webhook and its signature can be checked. */
export const webhookReady = () => Boolean(appSecret() && verifyToken());

export function testNumber() {
  const token = env("WHATSAPP_TEST_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_TEST_PHONE_NUMBER_ID");
  const owner = env("WHATSAPP_TEST_OWNER_EMAIL")?.toLowerCase();
  return token && phoneNumberId && owner ? { token, phoneNumberId, owner } : null;
}

export function embeddedSignup() {
  const appId = env("META_APP_ID");
  const configId = env("META_EMBEDDED_SIGNUP_CONFIG_ID");
  return appId && configId && appSecret() ? { appId, configId, graphVersion: graphVersion() } : null;
}

export type ConnectWay = "test" | "embedded_signup";

/**
 * How this clinic's owner may connect a number now: the test number (only the
 * test clinic's owner, while the test phase lasts), Meta's Embedded Signup,
 * or not yet (the screen says "em breve").
 */
export function connectWay(ownerEmail: string | null | undefined): ConnectWay | null {
  if (!webhookReady()) return null;
  const test = testNumber();
  if (test && ownerEmail && ownerEmail.toLowerCase() === test.owner) return "test";
  return embeddedSignup() ? "embedded_signup" : null;
}
