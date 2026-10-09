// One authoritative competitive metagame for Meta and Tournament Prep.
// Tournament and simulator results refer to different populations. Avoid raw
// sample-size pooling: simulator volume must not drown out tournament outcomes.
import tournamentApi from "./meta.js";
import externalApi from "./meta-comparison.js";
const cache=new Map(),TTL=15*60*1000;
const num=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
const round=x=>Math.round(x*10)/10;
const id=x=>String(x||"").trim().toUpperCase();
function grade(rate,games){
 if(games<20)return "—";
 const p=((rate/100)*Math.min(games,500)+12)/(Math.min(games,500)+24);
 return p>=.555?"S":p>=.52?"A":p>=.48?"B":p>=.445?"C":"D";
}
export function combineMetas(tournaments,simulator){
 const tourLeaders=Array.isArray(tournaments?.leaders)?tournaments.leaders:[];
 const simLeaders=Array.isArray(simulator?.leaders)?simulator.leaders:[];
 const leaders=new Map();
 for(const x of tourLeaders){
  const key=id(x.id),games=num(x.games);
  if(!key||!games)continue;
  leaders.set(key,{id:key,tournament:{wins:num(x.wins),losses:num(x.losses),games},simulator:null,
   firstRate:null,secondRate:null,firstGames:null,secondGames:null});
 }
 for(const x of simLeaders){
  const key=id(x.id),games=num(x.games);
  if(!key||!games)continue;
  if(!leaders.has(key))leaders.set(key,{id:key,tournament:null,simulator:null,
   firstRate:null,secondRate:null,firstGames:null,secondGames:null});
  const row=leaders.get(key);
  row.simulator={wins:num(x.wins),losses:num(x.losses),games};
  if(Number.isFinite(x.firstRate)&&Number.isFinite(x.secondRate)&&num(x.firstGames)>0&&num(x.secondGames)>0){
   row.firstRate=x.firstRate;row.secondRate=x.secondRate;
   row.firstGames=num(x.firstGames);row.secondGames=num(x.secondGames);
  }
 }
 const result=[...leaders.values()].map(row=>{
  const a=row.tournament,b=row.simulator,tourGames=a?.games||0,simGames=b?.games||0;
  // With both sources, mature tournament samples carry 60%, simulator 40%.
  // Small tournament samples ramp up gradually to avoid extreme early W/R.
  const tourWeight=a&&b?0.6*Math.min(1,tourGames/100):a?1:0;
  const simWeight=b&&a?1-tourWeight:b?1:0;
  const weightedRate=100*(tourWeight*(a?a.wins/a.games:0)+simWeight*(b?b.wins/b.games:0));
  const games=tourGames+simGames,wins=(a?.wins||0)+(b?.wins||0),losses=(a?.losses||0)+(b?.losses||0);
  return {...row,wins,losses,games,rate:round(weightedRate),tier:grade(weightedRate,games),
   tournamentWeight:round(100*tourWeight),simulatorWeight:round(100*simWeight),
   sourcesCount:Number(!!a)+Number(!!b),share:0};
 }).sort((a,b)=>b.games-a.games||a.id.localeCompare(b.id));
 const totalGames=num(tournaments?.games)+num(simulator?.games);
 const leaderTotal=result.reduce((sum,x)=>sum+x.games,0);
 for(const row of result)row.share=leaderTotal?round(100*row.games/leaderTotal):0;
 const matchups=(Array.isArray(tournaments?.matchups)?tournaments.matchups:[])
   .filter(x=>leaders.has(id(x.leader))&&leaders.has(id(x.opponent)))
   .map(x=>({...x,leader:id(x.leader),opponent:id(x.opponent),
     wins:num(x.wins),losses:num(x.losses),games:num(x.games),source:"tournaments"}));
 // Merge only actually observed per-leader pairings, not rates inferred from
 // global leader strength. Both sources retain their raw sample sizes.
 const pairingIndex=new Map(matchups.map(row=>[row.leader+"|"+row.opponent,row]));
 for(const row of matchups){
  row.tournament={wins:row.wins,losses:row.losses,games:row.games};
  row.simulator=null;
 }
 for(const x of Array.isArray(simulator?.matchups)?simulator.matchups:[]){
  const a=id(x.leader),b=id(x.opponent),g=num(x.games);
  if(!leaders.has(a)||!leaders.has(b)||!g||a===b)continue;
  const key=a+"|"+b,source={wins:num(x.wins),losses:num(x.losses),games:g};
  const prev=pairingIndex.get(key);
  if(prev){
   prev.simulator=source;
   prev.wins+=source.wins;prev.losses+=source.losses;prev.games+=g;
   prev.source="combined";
   if(x.first)prev.first=x.first;
   if(x.second)prev.second=x.second;
  }else{
   const item={leader:a,opponent:b,...source,rate:round(100*source.wins/g),
     tournament:null,simulator:source,source:"simulator",
     first:x.first||null,second:x.second||null};
   matchups.push(item);pairingIndex.set(key,item);
  }
 }
 for(const row of matchups){
  const a=row.tournament,b=row.simulator;
  if(a&&b){
   const tw=0.6*Math.min(1,a.games/30);
   row.rate=round(100*(tw*a.wins/a.games+(1-tw)*b.wins/b.games));
  }else row.rate=round(100*row.wins/row.games);
 }
 return {
  source:"Unified",updatedAt:new Date().toISOString(),days:tournaments?.days||90,
  formatUsed:tournaments?.formatUsed||"—",formats:tournaments?.formats||[],
  games:totalGames,tournamentGames:num(tournaments?.games),simulatorGames:num(simulator?.games),
  eligibleEvents:num(tournaments?.eligibleEvents),scannedEvents:num(tournaments?.scannedEvents),
  includedEvents:num(tournaments?.includedEvents),pagesScanned:num(tournaments?.pagesScanned),
  partial:!!tournaments?.partial,truncated:!!tournaments?.truncated,rateLimited:!!tournaments?.rateLimited,
  coverageLimit:num(tournaments?.coverageLimit),sourcesAvailable:Number(tourLeaders.length>0)+Number(simLeaders.length>0),
  leaders:result,matchups,firstSecondAvailable:simLeaders.some(x=>num(x.firstGames)>0),
  methodology:"W/R global: 60% torneos y 40% simulador para líderes con muestra de al menos 100 resultados de torneos; la ponderación de torneos aumenta gradualmente si hay menos. No se inventan enfrentamientos ni órdenes de salida.",
  matchupSource:simulator?.matchups?.length?"Limitless + OPlayTCG (cruces reales)":"Limitless (sin cruces de OPlayTCG)",
  sources:{tournaments:{available:tourLeaders.length>0,events:num(tournaments?.includedEvents),games:num(tournaments?.games),
    date:tournaments?.updatedAt||null,partial:!!tournaments?.partial},
   simulator:{available:simLeaders.length>0,games:num(simulator?.games),date:simulator?.measuredAt||null,
    leaders:simLeaders.length}}
 };
}
const respond=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":status===200?"public, s-maxage=900, stale-while-revalidate=3600":"no-store"}});
export default {async fetch(request){
 const q=new URL(request.url).searchParams,days=String(q.get("days")||90),format=String(q.get("format")||"auto");
 const key=days+":"+format+":"+(q.get("coverage")==="expanded"?"expanded":"standard");
 const previous=cache.get(key);
 if(q.get("refresh")!=="1"&&previous&&Date.now()-previous.at<TTL)return respond(previous.value);
 const query=new URLSearchParams({days,format,coverage:q.get("coverage")==="expanded"?"expanded":"standard"});
 if(q.get("refresh")==="1")query.set("refresh","1");
 const [tour,independent]=await Promise.allSettled([
   tournamentApi.fetch(new Request("https://local.invalid/api/meta?"+query)),
   externalApi.fetch(new Request("https://local.invalid/api/meta-comparison"))
 ]);
 const data=async(result)=>{
  if(result.status!=="fulfilled"||!result.value.ok)return null;
  try{return await result.value.json()}catch{return null}
 };
 const t=await data(tour),e=await data(independent);
 const sim=e?.sources?.find(s=>s.id==="oplay"&&s.status==="ok"&&Array.isArray(s.leaders)&&s.leaders.length)||null;
 if(!Array.isArray(t?.leaders)&&!sim){
  if(previous)return respond({...previous.value,stale:true,partial:true});
  return respond({error:"Las fuentes del Meta no están disponibles."},502);
 }
 const v=combineMetas(t,sim);
 if(t?.leaders?.length&&sim?.leaders?.length)cache.set(key,{at:Date.now(),value:v});
 else if(previous)return respond({...previous.value,stale:true,partial:true});
 return respond(v);
}};
