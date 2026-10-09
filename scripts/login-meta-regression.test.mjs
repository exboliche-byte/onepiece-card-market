import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html");
const meta=read("meta.js");

test("login automatically synchronizes only changed or new decks",()=>{
 const section=html.split("async function syncCloudInternal(userId){")[1].split("let supabaseInitPromise")[0];
 assert.ok(section,"Cloud reconciliation must be present");
 assert.doesNotMatch(section,/await syncDeck\(/,"Reconciliation must be read-only");
 assert.match(section,/deckContentSignature/);
 assert.match(section,/deckPendingSyncIds.add\(d.id\)/);
 assert.match(section,/deck_tombstones/);
 assert.doesNotMatch(html,/id="retryDeckCloudSync"/);
});
test("deck save normalizes valid cards and does not persist zeros",()=>{
 const section=html.split("function syncDeck(d,{automatic=false}={}){")[1].split("async function syncDeckDelete")[0];
 assert.match(section,/Number\(value\)>0/);
 assert.match(section,/p_cards:cards/);
 assert.match(section,/deck_save_atomic/);
});
test("deck completion back button follows history with safe same-site fallback",()=>{
 const section=html.split("function deckCompletionView(){")[1].split("function renderShell(){")[0];
 assert.match(section,/id="deckCompletionBack"/);
 assert.doesNotMatch(section,/Volver a la web|href="\/" /);
 assert.match(html,/history\.back\(\);return/);
 assert.match(html,/state\.tab="decks";state\.deckLibrary=true/);
});
test("Meta retries a temporary error and recovers without a page reload",async()=>{
 const storage=new Map(),refresh={addEventListener:(_,fn)=>{refresh.click=fn}};
 let calls=0;
 const good={source:"Limitless",updatedAt:"2026-10-09T02:50:24Z",
  formatUsed:"auto",formats:["EXTRA"],games:30,includedEvents:1,scannedEvents:1,
  leaders:[{id:"OP17-039",games:30,wins:19,losses:11,tier:"S"}],matchups:[]};
 const sandbox={
  document:{createElement:()=>({}),head:{appendChild(){}},querySelectorAll:()=>[],
   querySelector:selector=>selector==="#metaRefresh"?refresh:null},
  window:{},state:{tab:"other",cards:[]},renderShell(){},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)},
  fetch:async(url)=>{if(String(url).includes("meta-comparison"))return {ok:true,json:async()=>({sources:[]})};calls++;return calls===1?
   {ok:false,status:502,text:async()=>JSON.stringify({error:"Limitless temporal"})}:
   {ok:true,status:200,text:async()=>JSON.stringify(good)};},
  AbortSignal,URLSearchParams,console,Date,Number,Array,Object,Math,JSON,
  esc:text=>String(text).replaceAll("&","&amp;"),baseId:x=>String(x)
 };
 vm.runInNewContext(meta,sandbox);
 sandbox.window.metaBind();
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.match(sandbox.window.metaView(),/Limitless temporal/);
 assert.equal(calls,1);
 refresh.click();
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(calls,2);
 assert.match(sandbox.window.metaView(),/Partidas analizadas/);
 assert.match(sandbox.window.metaView(),/30/);
 assert.ok(storage.size>=1,"Successful response is cached for intermittent outages");
});

test("competitive previews receive real UUIDs on save and auto-recover old IDs",()=>{
 const save=html.split("async function saveCompetitiveDraft(){")[1].split("function deckLibraryView(){")[0];
 assert.match(save,/d\.id=crypto\.randomUUID\(\)/);
 assert.match(save,/await syncDeck\(d\)/);
 const normalize=html.split("function ensureSavedDeckUuid(deck){")[1].split("function scheduleAutomaticDeckRetry")[0];
 assert.match(normalize,/savedDeckUuidPattern\.test/);
 assert.match(normalize,/saveLocal\(\)/);
 const sync=html.split("function syncDeck(d,{automatic=false}={}){")[1].split("async function syncDeckDelete")[0];
 assert.match(sync,/ensureSavedDeckUuid\(d\)/);
 assert.match(sync,/scheduleAutomaticDeckRetry\(\)/);
});
