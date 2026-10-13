// What decides whether the Pulse may charge anyone: maintenance/environment.ts,
// which src/lib/flow/billing.ts asks before every call to Mercado Pago. The
// key's format proves nothing (a test account's token also starts with
// APP_USR-), so the environment is declared and checked against where the
// code runs, and anything that does not add up closes the charge. Every token
// below is a made-up string; nothing here can reach Mercado Pago.
import test from "node:test";
import assert from "node:assert/strict";

import { checkoutDecision, declaredMode, decide, payerEmailFor, REFUSAL } from "../src/lib/maintenance/environment.ts";

const TOKEN = "APP_USR-0000000000000000-000000-synthetic";
const BUYER = "test_user_0000@testuser.com";

const without = (env, ...keys) => Object.fromEntries(Object.entries(env).filter(([key]) => !keys.includes(key)));

const production = { VERCEL_ENV: "production", MERCADOPAGO_ACCESS_TOKEN: TOKEN };
const preview = { VERCEL_ENV: "preview", MERCADOPAGO_ACCESS_TOKEN: TOKEN, MERCADOPAGO_ENV: "test", MERCADOPAGO_TEST_PAYER_EMAIL: BUYER };

test("production with live credentials charges", () => {
  assert.deepEqual(decide(production), { allowed: true, mode: "live" });
});

test("production with credentials declared as test is refused, buyer or not", () => {
  const declared = { ...production, MERCADOPAGO_ENV: "test" };
  assert.deepEqual(decide(declared), { allowed: false, reason: "test-in-production" });
  assert.deepEqual(decide({ ...declared, MERCADOPAGO_TEST_PAYER_EMAIL: BUYER }), { allowed: false, reason: "test-in-production" });
});

test("the declaration is read as written, not as typed", () => {
  assert.equal(decide({ ...production, MERCADOPAGO_ENV: " TEST " }).allowed, false);
  assert.equal(decide({ ...production, VERCEL_ENV: " Production " }).allowed, true);
  assert.equal(decide({ ...preview, MERCADOPAGO_ENV: "Test" }).allowed, true);
});

test("a test environment charges only against a test account, with its buyer", () => {
  assert.deepEqual(decide(preview), { allowed: true, mode: "test" });
  // No VERCEL_ENV at all is a developer's machine or `next start`: still test.
  assert.deepEqual(decide(without(preview, "VERCEL_ENV")), { allowed: true, mode: "test" });
});

test("a test environment without its test buyer is refused", () => {
  assert.deepEqual(decide(without(preview, "MERCADOPAGO_TEST_PAYER_EMAIL")),{ allowed: false, reason: "no-test-payer" });
  assert.deepEqual(decide({ ...preview, MERCADOPAGO_TEST_PAYER_EMAIL: "  " }), { allowed: false, reason: "no-test-payer" });
});

test("live credentials outside production are refused: a forgotten production token cannot charge from a laptop or a preview", () => {
  const live = without(preview, "MERCADOPAGO_ENV", "MERCADOPAGO_TEST_PAYER_EMAIL");
  assert.deepEqual(decide(live), { allowed: false, reason: "live-outside-production" });
  assert.deepEqual(decide({ ...live, VERCEL_ENV: undefined }), { allowed: false, reason: "live-outside-production" });
  assert.deepEqual(decide({ ...live, VERCEL_ENV: "development" }), { allowed: false, reason: "live-outside-production" });
});

test("a host that does not say it is production is not production", () => {
  // Live token, no VERCEL_ENV: closed, rather than charging from somewhere unknown.
  assert.equal(decide({ MERCADOPAGO_ACCESS_TOKEN: TOKEN }).allowed, false);
});

test("without credentials nothing is charged, wherever it runs", () => {
  for (const env of [{}, { VERCEL_ENV: "production" }, { ...production, MERCADOPAGO_ACCESS_TOKEN: "" }, { ...production, MERCADOPAGO_ACCESS_TOKEN: "   " }, { ...preview, MERCADOPAGO_ACCESS_TOKEN: undefined }]) {
    assert.deepEqual(decide(env), { allowed: false, reason: "no-credentials" });
  }
});

test("every refusal has something to tell the person who runs it, and never a secret", () => {
  for (const reason of ["no-credentials", "invalid-env", "test-in-production", "live-outside-production", "no-test-payer", "test-key-in-live"]) {
    assert.ok(REFUSAL[reason].length > 0, reason);
    assert.ok(!REFUSAL[reason].includes(TOKEN), reason);
  }
});

test("the payer is the test buyer in test, and the customer everywhere else", () => {
  const customer = "cliente@clinica.example";
  assert.equal(payerEmailFor(preview, customer), BUYER);
  assert.equal(payerEmailFor({ ...preview, MERCADOPAGO_TEST_PAYER_EMAIL: `  ${BUYER}  ` }, customer), BUYER);
  // A buyer left configured in production is ignored: the customer pays as themselves.
  assert.equal(payerEmailFor({ ...production, MERCADOPAGO_TEST_PAYER_EMAIL: BUYER }, customer), customer);
  // And while the charge is closed, the customer's address is not swapped either.
  assert.equal(payerEmailFor({ ...production, MERCADOPAGO_ENV: "test", MERCADOPAGO_TEST_PAYER_EMAIL: BUYER }, customer), customer);
});

