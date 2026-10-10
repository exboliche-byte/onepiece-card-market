import fs from "node:fs";
const cards=JSON.parse(fs.readFileSync(new URL("../data/cards.json",import.meta.url),"utf8"));
const market=JSON.parse(fs.readFileSync(new URL("../data/cardmarket-prices.json",import.meta.url),"utf8"));
const prices=market.cards||{};
const groups={noRecord:0,missingPrice:0,missingLink:0,unlinkedAndUnpriced:0,linkedButUnpriced:0,unpricedWithProductId:0,unknownZero:0,badProductUrl:0,baseMissingPrice:0,variantMissingPrice:0};
const samples={noRecord:[],missingPrice:[],missingLink:[],badProductUrl:[]};
const sample=(key,id)=>{if(samples[key].length<3)samples[key].push(id)};
for(const card of cards){
 const id=String(card.id),v=prices[id];
 if(!v){groups.noRecord++;sample("noRecord",id)}
 const validPrice=Number.isFinite(Number(v?.eur))&&Number(v?.eur)>0;
 const validLink=/^https:\/\/www\.cardmarket\.com\//i.test(String(v?.url||""));
 if(!validPrice){groups.missingPrice++;sample("missingPrice",id);if(/_(?:p|r|c)\d+$/i.test(id))groups.variantMissingPrice++;else groups.baseMissingPrice++;}
 if(!validLink){groups.missingLink++;sample("missingLink",id)}
 if(!validPrice&&!validLink)groups.unlinkedAndUnpriced++;
 if(!validPrice&&validLink)groups.linkedButUnpriced++;
 if(!validPrice&&Number(v?.cardmarketId)>0)groups.unpricedWithProductId++;
 if(v?.eur===0)groups.unknownZero++;
 const productInUrl=String(v?.url||"").match(/[?&]idProduct=(\d+)/);
 if(productInUrl&&Number(v.cardmarketId)>0&&Number(productInUrl[1])!==Number(v.cardmarketId)){groups.badProductUrl++;sample("badProductUrl",id)}
}
console.log("CARDMARKET_PRINT_COVERAGE "+JSON.stringify({asOf:market.updatedAt||null,prints:cards.length,...groups,samples}));
