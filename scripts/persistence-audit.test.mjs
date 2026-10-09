import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html"),sql=read("supabase/migrations/20261009_atomic_persistence.sql");
const scanner=read("scanner.js"),sw=read("sw.js"),modal=read("modal-accessibility.js");
test("main inline scripts and scanner modules parse",()=>{
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([,a,b])=>!a.includes("src=")&&b.trim());
 assert.ok(scripts.length>0);for(const [,attrs,script] of scripts)new vm.Script(script);
 new vm.Script(scanner);new vm.Script(modal);
});
test("collection CSV import is a single all-or-nothing RPC",()=>{
 const section=html.split("async function replaceCollectionFromCSV(imported){")[1].split("function deckCardTotal")[0];
 assert.match(section,/collection_replace_atomic/);
 assert.doesNotMatch(section,/\.from\("collection_items"\)\.delete/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.collection_replace_atomic/);
 assert.match(sql,/DELETE FROM public\.collection_items WHERE user_id=uid/);
});
test("deck saves serialize writes and use transaction",()=>{
 const section=html.split("function syncDeck(d,{automatic=false}={}){")[1].split("async function syncDeckDelete")[0];
 assert.match(section,/deckSyncWrites\.get\(id\)/);
 assert.match(section,/deck_save_atomic/);
 assert.doesNotMatch(section,/\.from\("deck_cards"\)\.delete/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.deck_save_atomic/);
});
test("cloud refresh excludes deletion tombstones",()=>{
 assert.match(html,/deck_tombstones"\)\.select\("deck_id"\)/);
 assert.match(html,/!deletedIds\.has\(d\.id\)/);
 assert.match(html,/deck_delete_atomic/);
 assert.match(html,/deck_delete_all_atomic/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.deck_tombstones/);
});
test("general-purpose proxies remains a separate navigation entry",()=>{
 assert.match(html,/\["proxies","Proxies"\]/);
 assert.match(html,/\["CREAR",\["proxies"\]\]/);
 assert.match(html,/state\.tab==="proxies"/);
});
test("scanner undo restores confirmed exact-print quantity",()=>{
 assert.match(scanner,/id="scanUndo"/);
 assert.match(scanner,/lastSavedScan=\{id:card\.id/);
 assert.match(scanner,/qty\(item\.id\)!==item\.after/);
 assert.match(scanner,/await setQty\(item\.id,item\.before\)/);
});
test("price cache quota and PWA large-file cache protections",()=>{
 assert.match(html,/catch\(storageError\)/);
 assert.match(sw,/mialbumonepiece-v13/);
 assert.match(sw,/url\.pathname==="\/data\/packs\.json"/);
});
test("modal accessibility and removable chips are present",()=>{
 assert.match(html,/function renderFilterChips\(mode\)/);
 assert.match(modal,/event\.key==="Escape"/);
 assert.match(modal,/event\.key==="Tab"/);
});

test("cross-device card edits check expected count atomically",()=>{
 const block=html.split("function writeCollection(id,nextValue){")[1].split("function syncOne(")[0];
 assert.match(block,/collection_write_atomic/);
 assert.match(block,/p_expected:old,p_next:n/);
 assert.doesNotMatch(block,/\.from\("collection_items"\)\.upsert/);
 const write=read("supabase/migrations/20261009_atomic_collection_writes.sql");
 assert.match(write,/CREATE OR REPLACE FUNCTION public\.collection_write_atomic/);
 assert.match(write,/previous<>p_expected/);
 assert.match(write,/pg_advisory_xact_lock/);
 assert.match(write,/CREATE OR REPLACE FUNCTION public\.collection_clear_atomic/);
});