// ── A declaration that is neither "test" nor "live" ──────────────────────────

test("only empty, test and live are declarations", () => {
  for (const [value, mode] of [[undefined, "live"], ["", "live"], ["  ", "live"], ["live", "live"], [" LIVE ", "live"], ["test", "test"], [" Test ", "test"]]) {
    assert.equal(declaredMode({ MERCADOPAGO_ENV: value }), mode, JSON.stringify(value));
  }
  for (const value of ["sandbox", "tset", "testing", "production", "prod", "true", "1", "false"]) {
    assert.equal(declaredMode({ MERCADOPAGO_ENV: value }), "invalid", value);
  }
});

test("an invalid declaration closes the charge instead of being read as live", () => {
  for (const value of ["sandbox", "tset", "production", "1"]) {
    // In production it used to open the charge as live; that is the case this closes.
    assert.deepEqual(decide({ ...production, MERCADOPAGO_ENV: value }), { allowed: false, reason: "invalid-env" }, value);
    assert.deepEqual(decide({ ...preview, MERCADOPAGO_ENV: value }), { allowed: false, reason: "invalid-env" }, value);
  }
});

test("missing credentials are still reported first, whatever the declaration says", () => {
  assert.deepEqual(decide({ VERCEL_ENV: "production", MERCADOPAGO_ENV: "sandbox" }), { allowed: false, reason: "no-credentials" });
});

test("an explicit live is the same as saying nothing", () => {
  assert.deepEqual(decide({ ...production, MERCADOPAGO_ENV: "live" }), { allowed: true, mode: "live" });
  assert.deepEqual(decide({ ...preview, MERCADOPAGO_ENV: "live" }), { allowed: false, reason: "live-outside-production" });
});

// ── The checkout's public key ────────────────────────────────────────────────

test("a TEST- public key under a live declaration closes the checkout", () => {
  const key = { NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "TEST-00000000-0000-0000-0000-000000000000" };
  assert.deepEqual(checkoutDecision({ ...production, ...key }), { allowed: false, reason: "test-key-in-live" });
  assert.deepEqual(checkoutDecision({ ...production, ...key, MERCADOPAGO_ENV: "live" }), { allowed: false, reason: "test-key-in-live" });
  assert.deepEqual(checkoutDecision({ ...production, NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: " TEST-0000 " }), { allowed: false, reason: "test-key-in-live" });
});

test("a TEST- public key is what a test environment is meant to have", () => {
  const key = { NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "TEST-00000000-0000-0000-0000-000000000000" };
  assert.deepEqual(checkoutDecision({ ...preview, ...key }), { allowed: true, mode: "test" });
});

test("any other public key proves nothing, so it changes nothing", () => {
  for (const value of [undefined, "", "APP_USR-00000000-0000-0000-0000-000000000000"]) {
    const key = { NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: value };
    assert.deepEqual(checkoutDecision({ ...production, ...key }), { allowed: true, mode: "live" }, String(value));
    assert.deepEqual(checkoutDecision({ ...preview, ...key }), { allowed: true, mode: "test" }, String(value));
  }
});

test("the checkout keeps every refusal the environment gives", () => {
  assert.deepEqual(checkoutDecision({}), { allowed: false, reason: "no-credentials" });
  assert.deepEqual(checkoutDecision({ ...production, MERCADOPAGO_ENV: "test" }), { allowed: false, reason: "test-in-production" });
  assert.deepEqual(checkoutDecision({ ...production, MERCADOPAGO_ENV: "sandbox" }), { allowed: false, reason: "invalid-env" });
});

// ── The maintenance billing, which shares decide() and has no public key ─────

test("the maintenance setup is untouched by a Pulse public key", () => {
  // Maintenance asks decide(), never checkoutDecision(): a TEST- key set for
  // the Pulse's card form must not close its subscriptions.
  const key = { NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "TEST-00000000-0000-0000-0000-000000000000" };
  assert.deepEqual(decide({ ...production, ...key }), { allowed: true, mode: "live" });
  assert.deepEqual(decide({ ...preview, ...key }), { allowed: true, mode: "test" });
});

test("the setups the maintenance billing is documented to run in still open", () => {
  // .env.example: MERCADOPAGO_ENV empty on Vercel Production; "test" with the
  // test buyer on a development machine or a Preview deploy.
  assert.deepEqual(decide({ VERCEL_ENV: "production", MERCADOPAGO_ACCESS_TOKEN: TOKEN, MERCADOPAGO_ENV: "" }), { allowed: true, mode: "live" });
  assert.deepEqual(decide({ MERCADOPAGO_ACCESS_TOKEN: TOKEN, MERCADOPAGO_ENV: "test", MERCADOPAGO_TEST_PAYER_EMAIL: BUYER }), { allowed: true, mode: "test" });
  assert.deepEqual(decide({ VERCEL_ENV: "preview", MERCADOPAGO_ACCESS_TOKEN: TOKEN, MERCADOPAGO_ENV: "test", MERCADOPAGO_TEST_PAYER_EMAIL: BUYER }), { allowed: true, mode: "test" });
});
