/* Shared current Standard (Europe) card-list eligibility for public meta/deck recommendations.
   It never writes to any user data. Latest verified Bandai JSON is stored in GitHub. */
import snapshot from "../data/legality.json" with {type:"json"};
const URL="https://raw.githubusercontent.com/exboliche-byte/onepiece-card-market/main/data/legality.json";
const ID=/^(?:(?:OP|ST|EB|PRB)\d{2,3}-\d{3}|P-\d{3})$/;
let cached={rules:snapshot,at:0};
const code=x=>String(x||"").toUpperCase().trim().replace(/__CSV_[A-Z0-9]+(?:_[A-Z]+)?$/,"").replace(/_(?:P|R|C|JP)\d+$/,"");
export function minimumBlock(now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Madrid",year:"numeric",month:"numeric"})
   .formatToParts(new Date(now)).filter(p=>p.type==="year"||p.type==="month").map(p=>[p.type,Number(p.value)]));
 return Math.max(1,parts.year-2024-(parts.month<4?1:0));
}
export async function getLegalityRules(){
 if(Date.now()-cached.at<30*60*1000)return cached.rules;
 cached.at=Date.now();
 try{
  const response=await fetch(URL,{headers:{accept:"application/json"},signal:AbortSignal.timeout(8000),cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  if(data?.region==="en-europe"&&data.schemaVersion===1&&Array.isArray(data.banned)&&
     Array.isArray(data.scheduledBans)&&Array.isArray(data.bannedPairs)&&
     Array.isArray(data.restricted)&&data.blockExceptions&&
     Object.keys(data.blockExceptions).length>=20&&data.banned.every(id=>ID.test(id))){
    cached.rules=data;
  }
 }catch{/* Keep the last validated data when GitHub is temporarily unavailable */}
 return cached.rules;
}
export function bannedNumbers(rules=snapshot,now=Date.now()){
 const banned=new Set(rules.banned||[]);
 for(const item of rules.scheduledBans||[])if(now>=Date.parse(item.effectiveAt))banned.add(item.id);
 return banned;
}
function inferredBlock(id){
 let m=/^OP(\d{2})-\d{3}$/.exec(id);
 if(m)return 1+Math.floor((Number(m[1])-1)/4);
 m=/^EB(\d{2})-\d{3}$/.exec(id);
 if(m)return Math.max(2,1+Number(m[1]));
 m=/^ST(\d{2})-\d{3}$/.exec(id);
 if(m){
  const number=Number(m[1]);
  return number<=9?1:number<=14?2:number<=20?3:4;
 }
 return null;
}
export function cardPlayable(cardId,rules=snapshot,now=Date.now()){
 const id=code(cardId);
 if(!ID.test(id)||bannedNumbers(rules,now).has(id))return false;
 const exception=rules.blockExceptions?.[id];
 const block=exception==="X"?Infinity:Number.isInteger(exception)?exception:inferredBlock(id);
 // Promotions without block metadata cannot safely be classified from an ID alone.
 // Do not discard valid new promos on an unsubstantiated guess.
 return block===null||block>=minimumBlock(now);
}
export function deckPlayable(leader,cards,rules=snapshot,now=Date.now()){
 if(!cardPlayable(leader,rules,now))return false;
 if(!cards||typeof cards!=="object"||Array.isArray(cards))return false;
 const chosen=new Set([code(leader)]);
 const copies=new Map();
 for(const [cardId,raw] of Object.entries(cards)){
  const amount=Number(raw);
  if(!Number.isInteger(amount)||amount<=0||!cardPlayable(cardId,rules,now))return false;
  const key=code(cardId);
  chosen.add(key);
  copies.set(key,(copies.get(key)||0)+amount);
 }
 const restricted=new Set(rules.restricted||[]);
 for(const [id,amount] of copies)if(amount>(restricted.has(id)?1:4))return false;
 return !(rules.bannedPairs||[]).some(pair=>pair.every(x=>chosen.has(x)));
}
export function sanitizeMeta(data,rules=snapshot,now=Date.now()){
 if(!data||typeof data!=="object")return data;
 const leaders=(Array.isArray(data.leaders)?data.leaders:[]).filter(x=>cardPlayable(x.id,rules,now));
 const allowed=new Set(leaders.map(x=>code(x.id)));
 const matchups=(Array.isArray(data.matchups)?data.matchups:[])
   .filter(x=>allowed.has(code(x.leader))&&allowed.has(code(x.opponent)));
 const games=leaders.reduce((sum,x)=>sum+Number(x.games||0),0)/2;
 return {...data,leaders,matchups,games:Math.round(games),filteredLegalStandard:true};
}
export const currentLegalitySnapshot=snapshot;
