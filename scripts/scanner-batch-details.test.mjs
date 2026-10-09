import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const scanner=readFileSync(new URL("../scanner.js",import.meta.url),"utf8");
const start=scanner.indexOf("function batchOwnedText(card){");
const end=scanner.indexOf("async function updateBatchRowDetails(",start);
assert.ok(start!==-1&&end>start);
const original={"OP01-001":2,"OP01-001_p1":5};
const prices={"OP01-001":.35,"OP01-001_p1":14.9};
const helpers=runInNewContext(scanner.slice(start,end)+"\n({batchOwnedText,batchUnitPriceText})",{
 ownedCount:id=>original[id]||0,
 priceOf:card=>prices[card.id]??null,
 money:value=>Number(value).toFixed(2)+" €"
});
test("Continuous scan uses the number of already owned copies of the exact printing",()=>{
 assert.equal(helpers.batchOwnedText({id:"OP01-001"}),"Ya tienes: 2 copias");
 assert.equal(helpers.batchOwnedText({id:"OP01-001_p1"}),"Ya tienes: 5 copias");
 assert.equal(helpers.batchOwnedText({id:"OP03-090"}),"Ya tienes: 0 copias");
});
test("Each exact card printing has its own unit price, never sibling price",()=>{
 assert.equal(helpers.batchUnitPriceText({id:"OP01-001"}),"Precio por copia: 0.35 €");
 assert.equal(helpers.batchUnitPriceText({id:"OP01-001_p1"}),"Precio por copia: 14.90 €");
 assert.equal(helpers.batchUnitPriceText({id:"OP01-001_r1"}),"Precio por copia: no disponible");
});
test("Selecting a different printing updates both details without changing the scan quantity",()=>{
 assert.match(scanner,/scanBatchCardMeta/);
 assert.match(scanner,/scanBatchOwned/);
 assert.match(scanner,/scanBatchPrice/);
 assert.match(scanner,/if\(c\)void updateBatchRowDetails\(el,c\)/);
 assert.match(scanner,/ensurePrices\(\[card\.id\]\)/);
 assert.match(scanner,/scanBatchVariant"\)\?\.value!==card\.id/);
 assert.match(scanner,/refreshBatchOwnedCopies\(detail\.id\)/);
 assert.match(scanner,/A añadir <input class="scanBatchQty"/);
 assert.match(scanner,/batchSave\(\)/);
});
