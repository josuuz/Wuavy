-- Wuavy Pulse 0006: the clinic's address, kept with its profile. Run after 0005.
-- Additive and safe to run twice: one nullable column, nothing existing changes.
--
-- The owner edits it in Configurações (lib/flow/actions.ts, updateClinic). Like
-- the profile's other columns (migration 0004), it is the only thing the
-- browser's role may update besides them: the grant is per column.

alter table organizations
  add column if not exists address text check (address is null or char_length(address) <= 200);

grant update (address) on organizations to authenticated;
