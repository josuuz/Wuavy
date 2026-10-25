# Pulse Subscription Claim — Isolated Validation (DDL, Rollback, Real Concurrency) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (Native execution, chosen by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three concrete gaps left after the atomic subscription-claim fix (`claimSubscriptionCreation`/`persistSubscriptionId`/`blockSubscriptionCreation`/`recordSubscriptionRefusal` in `src/lib/flow/billing.ts`, `src/lib/mercadopago/create-subscription.ts`, migration `0020_pulse_subscription_claim.sql`, already proven by 286 passing tests at the JS/fake-admin level): (1) the migration's own DDL and constraint claims have never run against a real Postgres engine, (2) it has no rollback script, (3) no test proves the claim is safe under genuinely concurrent real-Postgres connections rather than only JS-level interleaving.

**Architecture:** Two separate, non-overlapping proofs, each reusing an existing proven pattern in this repo rather than inventing a new one:
- **Local, embedded, no network** (PGlite, mirroring `supabase/propostas/prontuario/pgspike`): replay `supabase/migrations/0001`…`0020` for real, assert the specific constraint behaviors `0020`'s own header comments claim, author the missing rollback script, and prove apply → rollback → reapply — including the one hazard nobody has checked: rolling back while `status = 'rejected'` rows already exist would break re-adding the old check constraint.
- **Real, remote, network, authorized this session** (mirroring `tests/billing-integration-real.test.mjs` + `tests/helpers/fetch-firewall.mjs`): a new integration test that runs the exact same claim/block/persist/refusal scenarios the 286 JS tests already cover, but against the real Postgres of the TEST Supabase project (`wazxofdzvzfgonmwsdhs`), with the same production-host firewall, same unique-per-run fixture tagging, same exhaustive self-cleanup with a leftover check.

**Tech Stack:** Node 24 native TS execution, `node:test` + `node:assert/strict`, `@electric-sql/pglite` (scoped to its own `pgspike/` folder, never the root `package.json`), `node:module`'s `register()` loader hooks (the same mechanism `pulse-loader.mjs`/`real-pg-loader.mjs` already use).

**Spec:** This conversation's investigation. No separate spec doc — grounded directly in `src/lib/flow/billing.ts` lines 179–360, `src/lib/mercadopago/create-subscription.ts`, `supabase/migrations/0020_pulse_subscription_claim.sql`, `supabase/migrations/0003_pulse_subscriptions.sql`, `tests/pulse-subscribe-integration.test.mjs`, `tests/helpers/fake-admin.mjs`, `tests/billing-integration-real.test.mjs`, `tests/helpers/{fetch-firewall,real-pg-loader,mp-identity}.mjs`, and `supabase/propostas/prontuario/{pgspike,reverter-0015-privilegios.sql,COMO-RODAR.md}`.

## Global Constraints

