const LIMITLESS_API="https://play.limitlesstcg.com/api";
const GAME="OP";
const INDEX_LIMIT=500;
const INDEX_TTL=15*60*1000;
const STANDINGS_TTL=6*60*60*1000;
const MAX_EVENTS=24;
const BATCH=4;

let indexCache={at:0,data:null};
const standingsCache=new Map();

function int(v){
  const n=parseInt(v,10);
  return Number.isFinite(n)?n:0;
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function cardIdOf(card){
  if(!card||typeof card!=="object")return "";
  let set=String(card.set||"").trim().toUpperCase().replace(/-+$/,"");
  let number=String(card.number||"").trim().toUpperCase();
  if(!set||!number)return "";
  if(/^\d+$/.test(number))number=number.padStart(3,"0");
  return set+"-"+number;
}
function normalizeLeader(v){
  return String(v||"").trim().toUpperCase().replace(/_/g,"-");
}
async function apiGet(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(LIMITLESS_API+path,{
      headers:{accept:"application/json","user-agent":"MiAlbumOnePiece/1.0"},
      cache:"no-store",
      signal:controller.signal
    });
    if(r.status===429){
      const e=new Error("Limitless rate limit");
      e.rateLimited=true;
      throw e;
    }
    if(!r.ok)throw new Error("Limitless "+r.status);
    return await r.json();
  }finally{
    clearTimeout(timer);
  }
}
async function tournamentIndex(){
  const now=Date.now();
  if(indexCache.data&&now-indexCache.at<INDEX_TTL)return indexCache.data;
  const data=await apiGet("/tournaments?game="+encodeURIComponent(GAME)+"&limit="+INDEX_LIMIT);
  if(!Array.isArray(data))throw new Error("Invalid tournament index");
  indexCache={at:now,data};
  return data;
}
async function tournamentStandings(id){
  const now=Date.now();
  const cached=standingsCache.get(id);
  if(cached&&now-cached.at<STANDINGS_TTL)return cached.data;
  const data=await apiGet("/tournaments/"+encodeURIComponent(id)+"/standings");
  const safe=Array.isArray(data)?data:[];
  standingsCache.set(id,{at:now,data:safe});
  if(standingsCache.size>120){
    const oldest=[...standingsCache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,30);
    for(const [key] of oldest)standingsCache.delete(key);
  }
  return safe;
}
function deckCards(decklist){
  const cards={};
  if(!decklist||typeof decklist!=="object")return cards;
  for(const group of ["character","event","stage"]){
    for(const item of Array.isArray(decklist[group])?decklist[group]:[]){
      const id=cardIdOf(item);
      if(!id)continue;
      const count=Math.max(1,int(item.count)||1);
      cards[id]=(cards[id]||0)+count;
    }
  }
  return cards;
}
function resultScore(event,row){
  const players=Math.max(1,int(event.players)||1);
  const placing=Math.max(1,int(row.placing)||players);
  const rec=row.record||{};
  const wins=int(rec.wins),losses=int(rec.losses),ties=int(rec.ties);
  const games=wins+losses+ties;
  const winRate=games?(wins+ties*0.5)/games:0;
  const finish=Math.max(0,1-(placing-1)/players);
  const field=Math.min(1,Math.log2(players+1)/10);
  const age=Math.max(0,Date.now()-Date.parse(event.date||0));
  const recency=Number.isFinite(age)?Math.max(0,1-age/(365*86400000)):0;
  return finish*55+winRate*25+field*12+recency*8+(placing===1?12:0);
}
function qualityLabel(placing,players){
  if(placing===1)return "Ganador";
  if(placing<=4)return "Top 4";
  if(placing<=8)return "Top 8";
  if(placing<=16)return "Top 16";
  if(players&&placing/players<=0.1)return "Top 10%";
  return "Buen resultado";
}
function toResult(event,row,leader){
  const decklist=row?.decklist;
  if(!decklist||typeof decklist!=="object")return null;
  const leaderId=cardIdOf(decklist.leader);
  if(leaderId!==leader)return null;
  const cards=deckCards(decklist);
  const mainCount=Object.values(cards).reduce((s,n)=>s+Number(n||0),0);
  if(mainCount<1)return null;
  const placing=Math.max(1,int(row.placing)||9999);
  const players=Math.max(0,int(event.players));
  const rec=row.record||{};
  const wins=int(rec.wins),losses=int(rec.losses),ties=int(rec.ties);
  const games=wins+losses+ties;
  const winRate=games?(wins+ties*0.5)/games:null;
  const playerId=String(row.player||"").trim();
  return {
    id:String(event.id)+":"+String(playerId||row.name||placing),
    source:"Limitless",
    sourceUrl:playerId
      ?"https://play.limitlesstcg.com/tournament/"+encodeURIComponent(event.id)+"/player/"+encodeURIComponent(playerId)+"/decklist"
      :"https://play.limitlesstcg.com/tournament/"+encodeURIComponent(event.id)+"/standings",
    tournamentId:String(event.id),
    tournament:String(event.name||"Torneo"),
    date:event.date||null,
    players,
    placing,
    quality:qualityLabel(placing,players),
    player:String(row.name||row.player||"Jugador"),
    country:String(row.country||""),
    record:{wins,losses,ties},
    winRate,
    leaderId,
    leaderName:String(row.deck?.name||decklist.leader?.name||leaderId),
    cards,
    mainCount,
    score:resultScore(event,row)
  };
}
function json(body,status=200,cache="public, s-maxage=1800, stale-while-revalidate=21600"){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":cache
    }
  });
}

