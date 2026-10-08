import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const cards=JSON.parse(fs.readFileSync(new URL("../data/cards.json",import.meta.url),"utf8"));
const packs=JSON.parse(fs.readFileSync(new URL("../data/packs.json",import.meta.url),"utf8"));
const feed=JSON.parse(fs.readFileSync(new URL("../data/cardmarket-prices.json",import.meta.url),"utf8"));
const manifest=JSON.parse(fs.readFileSync(new URL("../data/catalog-meta.json",import.meta.url),"utf8"));
const prices=feed.cards||{};
const key=s=>String(s||"").toUpperCase().replace(/[\s_-]/g,"").replace(/^OP14EB04$/,"OP14").replace(/^OP15EB04$/,"OP15");
test("every published card is a distinct exact printing",()=>{
 const ids=cards.map(c=>String(c.id||""));
 assert.equal(new Set(ids).size,ids.length,"Duplicate exact print ID");
 assert.equal(ids.filter(id=>id.length===0).length,0);
 assert.equal(cards.length,manifest.cardCount,"Manifest and cards differ");
});
test("new printings belong to known expansions (including OP14/15 aliases)",()=>{
 const existing=new Set(packs.map(p=>key(p.code)));
 const missing=cards.filter(c=>!existing.has(key(c.source_set||c.set)));
 assert.deepEqual(missing.map(c=>[c.id,c.source_set||c.set]).slice(0,8),[],"Unknown physical expansion");
});
test("price feed covers catalogue without silently changing print IDs",()=>{
 const ids=new Set(cards.map(c=>c.id)),priceIds=Object.keys(prices);
 assert.equal(priceIds.filter(id=>!ids.has(id)).length,0,"Orphan price rows");
 assert.equal(cards.filter(c=>!Object.hasOwn(prices,c.id)).length,0,"Missing exact-price metadata rows");
 assert.ok(feed.schemaVersion>=10,"Unexpected price feed format");
});
test("the existing price feed is numeric, positive or explicitly unavailable",()=>{
 for(const [id,p] of Object.entries(prices)){
   assert.ok(p&&typeof p==="object",id);
   assert.ok(p.eur===null||(typeof p.eur==="number"&&p.eur>0&&Number.isFinite(p.eur)),id+" invalid EUR");
   if(p.cardmarketId){
     const urlProductId=String(p.url||"").match(/[?&]idProduct=(\d+)/)?.[1];
     assert.equal(Number(urlProductId),Number(p.cardmarketId),id+" conflicting Cardmarket URL");
   }
 }
});
test("parallel and reprinted IDs retain their correct type",()=>{
 for(const card of cards){
   const id=card.id,p=prices[id];
   const derived=/_r\d+$/i.test(id)?"reprint":/_[pc]\d+$/i.test(id)?"parallel":"base";
   assert.equal(p.variantKind,derived,id+" print kind mismatch");
 }
});
