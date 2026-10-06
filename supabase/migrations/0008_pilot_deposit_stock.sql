-- Wuavy Pulse 0008: ready for the pilot clinic. Run after 0007.
-- Additive and safe to run twice: new optional columns only, nothing existing changes.
--
--  1. products: a category and a supplier, both optional, for the stock list.
--  2. appointments: the deposit's percentage (when asked as one), who handles
--     its payment and that payment's id. Today every deposit is "manual"
--     (marked paid by hand); a payment provider can be added to the check
--     later, writing its id here and deposit_paid_at when it confirms.

-- ── 1. Stock ──────────────────────────────────────────────────
alter table products
  add column if not exists category text check (category is null or char_length(category) <= 60),
  add column if not exists supplier text check (supplier is null or char_length(supplier) <= 120);

-- ── 2. Deposit ────────────────────────────────────────────────
alter table appointments
  add column if not exists deposit_percent smallint check (deposit_percent is null or deposit_percent between 1 and 100),
  add column if not exists deposit_provider text check (deposit_provider is null or deposit_provider in ('manual')),
  add column if not exists deposit_payment_id text check (deposit_payment_id is null or char_length(deposit_payment_id) <= 120);
