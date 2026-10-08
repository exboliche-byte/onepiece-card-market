"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {resolveAmbiguousPrintLinks}=require("./resolve-ambiguous-prices.cjs");
test("never claim one Cardmarket product as two exact prints",()=>{
 const cards=[{id:"OP12-063_p2",source_set:"LIMITEDPRODUCTCARD"},{id:"OP12-063_p3",source_set:"LIMITEDPRODUCTCARD"}];
 const rows=Object.fromEntries(cards.map(c=>[c.id,{cardmarketId:842966,url:"https://www.cardmarket.com/es/OnePiece/Products?idProduct=842966",eur:13.3,trend:13.3}]));
 const outcome=resolveAmbiguousPrintLinks(rows,cards,{urlsByPrint:new Map(),priceByPrint:new Map()});
 assert.equal(outcome.ambiguousPrints,2);
 assert.equal(rows["OP12-063_p2"].eur,null);assert.equal(rows["OP12-063_p2"].url,null);
 assert.equal(rows["OP12-063_p3"].cardmarketId,null);
});
test("an independently verified exact price survives, but a shared URL does not",()=>{
 const cards=[{id:"P-030",source_set:"PROMOTIONCARD"},{id:"P-030_p2",source_set:"LIMITEDPRODUCTCARD"}];
 const url="https://www.cardmarket.com/es/OnePiece/Products/Singles/Promos/Jinbe-P-030";
 const rows=Object.fromEntries(cards.map(c=>[c.id,{cardmarketId:null,url,eur:0.67,source:"Unverified"}]));
 const oracle={urlsByPrint:new Map(cards.map(c=>[c.id,[url]])),priceByPrint:new Map([["P-030",0.67],["P-030_p2",2.12]])};
 resolveAmbiguousPrintLinks(rows,cards,oracle);
 assert.equal(rows["P-030_p2"].eur,2.12);
 assert.equal(rows["P-030_p2"].url,null);
});
test("uncontested exact print retains its assigned product",()=>{
 const cards=[{id:"OP19-001",source_set:"OP-19"},{id:"OP19-001_p1",source_set:"OP-19"}];
 const rows={"OP19-001":{cardmarketId:111,url:"https://www.cardmarket.com/es/OnePiece/Products?idProduct=111",eur:.1},"OP19-001_p1":{cardmarketId:222,url:"https://www.cardmarket.com/es/OnePiece/Products?idProduct=222",eur:5}};
 const result=resolveAmbiguousPrintLinks(rows,cards,{urlsByPrint:new Map(),priceByPrint:new Map()});
 assert.equal(result.ambiguousPrints,0);assert.equal(rows["OP19-001_p1"].eur,5);
});
