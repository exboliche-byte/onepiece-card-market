import fs from "node:fs";
const cards=JSON.parse(fs.readFileSync("data/cards.json","utf8"));
const packs=JSON.parse(fs.readFileSync("data/packs.json","utf8"));
const data=JSON.parse(fs.readFileSync("data/cardmarket-prices.json","utf8"));
const prices=data.cards||{};
const sourceSet=x=>String(x?.source_set||x?.set||"").trim().toUpperCase().replace(/[-_\s]+/g,"");
const normalize=x=>String(x||"").trim().toUpperCase().replace(/[-_\s]+/g,"").replace(/^OP14EB04$/,"OP14").replace(/^OP15EB04$/,"OP15");
const pricesBySet=new Map();
const ids=new Map(),productIds=new Map(),baseUrls=new Map();
const problems={duplicates:[],unknownSet:[],printSetConflicts:[],badProductUrls:[],duplicateProductIds:[],parallelSameUrl:[],noPrice:[],noLink:[],negative:[],strayPrices:[],wrongVersionKind:[]};
const counts={cards:cards.length,packs:packs.length,prices:Object.keys(prices).length,priced:0,linked:0,exactProduct:0,variants:0,parallels:0,reprints:0,missingPrice:0,missingLink:0,missingCatalog:0};
const knownSetCodes=new Set(packs.map(p=>normalize(p.code)));
for(const card of cards){
 const id=String(card.id||"");
 if(ids.has(id))problems.duplicates.push(id);ids.set(id,card);
 const set=sourceSet(card),p=prices[id],meta=pricesBySet.get(set)||{total:0,priced:0,linked:0,links:0,prints:0};
 meta.total++;pricesBySet.set(set,meta);
 if(!knownSetCodes.has(set))problems.unknownSet.push(id+" "+set);
 if(!p||!Number.isFinite(Number(p.eur))||Number(p.eur)<=0){counts.missingPrice++;problems.noPrice.push(id+" "+set)}
 else{counts.priced++;meta.priced++}
 if(!p?.url){counts.missingLink++;problems.noLink.push(id)}
 else{counts.linked++;meta.linked++}
 if(!p){counts.missingCatalog++;continue}
 if((id.match(/_([prc]\d+)$/)||[]).length)counts.variants++;
 if(/_p\d+$/i.test(id))counts.parallels++;
 if(/_r\d+$/i.test(id))counts.reprints++;
 const kind=/_r\d+$/i.test(id)?"reprint":/_[pc]\d+$/i.test(id)?"parallel":"base";
 if(p.variantKind&&p.variantKind!==kind)problems.wrongVersionKind.push(id+" "+p.variantKind+"/"+kind);
 if(p.printSet && normalize(p.printSet)!==normalize(set))problems.printSetConflicts.push(id+" "+set+" -> "+p.printSet);
 if(Number(p.eur)<0)problems.negative.push(id);
 const link=String(p.url||""),productId=String(p.cardmarketId||"");
 const fromUrl=(link.match(/[?&]idProduct=(\d+)/)||[])[1];
 if(fromUrl){meta.links++;counts.exactProduct++}
 if(productId && fromUrl!==productId)problems.badProductUrls.push(id+" p="+productId+" url="+fromUrl);
 if(productId){const prior=productIds.get(productId);if(prior&&prior!==id)problems.duplicateProductIds.push(prior+" / "+id+" -> "+productId);else productIds.set(productId,id)}
 const base=id.replace(/_[prc]\d+$/i,"");
 if(base!==id&&link&&prices[base]?.url===link)problems.parallelSameUrl.push(base+" / "+id);
}
for(const id of Object.keys(prices))if(!ids.has(id))problems.strayPrices.push(id);
console.log("AUDIT_SUMMARY "+JSON.stringify({schema:data.schemaVersion,updatedAt:data.updatedAt,stats:data.stats,counts}));
console.log("AUDIT_SETS "+JSON.stringify([...pricesBySet].map(([set,o])=>({set,...o})).sort((a,b)=>a.set.localeCompare(b.set)).filter(x=>x.total>=10)));
for(const [k,v] of Object.entries(problems))console.log("AUDIT_PROBLEM "+k+" "+v.length+" sample="+JSON.stringify(v.slice(0,22)));

const sampleIds=["OP12-063_p2","OP12-063_p3","ST05-002_r1","ST05-002_p2","ST01-001_p1","ST01-002_r1","P-030","P-030_p2","P-072","P-072_c1","OP06-118_r1","OP13-043_p1","OP13-043_p2","OP13-043"];
for(const id of sampleIds){
 const card=ids.get(id),price=prices[id];console.log("AUDIT_DETAIL "+JSON.stringify({id,card:card&&{set:card.set,source_set:card.source_set,set_name:card.set_name,name:card.name,origin_set:card.origin_set},price:price&&{eur:price.eur,cardmarketId:price.cardmarketId,expansion:price.expansion,printSet:price.printSet,version:price.version,variantKind:price.variantKind,url:price.url,source:price.source}}))
}
