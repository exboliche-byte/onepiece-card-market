import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=readFileSync(new URL("../supabase/migrations/20261010_zz_security_consented_meta_rls.sql",import.meta.url),"utf8");
test("Community meta keeps prior fields but filters non-consenting tournaments",()=>{
 assert.match(file,/pg_get_functiondef\('public\.get_community_meta\(integer\)'::regprocedure\)/);
 assert.match(file,/join public\.meta_opt_ins o on o\.user_id=t\.user_id and o\.enabled=true/);
 assert.match(file,/RAISE EXCEPTION 'Unexpected community meta function body/);
});
test("Public read-only RPC grants stay explicit, trades remain private",()=>{
 for(const name of ["get_community_meta\\(integer\\)","public_collection_snapshot\\(text\\)"])
  assert.match(file,new RegExp("GRANT EXECUTE ON FUNCTION public\\."+name+" TO anon,authenticated"));
 assert.doesNotMatch(file,/GRANT EXECUTE ON FUNCTION.*trade_offer.*TO anon/);
});
test("Four meta RLS policies preserve ownership with precomputed auth uid",()=>{
 for(const verb of ["select","insert","update","delete"])
  assert.ok(file.includes('ALTER POLICY "meta optin '+verb+'"'));
 assert.equal((file.match(/\(SELECT auth\.uid\(\)\)/g)||[]).length,5);
});
