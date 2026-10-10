/* Pure budget optimizer for currently legal Standard decks. Never writes to a collection. */
(function(root,factory){
"use strict";
const api=factory();
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root)root.WantsDeckOptimizer=api;
})(typeof window!=="undefined"?window:undefined,function(){
"use strict";
const printed=value=>{
 const str=String(value?.id||value||"").trim().toUpperCase();
 return str.match(/^((?:(?:OP|ST|EB|PRB)\d{2,3}|P)-\d{3})(?=$|[_-])/)?.[1]||"";
};
const quantity=n=>Number.isInteger(Number(n))&&Number(n)>0?Number(n):0;
function ownedTotals(owned){
 const totals=new Map();
 for(const [id,raw] of Object.entries(owned||{})){
  const k=printed(id),q=Math.max(0,Number(raw)||0);
  if(k&&Number.isFinite(q))totals.set(k,(totals.get(k)||0)+q);
 }
 return totals;
}
function bestPrices(cards,priceOf,isJapanese,cardmarketUrl){
 const result=new Map();
 for(const c of cards||[]){
  if(!c?.id||isJapanese?.(c))continue;
  const code=printed(c.id),price=Number(priceOf(c));
  if(!code||!Number.isFinite(price)||price<=0)continue;
  if(!result.has(code)||price<result.get(code).price){
   result.set(code,{code,id:c.id,name:String(c.name||code),price,url:String(cardmarketUrl?.(c)||"")});
  }
 }
 return result;
}
function prepare(decks,owned,prices,isLegal,alreadyBuilt=[]){
 const have=ownedTotals(owned),rows=[],seen=new Set();
 const excluded=new Set(Array.from(alreadyBuilt,printed).filter(Boolean));
 let illegal=0,unpriced=0,duplicates=0,alreadyBuiltCount=0;
 for(const d of decks||[]){
  const cards=d?.cards,leader=printed(d?.leaderId);
  if(d?.format==="jp"||!leader||!cards||typeof cards!=="object"||Array.isArray(cards)){illegal++;continue}
  if(excluded.has(leader)){alreadyBuiltCount++;continue}
  const amounts=new Map();let total=0,malformed=false;
  for(const [raw,n] of Object.entries(cards)){
   const code=printed(raw),q=quantity(n);
   if(!code||!q||q>4){malformed=true;break}
   amounts.set(code,(amounts.get(code)||0)+q);total+=q;
  }
  if(malformed||total!==50||[...amounts.values()].some(n=>n>4)||!isLegal(d)){illegal++;continue}
  const fingerprint=leader+"|"+[...amounts].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,n])=>k+":"+n).join(",");
  if(seen.has(fingerprint)){duplicates++;continue}seen.add(fingerprint);
  const needed=new Map();
  if((have.get(leader)||0)<1)needed.set(leader,1);
  for(const [code,n] of amounts){
   const q=Math.max(0,n-(have.get(code)||0));
   if(q)needed.set(code,Math.max(q,needed.get(code)||0));
  }
  let cost=0,missingPrice=0,copies=0;
  for(const [code,n] of needed){
   copies+=n;
   const info=prices.get(code);
   if(!info)missingPrice+=n;else cost+=info.price*n;
  }
  if(missingPrice)unpriced++;
  rows.push({deck:d,leader,needed,copies,cost,missingPrice,quality:Number(d.players)||0});
 }
 return {decks:rows,prices,stats:{received:(decks||[]).length,legal:rows.length,illegal,duplicates,unpriced,alreadyBuilt:alreadyBuiltCount}};
}
function covered(row,selected){
 for(const [code,n] of row.needed)if((selected.get(code)||0)<n)return false;
 return true;
}
function incremental(row,selected,prices){
 const added=new Map();let amount=0;
 for(const [code,n] of row.needed){
  const missing=Math.max(0,n-(selected.get(code)||0));
  if(missing){const p=prices.get(code);if(!p)return {cost:Infinity,added};added.set(code,missing);amount+=missing*p.price}
 }
 return {cost:Math.round(amount*100)/100,added};
}
function merged(selected,added){
 const next=new Map(selected);
 for(const [code,n] of added)next.set(code,(next.get(code)||0)+n);
 return next;
}
// Keep the cheapest currently-completable composition for each leader.
function bestPerLeader(rows){
 const byLeader=new Map();
 for(const row of rows){
  const previous=byLeader.get(row.leader);
  if(!previous||row.cost<previous.cost||
   (row.cost===previous.cost&&row.quality>previous.quality))byLeader.set(row.leader,row);
 }
 return [...byLeader.values()];
}
function optimize(prepared,budget){
 const input=Number(budget);
 const cap=Number.isFinite(input)?Math.min(10000,Math.max(0,input)):0;
 const rows=prepared?.decks||[],prices=prepared?.prices||new Map();
 const selected=new Map(),baseline=rows.filter(r=>covered(r,selected));
 const baselineLeaders=new Set(baseline.map(r=>r.leader));
 const candidates=rows.filter(r=>!r.missingPrice&&!baselineLeaders.has(r.leader));
 const currentlyUnlocked=new Set(baseline);
 let spent=0;
 // Recompute marginal cost after each purchase. Buying a copy once unlocks
 // every alternative deck that can reuse it, without buying it twice.
 for(let step=0;step<35;step++){
  const available=candidates.map(r=>({r,...incremental(r,selected,prices)}))
   .filter(x=>x.cost>0&&x.cost<=cap-spent+0.000001);
  if(!available.length)break;
  available.sort((a,b)=>a.cost-b.cost||b.r.quality-a.r.quality);
  // Evaluate every deck for marginal cost; expensive coverage scoring is
  // bounded to the cheapest alternatives plus each leader's best option.
  const shortlist=available.slice(0,90);
  const leaders=new Set(shortlist.map(x=>x.r.leader));
  for(const x of available){
   if(leaders.size>=200)break;
   if(!leaders.has(x.r.leader)){shortlist.push(x);leaders.add(x.r.leader)}
  }
  const alreadyLeaders=new Set([...currentlyUnlocked].map(row=>row.leader));
  let choice=null;
  for(const x of shortlist){
   const next=merged(selected,x.added),won=rows.filter(r=>!currentlyUnlocked.has(r)&&covered(r,next));
   const newLeaders=new Set(won.filter(r=>!alreadyLeaders.has(r.leader)).map(r=>r.leader)).size;
   if(!newLeaders)continue;
   const score=(newLeaders+newLeaders*1.4)/(x.cost+0.5);
   if(!choice||score>choice.score+0.000001||(Math.abs(score-choice.score)<0.000001&&x.cost<choice.cost))
    choice={...x,score};
  }
  if(!choice)break;
  spent=Math.round((spent+choice.cost)*100)/100;
  for(const [code,n] of choice.added)selected.set(code,(selected.get(code)||0)+n);
  for(const r of rows)if(covered(r,selected))currentlyUnlocked.add(r);
 }
 const purchases=[...selected].map(([code,qty])=>({...prices.get(code),qty,total:Math.round(qty*prices.get(code).price*100)/100}))
  .sort((a,b)=>b.total-a.total||a.code.localeCompare(b.code));
 const newlyUnlocked=bestPerLeader([...currentlyUnlocked].filter(r=>!baseline.includes(r)&&!baselineLeaders.has(r.leader)));
 const alreadyOwned=bestPerLeader(baseline);
 return {budget:cap,spent,purchases,baseline:alreadyOwned.length,baselineDecks:alreadyOwned.map(r=>r.deck),unlocked:newlyUnlocked.length,
  leaders:newlyUnlocked.length,results:newlyUnlocked.map(r=>r.deck),stillUnpriced:prepared.stats.unpriced,
  totalLegal:rows.length};
}
return {printed,ownedTotals,bestPrices,prepare,optimize};
});
