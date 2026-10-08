"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {protectCatalog,canonicalPrintSet}=require("./catalog-guard.cjs");
const card=(id,set="OP-19")=>({id,set,source_set:set,name:id});
test("new sets and parallel prints keep distinct identities",()=>{
 const cards=[card("OP19-001"),card("OP19-001_p1")];
 const result=protectCatalog(cards,[{code:"OP-19",name:"Future expansion"}]);
 assert.deepEqual(cards.map(x=>x.id),["OP19-001","OP19-001_p1"]);
 assert.equal(result.newSets[0].code,"OP-19");
});
test("missing historical variants are retained when a source skips them",()=>{
 const cards=[card("OP19-001")],packs=[{code:"OP-19"}];
 const result=protectCatalog(cards,packs,[card("OP19-001"),card("OP19-001_p1")],packs);
 assert.equal(result.preservedPrints,1);
 assert.equal(cards[1].id,"OP19-001_p1");
});
test("duplicate prints are rejected",()=>{
 assert.throws(()=>protectCatalog([card("OP19-001"),card("OP19-001")],[{code:"OP-19"}]),/Duplicate/);
});
test("major upstream data loss is blocked",()=>{
 const old=Array.from({length:100},(_,i)=>card("OP19-"+String(i).padStart(3,"0")));
 assert.throws(()=>protectCatalog(old.slice(0,40),[{code:"OP-19"}],old,[{code:"OP-19"}]),/dropped/);
});
test("parallel printing cannot move between expansions",()=>{
 assert.throws(()=>protectCatalog([card("OP19-001_p1","OP-20")],[{code:"OP-20"}],[card("OP19-001_p1","OP-19")],[{code:"OP-19"}]),/Exact print/);
});
test("special OP14 and OP15 aliases remain compatible",()=>{
 assert.equal(canonicalPrintSet("OP14-EB04"),canonicalPrintSet("OP-14"));
 assert.equal(canonicalPrintSet("OP15"),canonicalPrintSet("OP-15"));
});
