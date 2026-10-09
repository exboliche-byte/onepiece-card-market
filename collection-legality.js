/* Official Standard legality for the European circuit: read-only presentation. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.OnePieceLegality=api;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const fallback={"schemaVersion":1,"region":"en-europe","updatedAt":"2026-10-09","sources":{"banned":"https://en.onepiece-cardgame.com/news/restriction.html","blocks":"https://en.onepiece-cardgame.com/news/blockicon-card.html"},"banned":["OP03-040","OP06-047","OP06-086","OP06-116","ST10-001"],"restricted":[],"bannedPairs":[["EB04-058","OP07-115"],["OP08-069","OP11-040"],["OP11-040","OP11-067"]],"blockExceptions":{"EB01-006":"X","EB02-061":"X","EB03-061":"X","EB04-044":"X","OP01-016":"X","OP01-120":"X","OP02-013":"X","OP03-122":"X","OP04-083":"X","OP05-069":"X","OP05-074":"X","OP05-119":"X","OP06-118":"X","OP06-119":"X","OP07-051":"X","OP08-118":"X","OP09-004":"X","OP09-051":"X","OP09-093":"X","OP09-118":"X","OP09-119":"X","OP10-119":"X","OP11-118":"X","OP12-118":"X","OP13-118":"X","OP13-119":"X","OP13-120":"X","OP14-119":"X","OP15-118":"X","OP16-063":"X","OP16-065":"X","OP16-073":"X","OP01-039":4,"OP01-055":4,"OP02-005":4,"OP02-068":4,"OP03-008":4,"OP03-044":4,"OP03-048":4,"OP03-072":4,"OP03-097":4,"OP04-016":4,"OP04-077":4,"OP04-096":4,"ST01-011":4,"ST02-007":4,"ST06-008":4},"scheduledBans":[{"id":"OP14-020","effectiveAt":"2026-10-12T00:00:00+02:00"}]};
 let rules=fallback,loading=null;
 const ID=/^(?:(?:OP|ST|EB|PRB)\d{2,3}-\d{3}|P-\d{3})$/;
 function baseId(id){return String(id||"").toUpperCase().replace(/__CSV_[A-Z0-9]+(?:_[A-Z]+)?$/,"").replace(/_(?:P\d+|R\d+|C\d+|JP\d+)$/,"")}
 function validate(d){
  return !!d&&d.schemaVersion===1&&d.region==="en-europe"&&
   Array.isArray(d.banned)&&d.banned.every(id=>ID.test(id))&&
   Array.isArray(d.restricted)&&d.restricted.every(id=>ID.test(id))&&
   Array.isArray(d.bannedPairs)&&d.bannedPairs.every(p=>Array.isArray(p)&&p.length===2&&p.every(id=>ID.test(id)))&&
   d.blockExceptions&&typeof d.blockExceptions==="object"&&!Array.isArray(d.blockExceptions)&&
   Object.entries(d.blockExceptions).every(([id,v])=>ID.test(id)&&(v==="X"||Number.isInteger(v)&&v>=1&&v<=99))&&
   Array.isArray(d.scheduledBans)&&d.scheduledBans.every(x=>ID.test(x?.id)&&Number.isFinite(Date.parse(x.effectiveAt)));
 }
 function useRules(d){if(!validate(d))return false;const changed=JSON.stringify(d)!==JSON.stringify(rules);rules=d;return changed}
 async function load(){
  if(loading)return loading;
  loading=(async()=>{
    // Latest validated GitHub rules are served by the API, without requiring a deploy
    // for each future ban/rotation update. The packaged snapshot is a fallback.
    for(const path of ["/api/legality","/data/legality.json"]){
      try{
        const res=await fetch(path,{cache:"no-store"});
        if(!res.ok)throw Error("Rules feed HTTP "+res.status);
        const payload=await res.json();
        if(!validate(payload))throw Error("Invalid rules payload");
        return useRules(payload);
      }catch(e){console.warn("Legality source unavailable: "+path,e)}
    }
    return false;
  })().finally(()=>{loading=null});
  return loading;
 }
 function block(c){const b=String(c?.block??"").trim().toUpperCase();return b==="X"?Infinity:/^[1-9]\d*$/.test(b)?Number(b):null}
 function minimumBlock(now=Date.now()){
  const fields=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Madrid",year:"numeric",month:"numeric"}).formatToParts(new Date(now)).filter(x=>x.type==="year"||x.type==="month").map(x=>[x.type,Number(x.value)]));
  return Math.max(1,fields.year-2024-(fields.month<4?1:0));
 }
 function buildPlayableIndex(cards){
  const blocks=new Map(),add=(id,b)=>{if(b!==null&&b!==undefined)blocks.set(id,Math.max(blocks.get(id)||0,b))};
  for(const [id,v] of Object.entries(rules.blockExceptions))add(id,v==="X"?Infinity:Number(v));
  for(const c of cards||[])add(baseId(c.id),block(c));
  return blocks;
 }
 function bannedIds(now=Date.now()){
  const set=new Set(rules.banned);
  for(const s of rules.scheduledBans)if(now>=Date.parse(s.effectiveAt))set.add(s.id);
  return [...set];
 }
 function restrictedIds(){return [...rules.restricted]}
 function bannedPairs(){return rules.bannedPairs.map(p=>[...p])}
 function status(c,index,now=Date.now()){
  const id=baseId(c?.id);
  if(bannedIds(now).includes(id))return "banned";
  const op=/^OP(\d{2})-\d{3}$/.exec(id);
  const guess=op?Math.floor((Number(op[1])-1)/4)+1:/^ST0[1-9]-\d{3}$/.test(id)?1:null;
  const b=index instanceof Map?index.get(id):index instanceof Set?(index.has(id)?Infinity:null):undefined;
  const effective=b??block(c)??guess;
  return effective!==null&&effective!==undefined&&effective<minimumBlock(now)?"rotated":null;
 }
 function info(){return {updatedAt:rules.updatedAt||null,minimumBlock:minimumBlock(),source:rules.sources?.banned||null}}
 return {baseId,load,useRules,validate,minimumBlock,buildPlayableIndex,status,bannedIds,bannedPairs,restrictedIds,info};
});
