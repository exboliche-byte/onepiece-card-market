-- Fecha de la última modificación de ubicaciones físicas por mazo.
-- Independiente de deck.updated_at: mover una carta no edita la lista.
-- Las ubicaciones anteriores se mantienen intactas; las próximas operaciones
-- registrarán la fecha de todos los mazos implicados.
alter table public.deck_physical_locations
  add column if not exists deck_modified_at jsonb not null default '{}'::jsonb;

alter table public.deck_physical_locations
  add constraint deck_physical_modified_at_object
  check (jsonb_typeof(deck_modified_at) = 'object');
