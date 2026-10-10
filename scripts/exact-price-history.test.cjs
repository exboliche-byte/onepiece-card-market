const {test}=require("node:test");
const assert=require("node:assert/strict");
const {trustedPreviousPrice}=require("./exact-price-history.cjs");

test("Historical price is retained only for the exact same Cardmarket product",()=>{
 const prior={cardmarketId:125,eur:9.75,source:"Cardmarket public English product catalog + daily price guide"};
 assert.equal(trustedPreviousPrice(prior,{productId:125}),9.75);
 assert.equal(trustedPreviousPrice(prior,{productId:126}),null);
 assert.equal(trustedPreviousPrice(prior,{productId:null}),null);
});
test("Unchanged exact Link from Limitless can safely reuse a previous verified price",()=>{
 const url="https://www.cardmarket.com/es/OnePiece/Products?idProduct=31";
 const prior={url,eur:3.4,source:"Limitless/Cardmarket exact-print mapping"};
 assert.equal(trustedPreviousPrice(prior,{exactUrl:url}),3.4);
 assert.equal(trustedPreviousPrice(prior,{exactUrl:url.replace("31","32")}),null);
 assert.equal(trustedPreviousPrice(prior,{exactUrl:""}),null);
});
test("Unknown and stale prices remain unknown, never zero",()=>{
 assert.equal(trustedPreviousPrice({cardmarketId:1,eur:0},{productId:1}),null);
 assert.equal(trustedPreviousPrice({cardmarketId:1,eur:null},{productId:1}),null);
 assert.equal(trustedPreviousPrice({cardmarketId:1,eur:9,stalePrice:true},{productId:1}),null);
 assert.equal(trustedPreviousPrice({cardmarketId:1,eur:9,source:"Automatic exact-print market summary fallback"},{productId:1}),null);
});
