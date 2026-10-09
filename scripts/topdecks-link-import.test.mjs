import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const begin=html.indexOf("function parseTopDecksLink(raw){");
const end=html.indexOf("function importDeckText(t,n=",begin);
assert.ok(begin>=0&&end>begin,"link parser must exist in SPA");
const parse=runInNewContext(html.slice(begin,end)+"\nparseTopDecksLink",{URL,Number,String,Object});
const dg="1nOP13-001a4nOP01-016a4nEB04-002a3nST21-003a4nEB04-007a4nST31-004a4nEB02-017a4nOP14-022a4nOP14-031a4nOP13-027a2nOP13-118a2nOP15-032a1nOP04-016a4nST31-005a1nOP13-040a1nOP05-038a4nOP08-036";
const params=new URLSearchParams({au:"Ryou",cn:"Europe",date:"8/22/2026",dg,dn:"RG Luffy",hs:"Malmo Regional",pl:"1st (13-1)",tn:"Regional"});
const link="https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/deckgen/?"+params.toString();
test("A real 51-card Top Decks link imports exactly 50 plus the printed leader",()=>{
 const d=parse(link);
 assert.equal(d.leader,"OP13-001");
 assert.equal(d.name,"RG Luffy");
 assert.equal(d.cards["OP01-016"],4);
 assert.equal(d.cards["OP08-036"],4);
 assert.equal(Object.values(d.cards).reduce((s,q)=>s+q,0),50);
 assert.match(d.description,/One Piece Top Decks/);
});
test("Rejects unsupported hosts and links with no real deck",()=>{
 assert.throws(()=>parse(link.replace("onepiecetopdecks.com","evil.example")),/onepiecetopdecks.com/);
 assert.throws(()=>parse("https://onepiecetopdecks.com/wp-json/"),/deckgen/);
 assert.throws(()=>parse("https://onepiecetopdecks.com/deck-list/test/deckgen/?dg=1nOP13-001a1nOP02-001"),/50 cartas/);
 assert.throws(()=>parse(link.replace("1nOP13-001","3nOP13-001")),/líder/);
 assert.throws(()=>parse(link.replace("4nOP08-036","4nFAKE-101")),/código/);
});
test("Normal text-based deck import still exists and pasted links do not fetch third parties",()=>{
 assert.match(html,/if\(\/\^https\?:\\\/\\\/\(\?:www\\\.\)\?onepiecetopdecks/);
 assert.match(html,/t=JSON\.stringify\(linked\)/);
 assert.match(html,/faltan "\+missing\.length\+" cartas/);
 assert.match(html,/function parseDeckListLine\(line\)/);
 assert.match(html,/enlace <code>deckgen<\/code>/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 const main=scripts.find(x=>x.includes("function parseTopDecksLink"));
 assert.doesNotThrow(()=>new Function(main));
});