export default {
  async fetch(request){
    try{
      const url=new URL(request.url);
      const leader=normalizeLeader(url.searchParams.get("leader"));
      if(!/^(?:[A-Z]{1,5}\d{0,2}|P)-\d{3}$/.test(leader)){
        return json({error:"Líder no válido",results:[]},400,"no-store");
      }
      const days=clamp(int(url.searchParams.get("days"))||90,30,365);
      const minPlayers=clamp(int(url.searchParams.get("minPlayers"))||32,4,512);
      const limit=clamp(int(url.searchParams.get("limit"))||20,1,30);
      const cutoff=Date.now()-days*86400000;
      const index=await tournamentIndex();
      const events=index
        .filter(t=>t&&t.id)
        .filter(t=>int(t.players)>=minPlayers)
        .filter(t=>{
          const when=Date.parse(t.date||"");
          return !Number.isFinite(when)||(when>=cutoff&&when<=Date.now()+6*60*60*1000);
        })
        .sort((a,b)=>{
          const playerDiff=int(b.players)-int(a.players);
          if(playerDiff)return playerDiff;
          return Date.parse(b.date||0)-Date.parse(a.date||0);
        })
        .slice(0,MAX_EVENTS);

      const found=[];
      let scanned=0,rateLimited=false;
      for(let i=0;i<events.length;i+=BATCH){
        const batch=events.slice(i,i+BATCH);
        const settled=await Promise.all(batch.map(async event=>{
          try{return {event,rows:await tournamentStandings(event.id)}}
          catch(e){
            if(e?.rateLimited)rateLimited=true;
            return {event,rows:[]};
          }
        }));
        for(const entry of settled){
          scanned++;
          for(const row of entry.rows){
            const result=toResult(entry.event,row,leader);
            if(result)found.push(result);
          }
        }
        if(rateLimited)break;
        if(found.length>=limit&&scanned>=12)break;
      }

      found.sort((a,b)=>b.score-a.score||a.placing-b.placing||b.players-a.players);
      const results=found.slice(0,limit).map(({score,...r})=>r);
      return json({
        leader,
        source:"Limitless",
        results,
        scannedEvents:scanned,
        availableMatches:found.length,
        rateLimited
      });
    }catch(e){
      return json({
        error:"No se pudieron consultar los mazos competitivos en este momento.",
        results:[]
      },502,"no-store");
    }
  }
};
