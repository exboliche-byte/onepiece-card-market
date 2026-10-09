import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const src=readFileSync(new URL("../api/topdecks.js",import.meta.url),"utf8");
const js=src.replace(/^import .*?;\s*$/gm,"").replace(/^export function /gm,"function ").replace("export default {","const endpoint={");
const make=(fetcher=async()=>({ok:true,headers:new Headers({"content-type":"text/html"}),text:async()=>html}))=>
 runInNewContext(js+"\n({parseDeckComposition,parseTopDecksPage,endpoint})",{
  URL,URLSearchParams,Headers,Response,Request,Math,Map,Date,Number,String,Array,Object,
  fetch:fetcher,getLegalityRules:async()=>({}),deckPlayable:(l,c)=>!!l&&Object.values(c).reduce((a,b)=>a+b,0)===50,
  setTimeout,clearTimeout,console
 });
const dg="1nOP13-001a4nOP01-016a4nEB04-002a3nST21-003a4nEB04-007a4nST31-004a4nEB02-017a4nOP14-022a4nOP14-031a4nOP13-027a2nOP13-118a2nOP15-032a1nOP04-016a4nST31-005a1nOP13-040a1nOP05-038a4nOP08-036";
const page="https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/";
const qs=new URLSearchParams({au:"Ryou",cn:"Europe",date:"8/22/2026",dg,dn:"RG Luffy",hs:"Malmo Regional",pl:"1st (13-1)",tn:"Regional"});
const url=page+"deckgen/?"+qs.toString();
const html='<div><a href="'+url.replaceAll("&","&amp;")+'">Ver mazo</a></div>';
test("Real Top Decks deckgen composition is converted to 1 leader and 50 main cards",()=>{
 const parsed=make().parseDeckComposition(dg);
 assert.equal(parsed.leaderId,"OP13-001");
 assert.equal(parsed.cards["OP01-016"],4);
 assert.equal(parsed.cards["OP08-036"],4);
 assert.equal(Object.values(parsed.cards).reduce((a,b)=>a+b,0),50);
 assert.equal(make().parseDeckComposition("1nOP13-001a2nST21-003"),null);
});
test("Parses HTML-escaped public links and correctly attributes the community source",()=>{
 const result=make().parseTopDecksPage(html,page);
 assert.equal(result.length,1);
 assert.equal(result[0].source,"One Piece Top Decks");
 assert.equal(result[0].sourceUrl,url);
 assert.equal(result[0].date,"2026-08-22");
 assert.equal(result[0].placing,1);
 assert.equal(result[0].record.wins,13);
 assert.equal(result[0].record.losses,1);
 assert.equal(result[0].players,0);
});
test("Fallback extracts table columns without a deckgen hyperlink",()=>{
 const cells=[dg,"","Red","op13luffy","RG Luffy","8/22/2026","Europe","Ryou","1st (13-1)","Regional","Malmo Regional"];
 const table="<table><tr>"+cells.map(s=>"<td>"+s+"</td>").join("")+"</tr></table>";
 assert.equal(make().parseTopDecksPage(table,page)[0].cards["EB04-002"],4);
});
test("Endpoint reads public HTML on demand and filters by card and leader",async()=>{
 const e=make();
 const resp=await e.endpoint.fetch(new Request("https://app.example/api/topdecks?card=OP01-016&leader=all&days=365&limit=10"));
 assert.equal(resp.status,200);
 const json=await resp.json();
 assert.equal(json.results.length,1);
 assert.equal(json.results[0].leaderId,"OP13-001");
 assert.equal(json.results[0].cards["OP01-016"],4);
 const wrong=await e.endpoint.fetch(new Request("https://app.example/api/topdecks?card=OP02-003&leader=all&days=365"));
 assert.equal((await wrong.json()).results.length,0);
});
test("Upstream failures report unavailability rather than inventing decks",async()=>{
 const e=make(async()=>{throw Error("No upstream network")});
 const response=await e.endpoint.fetch(new Request("https://app.example/api/topdecks?leader=all"));
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/No se ha podido/);
});
