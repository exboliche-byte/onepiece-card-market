import {getLegalityRules,cardPlayable,deckPlayable} from "./standard-legality.js";
// Meta de torneos públicos One Piece. Limitless no proporciona quién salió primero.
const LIMITLESS_API_URL="https://play.limitlesstcg.com/api",cache=new Map(),TTL=20*60*1000;
const eventCache=new Map(),EVENT_TTL=60*60*1000;
const bounded=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||a));
const cardId=c=>{
  const s=String(c?.set||"").trim().toUpperCase().replace(/-$/,""),n=String(c?.number||"").trim();
  if(!/^(OP|EB|ST|PRB)\d{2}$|^P$/.test(s)||!/^\d{1,3}$/.test(n))return "";
  return s+"-"+n.padStart(3,"0");
};
async function get(path){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
  try{
    const r=await fetch(LIMITLESS_API_URL+path,{headers:{accept:"application/json","user-agent":"MiAlbumOnePiece/1.0"},signal:ctrl.signal});
    if(r.status===429){const e=new Error("Limitless 429");e.rateLimited=true;throw e}
    if(!r.ok)throw Error("Limitless "+r.status);
    const x=await r.json();if(!Array.isArray(x))throw Error("Respuesta inesperada");
    return x;
  }finally{clearTimeout(timer)}
}
async function eventData(e){
  const key=String(e.id),cached=eventCache.get(key);
  if(cached&&Date.now()-cached.at<EVENT_TTL)return cached.value;
  const path="/tournaments/"+encodeURIComponent(e.id);
  const [standings,pairings]=await Promise.all([get(path+"/standings"),get(path+"/pairings")]);
  const value={standings,pairings};
  eventCache.set(key,{at:Date.now(),value});
  if(eventCache.size>250)eventCache.delete(eventCache.keys().next().value);
  return value;
}
function aggregate(entries,rules){
  const leaders=new Map(),matchups=new Map();let games=0;
  function push(map,key,win){
    if(!map.has(key))map.set(key,{wins:0,losses:0,games:0});
    const row=map.get(key);row.games++;row[win?"wins":"losses"]++;
  }
  for(const entry of entries){
    const roster=new Map();
    for(const row of entry.standings){
      const id=cardId(row?.decklist?.leader);
      if(!id||row.player==null||!cardPlayable(id,rules))continue;
      const list=row?.decklist;
      if(list&&["character","event","stage"].some(group=>Array.isArray(list[group]))){
        const cards={};
        for(const group of ["character","event","stage"]){
          for(const c of Array.isArray(list[group])?list[group]:[]){
            const cardNumber=cardId(c);
            if(cardNumber)cards[cardNumber]=(cards[cardNumber]||0)+Number(c.count||1);
          }
        }
        if(!deckPlayable(id,cards,rules))continue;
      }
      roster.set(String(row.player),id);
    }
    for(const match of entry.pairings){
      const a=String(match?.player1??""),b=String(match?.player2??""),winner=String(match?.winner??"");
      if(!a||!b||a===b||(winner!==a&&winner!==b))continue;
      const first=roster.get(a),second=roster.get(b);if(!first||!second)continue;
      games++;
      push(leaders,first,winner===a);push(leaders,second,winner===b);
      push(matchups,first+"|"+second,winner===a);push(matchups,second+"|"+first,winner===b);
    }
  }
  const pct=r=>r.games?Math.round(1000*r.wins/r.games)/10:null;
  const tier=r=>{
    if(r.games<20)return "—";
    const v=(r.wins+12)/(r.games+24);
    return v>=.555?"S":v>=.52?"A":v>=.48?"B":v>=.445?"C":"D";
  };
  return {games,
    leaders:[...leaders].map(([id,r])=>({id,...r,rate:pct(r),tier:tier(r),share:games?Math.round(500*r.games/games)/10:0})).sort((a,b)=>b.games-a.games),
    matchups:[...matchups].map(([pair,r])=>{const [leader,opponent]=pair.split("|");return {leader,opponent,...r,rate:pct(r),first:null,second:null}})
  };
}
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":status===200?"public, s-maxage=900, stale-while-revalidate=3600":"no-store"}});
export default {async fetch(request){
  const q=new URL(request.url).searchParams;
  const days=Math.round(bounded(q.get("days")||90,14,365)),format=String(q.get("format")||"auto").slice(0,60);
  const expanded=q.get("coverage")==="expanded";
  const key=days+":"+format+":"+(expanded?"expanded":"standard"),previous=cache.get(key);
  if(previous&&Date.now()-previous.at<TTL&&q.get("refresh")!=="1")return respond(previous.value);
  try{
    const now=Date.now();
    const rules=await getLegalityRules();
    const earliest=now-days*86400000;
    // Collect more event pages for the prep report; standard Meta stays lightweight.
    const events=[],maxPages=expanded?5:3;
    let pagesScanned=0,listingPartial=false;
    for(let page=1;page<=maxPages;page++){
      let batch;
      try{batch=await get("/tournaments?game=OP&limit=500&page="+page)}
      catch(e){if(page===1)throw e;listingPartial=true;break}
      pagesScanned++;
      events.push(...batch);
      if(batch.length<500||batch.some(x=>Number.isFinite(Date.parse(x?.date))&&Date.parse(x.date)<earliest))break;
    }
    const tournaments=events
      .filter(x=>x?.id&&Number(x.players)>=16&&Number.isFinite(Date.parse(x.date))&&Date.parse(x.date)>=earliest&&Date.parse(x.date)<=now+86400000)
      .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    const formats=[...new Set(tournaments.map(t=>String(t.format||"")).filter(Boolean))];
    // API events often omit format; choosing the first nonempty label picked
    // rare EXTRA events and excluded nearly the entire competitive field.
    const byFormat=new Map();
    for(const t of tournaments){
      const key=String(t.format||"");
      byFormat.set(key,(byFormat.get(key)||0)+1);
    }
    const dominant=[...byFormat].sort((a,b)=>b[1]-a[1])[0]?.[0]??"";
    const chosen=format==="all"?"all":format==="auto"?(dominant||"unknown"):format;
    const eligible=tournaments.filter(x=>chosen==="all"||
      String(x.format||"")=== (chosen==="unknown"?"":chosen));
    // A 24-event limit hid most of the 90-day field. Scan broadly but stop
    // safely when the upstream API rate-limits or the function approaches its deadline.
    const cap=expanded?140:100;
    const selected=eligible.slice(0,cap);
    const collected=[];let consulted=0,partial=listingPartial,rateLimited=false;
    const deadline=Date.now()+(expanded?48000:42000);
    for(let i=0;i<selected.length;i+=5){
      const batch=await Promise.allSettled(selected.slice(i,i+5).map(eventData));
      for(const item of batch){
        consulted++;
        if(item.status==="fulfilled")collected.push(item.value);
        else {partial=true;if(item.reason?.rateLimited)rateLimited=true}
      }
      if(rateLimited||Date.now()>deadline){partial=true;break}
    }
    const value={source:"Limitless",sourceUrl:"https://play.limitlesstcg.com",updatedAt:new Date().toISOString(),
      days,formatUsed:chosen||"unknown",formats,
      eligibleEvents:eligible.length,scannedEvents:consulted,includedEvents:collected.length,
      coverageLimit:cap,pagesScanned,listingPartial,
       coverageComplete:!partial&&!listingPartial&&eligible.length<=selected.length&&consulted===selected.length,
      truncated:eligible.length>selected.length||consulted<selected.length||listingPartial,
      partial,rateLimited,
      firstSecondAvailable:false,...aggregate(collected,rules)};
    cache.set(key,{at:Date.now(),value});
    if(cache.size>20)cache.delete(cache.keys().next().value);
    return respond(value);
  }catch(e){
    if(previous)return respond({...previous.value,stale:true,partial:true});
    return respond({error:"Limitless no está disponible.",games:0,leaders:[],matchups:[]},502);
  }
}};
