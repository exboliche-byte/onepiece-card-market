import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {default as archiveApi} from "../api/competitive-decks.js";
const archivedDate="2025-09-01";
const legalCards={};
for(let n=1;n<=12;n++)legalCards[String(n).padStart(3,"0")]=4;
legalCards["013"]=2;
const cards=Object.entries(legalCards).map(([number,count])=>({set:"OP17",number,count}));
const makeRow=id=>({
 name:"Archive tester",player:"player-"+id,placing:1,record:{wins:8,losses:0,ties:0},
 decklist:{leader:{set:"OP17",number:"099",name:"Leader"},character:cards,event:[],stage:[]}
});
test("archive mode scans old events across pages, enforces current legality and reports pagination",async()=>{
 const originalFetch=globalThis.fetch;
 const events=Array.from({length:27},(_,i)=>({id:"historic-"+i,date:archivedDate,name:"Historical "+i,players:80}));
 const rules=JSON.parse(fs.readFileSync(new URL("../data/legality.json",import.meta.url),"utf8"));
 globalThis.fetch=async url=>{
  const path=String(url);
  if(path.includes("tournaments?"))return new Response(JSON.stringify(events),{status:200});
  if(path.includes("/standings")){
   const id=path.match(/historic-(\d+)/)?.[1];
   const row=makeRow(id);
   // An old event may include a deck that is NOT legal today.
   if(id==="0")row.decklist.leader={set:"OP03",number:"040",name:"Banned"};
   return new Response(JSON.stringify([row]),{status:200});
  }
  if(path.includes("/data/legality.json"))return new Response(JSON.stringify(rules),{status:200});
  throw Error("Unexpected URL "+path);
 };
 try{
  const first=await archiveApi.fetch(new Request("https://site.invalid/api/competitive-decks?archive=1&leader=all&minPlayers=4&page=1"));
  assert.equal(first.status,200);
  const data=await first.json();
  assert.equal(data.archive,true);
  assert.equal(data.page,1);
  assert.equal(data.hasMore,true);
  assert.equal(data.scannedEvents,24);
  assert.equal(data.results.length,23);
  assert.ok(data.results.every(x=>x.mainCount===50&&x.leaderId==="OP17-099"));
  const second=await archiveApi.fetch(new Request("https://site.invalid/api/competitive-decks?archive=1&leader=all&minPlayers=4&page=2"));
  const page=await second.json();
  assert.equal(page.results.length,3);
  assert.equal(page.hasMore,false);
  const recent=await archiveApi.fetch(new Request("https://site.invalid/api/competitive-decks?leader=all&days=90&minPlayers=4"));
  assert.equal((await recent.json()).results.length,0);
 }finally{globalThis.fetch=originalFetch}
});
test("Yonko archive fetch is distinct from recent EN format and never switches to JP",()=>{
 const yonko=fs.readFileSync(new URL("../api/yonko-decks.js",import.meta.url),"utf8");
 assert.match(yonko,/archive\?\[\.\.\.Array\.from/);
 assert.match(yonko,/format==="en"\&&!deckPlayable/);
 assert.match(yonko,/hasMore:page\*MAX_EVENTS_PER_SEARCH/);
});
