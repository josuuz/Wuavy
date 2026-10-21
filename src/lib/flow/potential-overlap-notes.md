# Known issue: `potentialOf()` can double-count a patient across fronts

Found 2026-10-21, auditing the Wuavy Pulse commercial page before launch.
Recorded here, not fixed: it reaches into `insights.ts`'s calculation logic,
which is out of scope for a landing-page pass and deserves its own review.

## The scenario

`opportunities()` returns one `Opportunity` per front (lead_followup,
patient_return, patient_lapsed, lead_idle, open_slot, stock_expiry,
no_show), each with its own `value`. `potentialOf()` sums every front's
value with no cross-front dedup by person.

Checked against the demo's own data (`createDemoData()`), with a one-off
script (not kept):

- No overlap between: lead_followup ∩ lead_idle, patient_return ∩
  patient_lapsed (patient_lapsed already excludes anyone in `dueReturns()`,
  by code), patient_lapsed ∩ missed (no-show).
- **Real overlap found:** of the 37 patients in `dueReturns()` (front:
  patient_return), 32 also appear in `expiryOpportunities()`'s reachable-
  patient pool (front: stock_expiry) — expected, since a return often uses
  the same product that is expiring. Their value is counted once under
  patient_return and again under stock_expiry.

In the demo's numbers, this means a meaningful share of
`potentialOf(opportunities(demo))` (R$96.899) reflects the same people
counted twice, not R$96.899 of distinct opportunity.

## Why this is not a "just add patient-ID dedup" fix

A patient genuinely compatible with more than one front may deserve to be
contacted for more than one real reason — a return reminder and a
product-expiry campaign are different messages, sent (or not) on different
logic, and a clinic might reasonably want to see both signals even for the
same person. Deduping by patient ID purely to make the total add up would
hide that a person is flagged for two independent reasons, and deciding
"which front's value represents a shared patient" needs a product decision
(highest value? most urgent? both, counted once?) — not something to guess
at while touching an unrelated page.

## Recommendation

Before showing any consolidated total again (hero, dashboard, anywhere
else), decide, as a product choice, whether "receita potencial" should mean
(a) the sum of per-front value, with the overlap already understood and
disclosed, or (b) a once-per-person deduped total, with a defined tie-break
for a shared patient. Whichever is chosen, say so explicitly next to the
number.

This was not fixed as part of the commercial redesign
(`src/app/(site)/[locale]/pulse`) — that page no longer shows a consolidated
total for this reason; see its `fronts.caveat` and `interfaces.lead` copy
in the dictionaries.