- No `git commit`, push, merge, or deploy — explicit user instruction, for every task including Task 3's rollback script.
- No change to production or to the real/remote Supabase outside the exact scope authorized this session: only the TEST project (`wazxofdzvzfgonmwsdhs`), only through the same firewall pattern `billing-integration-real.test.mjs` already uses, only for the `subscriptions` table and its own fixtures, self-cleaned, with the same explicit host assertion (`SUPABASE_HOST === "wazxofdzvzfgonmwsdhs.supabase.co"` and a hard check that it does **not** contain `trwrulahqytfbmoxajnc`, the production ref) before any write.
- Do not modify `billing.ts`, `create-subscription.ts`, `actions.ts`, `session.ts`, `Checkout.tsx`, or migration `0020` itself — those are the already-tested, already-reviewed implementation. This plan only adds proof around them (PGlite replay, a rollback script, one new real-Postgres test file) and, if Task 2's constraint check genuinely fails, stops and reports rather than silently patching the migration.
- **Any migration-shaped file (Task 3's rollback script) requires independent review before being considered done** — the user's explicit instruction. Dispatch `ecc:database-reviewer` on the rollback script (and, if Task 2 finds the migration's own constraint claims don't hold, on `0020` itself) before marking Task 3 complete.
- A final whole-batch review (fresh reviewer, not this session's running context) happens after Task 4, before presenting results — the user's explicit instruction, separate from Task 3's migration-specific gate.
- Never reuse the 286-test PGlite/fake-admin result as if it were proof of real-Postgres concurrency, and never present the PGlite replay (Tasks 1–3) as proof of multi-connection concurrency either — PGlite is single-connection. Only Task 4 (the real Supabase test project) proves genuine concurrent-connection behavior. State this distinction explicitly in the findings (Task 5).

## Review Focus

- Does migration `0020`'s DDL actually apply, in order, on top of the real accumulated schema (`0001`…`0019`, not a toy schema) — PGlite has never run past `0016` in this repo before (Prontuário's harness stops there). (Task 1)
- Does the adjusted partial unique index (`subscriptions_one_live_per_clinic`, now excluding `'rejected'` too) really allow two `'rejected'` rows for the same `organization_id`, as the migration's own comment claims, and does the status check constraint really accept `'rejected'` while still rejecting garbage? (Task 2)
- Does rolling back `0020` while rows with `status = 'rejected'` already exist break re-adding the old check constraint (`status in ('pending','active','past_due','cancelled')`) — a hazard nobody has checked yet, since no rollback script exists at all today. (Task 3)
- Under genuinely concurrent real Postgres connections (not JS-interleaved fakes), do two simultaneous `claimSubscriptionCreation` calls on the same row still produce exactly one `"claimed"` and one `"in_progress"`, and does a real unique-constraint conflict on `provider_subscription_id` behave the way `persistSubscriptionId`'s retry logic assumes? (Task 4)
- Does the new real-Postgres test file leave anything behind in the TEST project on failure — every fixture must be tagged with a unique run id and the `after()` hook must verify zero leftovers the same way `billing-integration-real.test.mjs` does, or a failed run silently pollutes a shared project. (Task 4)

---

## Task 1: PGlite harness — replay 0001–0020

**Files:**
- Create: `supabase/propostas/pulse-subscription-claim/pgspike/package.json`
- Create: `supabase/propostas/pulse-subscription-claim/pgspike/bootstrap.sql`
- Create: `supabase/propostas/pulse-subscription-claim/pgspike/run.mjs`

**Interfaces:**
- Produces: `run.mjs` exports `async function freshDb()` → a `PGlite` instance with `bootstrap.sql` and `supabase/migrations/0001`…`0020` (0020 included, unlike Prontuário's harness which stops at the number it was itself proposing) already applied.

- [ ] **Step 1: Copy `bootstrap.sql` and `package.json` verbatim from `supabase/propostas/prontuario/pgspike/`** — same generic Supabase shim, no changes needed (migrations 0017–0020 add no new schema dependency the shim doesn't already cover: 0017–0019 are the Cobranças tables, 0020 only alters `subscriptions`).
- [ ] **Step 2: Write `run.mjs`**, adapting `prontuario/pgspike/run.mjs` lines 1–48 (bootstrap + ordered migration replay, including the `noPgcrypto` neutralization). Apply every file in `supabase/migrations/` (now `0001`…`0020`, read from disk so a future `0021` is picked up automatically rather than hardcoded). Export `freshDb()` for Tasks 2–3 to import; keep a standalone-run path that prints progress the same way.
- [ ] **Step 3: Run.**

Run: `cd "supabase/propostas/pulse-subscription-claim/pgspike" && npm install && node run.mjs`
Expected: every migration through `0020_pulse_subscription_claim.sql` prints `aplicado`, exits 0.

---

## Task 2: Prove 0020's own constraint claims, for real

**Files:**
- Create: `supabase/propostas/pulse-subscription-claim/pgspike/prova-0020.mjs`

**Interfaces:**
- Consumes: `freshDb()` from Task 1.

- [ ] **Step 1: Write and run the three assertions the migration's comments make**, as plain SQL through PGlite (seed via `insert`, assert via `select`/thrown-error capture — no JS orchestration code involved, this is pure DDL/DML proof):

```js
test("duas linhas 'rejected' para o mesmo organization_id não violam o índice (ao contrário de duas 'active')", async () => {
  const db = await freshDb();
  // seed one organization, then two subscriptions rows with status='rejected' for it — must succeed.
  // then a third with status='active' for the same org — must succeed (only one 'active'/'pending'/etc. allowed, this is the control).
  // then a second 'active' for the same org — must throw a unique_violation.
});

test("o check constraint aceita 'rejected' e continua recusando lixo", async () => {
  // insert status='rejected' — succeeds; insert status='qualquer-coisa' — throws check_violation.
});
```

- [ ] **Step 2: Run.**

Run: `node --test prova-0020.mjs`
Expected: both pass. If either fails, **stop** — this means `0020`'s own stated behavior is wrong, which is a finding for Task 5, not something to silently fix here (Global Constraints: don't modify `0020`).

---

## Task 3: Rollback script — write it, then prove the hazard

**Files:**
- Create: `supabase/propostas/pulse-subscription-claim/reverter-0020-subscription-claim.sql`
- Create: `supabase/propostas/pulse-subscription-claim/pgspike/prova-rollback.mjs`

**Interfaces:**
- Consumes: `freshDb()` (Task 1), the migration file from Task 1's replay list.

- [ ] **Step 1: Write the rollback script**, mirroring `reverter-0015-privilegios.sql`'s disclaimer-header style: drop the 4 new columns, drop the adjusted index and recreate `0003`'s original definition (`where organization_id is not null and status <> 'cancelled'`), and restore the original check constraint (`status in ('pending','active','past_due','cancelled')`) — in that order, since restoring the check constraint before the columns are gone is fine but restoring it while `'rejected'` rows still exist is the exact hazard being tested next.
- [ ] **Step 2: Write the straight-line proof** — apply `0020`, then the rollback, then re-apply `0020`, on an empty table:

```js
test("0020 aplica, reverte e reaplica sem erro, numa tabela vazia", async () => {
  const db = await freshDb(); // already has 0001..0019
  await db.exec(readSql("0020_pulse_subscription_claim.sql"));
  await db.exec(readSql("reverter-0020-subscription-claim.sql"));
  await db.exec(readSql("0020_pulse_subscription_claim.sql")); // must not error
});
```

- [ ] **Step 3: Write the hazard test** — the one nobody has checked:

```js
test("reverter com uma linha 'rejected' já existente FALHA ao recriar o check constraint antigo", async () => {
  const db = await freshDb();
  await db.exec(readSql("0020_pulse_subscription_claim.sql"));
  // insert a row with status = 'rejected'
  await assert.rejects(() => db.exec(readSql("reverter-0020-subscription-claim.sql")));
});
```

If this is confirmed, the rollback script's header must say so explicitly (prerequisite: reassign or delete any `'rejected'` rows before rolling back) — matching how `0020`'s own header already flags the production-data prerequisite for forward application.

- [ ] **Step 4: Run both.**

Run: `node --test prova-rollback.mjs`
Expected: PASS for both (the second test passing means the hazard is confirmed and now documented, not that the rollback script is broken).

- [ ] **Step 5: Independent review — required, not optional, per the user's explicit instruction for any migration-shaped file.** Dispatch `ecc:database-reviewer` on `reverter-0020-subscription-claim.sql` (and on `0020_pulse_subscription_claim.sql` itself only if Task 2 found a discrepancy). Do not mark this task done until that review returns.

---

## Task 4: Real Postgres concurrency — the TEST Supabase project

**Files:**
- Create: `tests/helpers/pulse-real-pg-loader.mjs`
- Create: `tests/pulse-subscribe-claim-real.test.mjs`

**Interfaces:**
- Consumes: `tests/helpers/fetch-firewall.mjs` (`installFetchFirewall`), the real `createAdminClient` (untouched, unlike `pulse-loader.mjs`), `src/lib/flow/billing.ts`'s `claimSubscriptionCreation`/`persistSubscriptionId`/`blockSubscriptionCreation`/`recordSubscriptionRefusal`.

- [ ] **Step 1: Write `pulse-real-pg-loader.mjs`** — combine `real-pg-loader.mjs`'s module resolution (leave `@/lib/supabase/admin` real, untouched) with `pulse-loader.mjs`'s session fake (`@/lib/flow/session` → `fake-session.mjs`, since cookies are out of scope here the same way they are for the JS-level integration test) and the same `server-only`/`next/navigation` stubs. No Cobranças-specific virtual modules — this file is Pulse-only.
- [ ] **Step 2: Write the test file header**, copying `billing-integration-real.test.mjs` lines 1–65 almost verbatim: read `C:\Users\User\wuavy-secrets\supabase-test.env`, assert `SUPABASE_HOST === "wazxofdzvzfgonmwsdhs.supabase.co"` and that it does not contain `trwrulahqytfbmoxajnc`, install the firewall with `forbiddenHosts` including both the production API and DB hosts, register `pulse-real-pg-loader.mjs`, import `billing.ts` and `createAdminClient` for real.
- [ ] **Step 3: Write the four scenarios**, each against a uniquely-tagged fixture row in `subscriptions` (reuse `freshRow`'s shape from `tests/pulse-subscribe-integration.test.mjs`, insert it for real):

```js
test("A) duas conexões reais disputando a mesma linha: só uma 'claimed'", async () => {
  const id = await insertSubscriptionRow();
  const [r1, r2] = await Promise.all([billing.claimSubscriptionCreation(id), billing.claimSubscriptionCreation(id)]);
  assert.deepEqual([r1, r2].sort(), ["claimed", "in_progress"]);
});

test("B) reserva vencida: claimSubscriptionCreation trava de verdade no Postgres real", async () => { /* mirrors billing-integration-real.test.mjs test B, with creation_claimed_at/creation_blocked_at */ });

test("C) provider_subscription_id duplicado é rejeitado pelo índice único de verdade", async () => { /* mirrors test C, using provider_subscription_id instead of provider_preference_id */ });

test("D) persistSubscriptionId recupera mesmo com a linha bloqueada de verdade entre a reivindicação e a gravação", async () => { /* mirrors test D */ });
```

- [ ] **Step 4: Write the `after()` cleanup**, copying `billing-integration-real.test.mjs` lines 341–377's structure: delete only the run-tagged fixture ids from `subscriptions`, then verify by `ilike` on a tagged column that nothing of this run's prefix remains, throwing loudly if it does.
- [ ] **Step 5: Run — this is the one step in the whole plan that touches the real network.**

Run: `node --test tests/pulse-subscribe-claim-real.test.mjs`
Expected: all 4 pass; console confirms the host and confirms zero leftovers.

---

## Task 5: Final review and findings

- [ ] **Step 1: Dispatch a fresh whole-batch review** (not this session's context) over every file this plan created: the PGlite harness, `prova-0020.mjs`, the rollback script and `prova-rollback.mjs`, `pulse-real-pg-loader.mjs`, and `pulse-subscribe-claim-real.test.mjs`. Use the `/code-review` skill at high effort for correctness, plus flag to the reviewer specifically that one file (`pulse-subscribe-claim-real.test.mjs`) touches a real, shared, remote resource and should be checked for the same safety properties `billing-integration-real.test.mjs` already has (host assertion, firewall, cleanup-with-verification) rather than assumed.
- [ ] **Step 2: Present to the user, before anything is published**, per their explicit closing instruction: what was tested, what passed, what Task 2/3 found about `0020`'s real behavior and its rollback hazard, what Task 4 proved under genuine concurrent connections, and every file created — all of it still uncommitted, waiting for the user's own decision on commit/publish.

---

## Self-Review Notes

- **Spec coverage:** "concorrência real" → Task 4 (the only task that can actually claim this); "reconciliação" → already proven at the JS level by the existing 286 tests (test 6), not re-litigated here; "compatibilidade de rollback" → Tasks 2–3. Nothing in this plan re-implements `claimSubscriptionCreation` or its siblings — it only adds proof around the existing implementation.
- **Honesty about PGlite's limits:** stated once in Global Constraints and repeated in Task 4's framing, rather than letting Tasks 1–3 be mistaken for concurrency proof — directly answering the user's point 7.
- **No duplicated work:** Task 4 mirrors `billing-integration-real.test.mjs` structurally but targets a different table and a different source module; nothing here re-tests what `tests/pulse-subscribe-integration.test.mjs` (the 286-test suite) already covers at the JS level.
