-- Ordenada después de crear deck_physical_locations.
-- Fechas por mazo, aisladas de los cambios de la lista de cartas.
alter table public.deck_physical_locations
  add column if not exists deck_modified_at jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deck_physical_modified_at_object'
      and conrelid = 'public.deck_physical_locations'::regclass
  ) then
    alter table public.deck_physical_locations
      add constraint deck_physical_modified_at_object
      check (jsonb_typeof(deck_modified_at) = 'object');
  end if;
end;
$$;
