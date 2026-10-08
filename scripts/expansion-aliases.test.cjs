"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {registerCatalogExpansionNames,registerProductExpansionNames}=require("./expansion-aliases.cjs");
test("new OP19 / OP20 expansion names are learned without editing code",()=>{
 const aliases={"OP-18":["Historic set"]};
 const changed=registerCatalogExpansionNames([{code:"OP-19",name:"Beyond the Grand Line"},{code:"OP20",name:"Future Horizons"}],aliases);
 assert.deepEqual([...changed],["OP-19","OP-20"]);
 assert.deepEqual(aliases["OP-19"],["Beyond the Grand Line"]);
 assert.deepEqual(aliases["OP-18"],["Historic set"]);
});
test("Cardmarket name is only learned with at least 20 matching printed products",()=>{
 const a={};const discovered=registerCatalogExpansionNames([{code:"OP-19",name:"Local title"}],a);
 const products=Array.from({length:25},(_,i)=>({idExpansion:99,name:"Card OP19-"+String(i).padStart(3,"0"),expansionName:"Overseas title"}));
 const index=new Map([["OP-19",99]]),names=new Map([[99,"Overseas title"]]);
 const getId=name=>(String(name).match(/OP19-\d{3}/)||[])[0];
 registerProductExpansionNames(discovered,products.slice(0,19),index,names,a,getId);
 assert.deepEqual(a["OP-19"],["Local title"]);
 registerProductExpansionNames(discovered,products,index,names,a,getId);
 assert.deepEqual(a["OP-19"],["Local title","Overseas title"]);
});
