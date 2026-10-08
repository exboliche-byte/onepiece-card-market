// Meta de torneos públicos One Piece. Limitless no proporciona quién salió primero.
const LIMITLESS_API_URL="https://play.limitlesstcg.com/api",cache=new Map(),TTL=20*60*1000;
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
  const path="/tournaments/"+encodeURIComponent(e.id);
  const [standings,pairings]=await Promise.all([get(path+"/standings"),get(path+"/pairings")]);
  return {standings,pairings};
}
function aggregate(entries){
  const leaders=new Map(),matchups=new Map();let games=0;
  function push(map,key,win){
    if(!map.has(key))map.set(key,{wins:0,losses:0,games:0});
    const row=map.get(key);row.games++;row[win?"wins":"losses"]++;
  }
  for(const entry of entries){
    const roster=new Map();
    for(const row of entry.standings){
      const id=cardId(row?.decklist?.leader);
      if(id&&row.player!=null)roster.set(String(row.player),id);
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
  const key=days+":"+format,previous=cache.get(key);
  if(previous&&Date.now()-previous.at<TTL&&q.get("refresh")!=="1")return respond(previous.value);
  try{
    const now=Date.now();
    const tournaments=(await get("/tournaments?game=OP&limit=500"))
      .filter(x=>x?.id&&Number(x.players)>=16&&Number.isFinite(Date.parse(x.date))&&Date.parse(x.date)>=now-days*86400000&&Date.parse(x.date)<=now+86400000)
      .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    const formats=[...new Set(tournaments.map(t=>String(t.format||"")).filter(Boolean))];
    const chosen=format==="all"?"all":format==="auto"?String(tournaments[0]?.format||""):format;
    const selected=tournaments.filter(x=>chosen==="all"||String(x.format||"")===chosen).slice(0,24);
    const collected=[];let consulted=0,partial=false,rateLimited=false;
    for(let i=0;i<selected.length;i+=4){
      const batch=await Promise.allSettled(selected.slice(i,i+4).map(eventData));
      for(const item of batch){
        consulted++;
        if(item.status==="fulfilled")collected.push(item.value);
        else {partial=true;if(item.reason?.rateLimited)rateLimited=true}
      }
      if(rateLimited)break;
    }
    const value={source:"Limitless",sourceUrl:"https://play.limitlesstcg.com",updatedAt:new Date().toISOString(),
      days,formatUsed:chosen||"unknown",formats,scannedEvents:consulted,includedEvents:collected.length,partial,rateLimited,
      firstSecondAvailable:false,...aggregate(collected)};
    cache.set(key,{at:Date.now(),value});
    if(cache.size>20)cache.delete(cache.keys().next().value);
    return respond(value);
  }catch(e){
    if(previous)return respond({...previous.value,stale:true,partial:true});
    return respond({error:"Limitless no está disponible.",games:0,leaders:[],matchups:[]},502);
  }
}};
