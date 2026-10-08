import fs from "node:fs";
const cards=JSON.parse(fs.readFileSync("data/cards.json","utf8"));
const packs=JSON.parse(fs.readFileSync("data/packs.json","utf8"));
const market=JSON.parse(fs.readFileSync("data/cardmarket-prices.json","utf8"));
const ids=new Map(cards.map(c=>[String(c.id),c]));
const counts={prints:cards.length,sets:packs.length,prices:0,links:0,withoutPrice:0,withoutImage:0,badImages:0,dupPictures:0};
const productLinks=new Map(),samePrintImage=new Map(),problems={missing:[],wrongPrintSet:[],badPrice:[],duplicateProduct:[],duplicateExactUrl:[],images:[],sourceGaps:[],disagree:[]};
const norm=v=>String(v||"").trim().toUpperCase().replace(/[\s_-]/g,"").replace(/^OP14EB04$/,"OP14").replace(/^OP15EB04$/,"OP15");
const known=new Set(packs.map(p=>norm(p.code)));
for(const card of cards){
 const id=String(card.id),p=market.cards?.[id],set=norm(card.source_set||card.set);
 if(!known.has(set))problems.wrongPrintSet.push(id+": "+set);
 if(!p){problems.missing.push(id);continue}
 if(p.eur!=null&&Number.isFinite(p.eur)&&p.eur>0)counts.prices++;else{counts.withoutPrice++;if(p.eur!=null)problems.badPrice.push(id)}
 if(p.url)counts.links++;
 const image=String(card.image||card.imageUrl||"").trim();
 if(!image){counts.withoutImage++;problems.images.push(id+" no image")}else if(!/^https?:\/\//i.test(image)){counts.badImages++;problems.images.push(id+" "+image)}
 if(image){
  const key=id.replace(/_[prc]\d+$/i,"")+"|"+image;
  if(samePrintImage.has(key))counts.dupPictures++;else samePrintImage.set(key,id);
 }
 if(p.cardmarketId){
  const pid=String(p.cardmarketId),prev=productLinks.get(pid);
  if(prev&&prev!==id)problems.duplicateProduct.push(pid+" "+prev+" "+id);
  else productLinks.set(pid,id);
 }
}
async function json(url){
 const response=await fetch(url,{headers:{"user-agent":"MiAlbumOnePiece audit/1.0","accept":"application/json"},signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error("HTTP "+response.status+" "+url);
 return response.json();
}
const raw="https://raw.githubusercontent.com/";
const upstreams=[
 ["primary",raw+"hugoprudente/optcgjson/main/output/AllSets.json"],
 ["secondary",raw+"michalkiral/optcg-data/main/data/index/cards_by_id.json"],
 ["referencePrices",raw+"michalkiral/optcg-data/main/data/prices/summary.json"]
];
const results=await Promise.all(upstreams.map(async ([name,url])=>{
 try{return {name,data:await json(url),status:"ok"}}catch(error){return {name,status:"failed",message:String(error?.message||error)}}
}));
const primary=results.find(x=>x.name==="primary"),secondary=results.find(x=>x.name==="secondary"),reference=results.find(x=>x.name==="referencePrices");
const primaryIds=new Set();
if(primary.status==="ok"){
 const root=primary.data?.data||primary.data;
 for(const payload of Object.values(root)){
  const set=payload?.data||payload;
  if(!Array.isArray(set?.cards))continue;
  for(const card of set.cards){
   const id=String(card?.id||"").trim();
   if(!id||/_jp\d+$/i.test(id))continue;
   if(Array.isArray(card.languages)&&card.languages.length&&!card.languages.some(lang=>String(lang).toLowerCase()==="english"))continue;
   primaryIds.add(id);
  }
 }
}
const secondaryIds=new Set();
if(secondary.status==="ok"){
 const list=Array.isArray(secondary.data)?secondary.data:Object.values(secondary.data||{});
 for(const card of list){
  const id=String(card?.id||"").trim();if(!id||/_jp\d+$/i.test(id))continue;
  secondaryIds.add(id);
 }
}
const complete=new Set([...primaryIds,...secondaryIds]);
for(const id of complete)if(!ids.has(id))problems.sourceGaps.push(id);
const referenceStamp=Date.parse(String(reference.data?.updatedAt||""));
const referenceFresh=Number.isFinite(referenceStamp)&&Date.now()-referenceStamp<3*86400000;
const prices=referenceFresh?(reference.data?.cards||{}):{};
if(!referenceFresh)console.warn("Historical/archived price comparison skipped; updatedAt=",reference.data?.updatedAt);
let disagreement=0,compared=0;
for(const [id,p] of Object.entries(market.cards||{})){
 const external=Number(prices[id]?.eur||0),actual=Number(p?.eur||0);
 if(external<=0||actual<=0)continue;
 compared++;
 const ratio=Math.max(external,actual)/Math.min(external,actual);
 if(ratio>4){disagreement++;if(problems.disagree.length<40)problems.disagree.push({id,market:actual,oracle:external,ratio:Number(ratio.toFixed(1))})}
}
console.log("FULL_AUDIT "+JSON.stringify({counts,source:{primary:primaryIds.size,secondary:secondaryIds.size,union:complete.size,local:ids.size,missing:problems.sourceGaps.length,upstreamStatuses:results.map(x=>({name:x.name,status:x.status,message:x.message||""}))},comparison:{compared,significantDisagreement:disagreement,referenceFresh,referenceUpdatedAt:reference.data?.updatedAt}}));
for(const [key,items] of Object.entries(problems))console.log("FULL_AUDIT_PROBLEM "+key+" count="+items.length+" samples="+JSON.stringify(items.slice(0,25)));
if(problems.sourceGaps.length>0)process.exitCode=2;
