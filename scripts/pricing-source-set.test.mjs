import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("./update-cardmarket-prices.mjs",import.meta.url),"utf8");
const matching=source.match(/function sourceSetCode\(card\) \{[\s\S]*?\n\}/);
assert.ok(matching,"sourceSetCode function not found");
const baseId=id=>String(id||"").replace(/_[prc]\d+$/i,"");
const extractCardCode=id=>(String(id||"").match(/((?:OP|EB|ST|PRB)\d{2}|P)-\d{3}/)||[])[0];
const sourceSetCode=new Function("baseId","extractCardCode","return ("+matching[0]+");")(baseId,extractCardCode);
const fixture=(id,source_set)=>({id,source_set,set:source_set});
test("reprint products retain their actual printing set",()=>{
 assert.equal(sourceSetCode(fixture("ST01-002_r1","FAMILYDECKSET")),"FAMILYDECKSET");
 assert.equal(sourceSetCode(fixture("ST05-002_p2","LIMITEDPRODUCTCARD")),"LIMITEDPRODUCTCARD");
 assert.equal(sourceSetCode(fixture("OP13-043_p1","OTHER-PRODUCT-CARD")),"OTHER-PRODUCT-CARD");
});
test("promotional physical prints do not inherit the original booster edition",()=>{
 assert.equal(sourceSetCode(fixture("EB01-012_p2","PROMOTIONCARD")),"PROMOTIONCARD");
 assert.equal(sourceSetCode(fixture("P-030","PROMOTIONCARD")),"P");
});
test("ordinary and merged releases keep their independent set codes",()=>{
 assert.equal(sourceSetCode(fixture("OP06-043_p1","OP-06")),"OP-06");
 assert.equal(sourceSetCode(fixture("OP14-001","OP14-EB04")),"OP14-EB04");
});
