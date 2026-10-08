"use strict";
const canonicalPrintSet=s=>{
 const value=String(s||"").trim().toUpperCase();
 if(["OP14","OP-14","OP14-EB04"].includes(value))return "OP14-EB04";
 if(["OP15","OP-15","OP15-EB04"].includes(value))return "OP15-EB04";
 return value.replace(/^(OP|EB|PRB|ST)-?(\d{2,3})$/,"$1-$2");
};
function protectCatalog(cards,packs,previousCards=[],previousPacks=[]){
 if(![cards,packs,previousCards,previousPacks].every(Array.isArray))throw Error("Catalog must be arrays");
 const byId=new Map();
 for(const card of cards){
   const id=String(card?.id||"").trim();
   if(!id||/\s/.test(id)||!card?.set)throw Error("Invalid card identity: "+id);
   if(byId.has(id))throw Error("Duplicate exact print: "+id);
   byId.set(id,card);
 }
 const packCodes=new Set();
 for(const pack of packs){
   const code=String(pack?.code||"").toUpperCase().trim();
   if(!code||packCodes.has(code))throw Error("Missing/duplicate pack code: "+code);
   packCodes.add(code);
 }
 const previous=new Map(previousCards.filter(x=>x?.id).map(x=>[String(x.id).trim(),x]));
 const missing=[...previous].filter(([id])=>!byId.has(id));
 // Limitless-verified image printings are intentionally absent from the two
 // underlying catalogs. Carry them forward without treating them as data loss.
 const missingFromUpstream=missing.filter(([,card])=>card.catalogSource!=="Limitless exact English print verified by image filename");
 if(previousCards.length>=100&&missingFromUpstream.length>Math.max(35,Math.floor(previous.size*.015)))
   throw Error("Catalog safety: upstream dropped "+missingFromUpstream.length+" known exact prints; old catalog remains active");
 for(const [id,prior] of previous){
   const current=byId.get(id);
   if(!current||!/_([prc]\d+)$/i.test(id))continue;
   const was=canonicalPrintSet(prior.source_set||prior.set),now=canonicalPrintSet(current.source_set||current.set);
   if(was&&now&&was!==now)throw Error("Exact print "+id+" changed printing from "+was+" to "+now);
 }
 for(const [id,old] of missing){const saved={...old,syncCarryForward:true};cards.push(saved);byId.set(id,saved)}
 const knownPacks=new Set(previousPacks.map(x=>String(x?.code||"").toUpperCase()));
 const newSets=packs.filter(x=>!knownPacks.has(String(x.code||"").toUpperCase())).map(x=>({code:x.code,name:x.name}));
 let preservedPacks=0;
 for(const pack of previousPacks){
   const code=String(pack?.code||"").toUpperCase();
   if(code&&!packCodes.has(code)){packs.push({...pack,syncCarryForward:true});packCodes.add(code);preservedPacks++}
 }
 return {preservedPrints:missing.length,preservedPacks,newSets};
}
module.exports={protectCatalog,canonicalPrintSet};
