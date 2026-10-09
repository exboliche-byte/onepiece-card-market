-- Authenticated users must be able to update *their own* tombstone's timestamp.
-- deck_delete_atomic and deck_delete_all_atomic use INSERT ... ON CONFLICT DO UPDATE,
-- require UPDATE privilege and an owner-scoped UPDATE RLS policy.
-- Do not grant UPDATE on deck_id or user_id, or disable RLS.
grant update (deleted_at) on table public.deck_tombstones to authenticated;

drop policy if exists deck_tombstones_update_own on public.deck_tombstones;
create policy deck_tombstones_update_own on public.deck_tombstones
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
