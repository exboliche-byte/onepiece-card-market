import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html"),sql=read("supabase/migrations/20261009_fix_deck_delete_permissions.sql");
test("Deck tombstone permissions are UPDATE-column only and owner RLS scoped",()=>{
 assert.match(sql,/grant update \(deleted_at\) on table public\.deck_tombstones to authenticated/i);
 assert.match(sql,/for update to authenticated/i);
 assert.match(sql,/using \(\(select auth\.uid\(\)\) = user_id\)/i);
 assert.match(sql,/with check \(\(select auth\.uid\(\)\) = user_id\)/i);
 assert.doesNotMatch(sql,/disable row level security/i);
});
test("Delete verifies the server before dropping the local deck and clears pending retries",()=>{
 assert.match(html,/client\.rpc\("deck_delete_atomic",\{p_deck_id:id\}\)/);
 assert.match(html,/client\.from\("decks"\)\.select\("id"\)/);
 assert.match(html,/deckPendingSyncIds\.delete\(id\)/);
 assert.match(html,/await syncDeckDelete\(id\)/);
 assert.match(html,/button\.textContent="Eliminando…"/);
 assert.match(html,/replaceAppHistory\(\);renderShell\(\);notify\("Mazo eliminado correctamente"\)/);
});
