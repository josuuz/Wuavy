-- Wuavy Pulse 0011: closes what 0009 left open for the app deployed before it. Run after 0010,
-- and only once the app from the same change is live (the old app reads products with "*" and
-- changes a visit's status directly; both stop working here). Safe to run twice.
--
--  1. A product's cost is the owner's to see: everyone else reads the stock without it (the
--     owner reads it through pulse_product_costs). The front office may still set it when
--     registering a product, from the invoice in hand.
--  2. A visit's status changes only through pulse_set_appointment_status, so a finished
--     visit always has its snapshot, its stock moved and its patient summary updated.
--
-- A column added to products later must be granted here too, or nobody but the server reads it.

revoke select on products from anon, authenticated;
grant select (
  id, organization_id, name, unit, min_quantity, brand, category, supplier, created_at, created_by, updated_at, updated_by
) on products to authenticated;

revoke update (status) on appointments from authenticated;
