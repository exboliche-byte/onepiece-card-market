// Independent, clearly separated metagame datasets; never pool simulator and tournament samples.
const TTL=60*60*1000, memory=new Map();
const trim=x=>String(x||"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
 .replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&")
 .replace(/&[a-z]+;|&#\d+;/gi," ").replace(/\s+/g," ").trim();
const toInt=x=>Number(String(x??"").replace(/[^\d]/g,""));
const idRe=/\b(?:OP|EB|ST|PRB)-?\d{2}-\d{3}\b/i;
export function extractOPlayHtml(html){
 if(typeof html!=="string"||html.length<100)return null;
 const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)];
 const leaders=[],seen=new Set();
 for(const match of rows){
  const row=match[0],id=idRe.exec(trim(row))?.[0]?.toUpperCase()||"";
  if(!id||seen.has(id))continue;
  const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
    .map(m=>trim(m[1]));
  const winLoss=cells.map(cell=>cell.match(/^\s*(\d[\d .,]*)\s*[-–]\s*(\d[\d .,]*)\s*$/))
    .find(Boolean);
  if(!winLoss)continue;
  const wins=toInt(winLoss[1]),losses=toInt(winLoss[2]),games=wins+losses;
  if(!Number.isSafeInteger(games)||games<20||games>1e7)continue;
  const score=wins/games;
  if(score<0||score>1)continue;
  // Positions are isolated by the visible table labels, never borrowed from Limitless.
  const wlIndex=cells.findIndex(cell=>/^\s*\d[\d .,]*\s*[-–]\s*\d[\d .,]*\s*$/.test(cell));
  const pctCells=cells.slice(wlIndex+1).filter(cell=>/\d[\d.,]*\s*%/.test(cell));
  const percentage=cell=>{
    const val=Number(String(cell||"").match(/(\d+(?:[,.]\d+)?)\s*%/)?.[1]?.replace(",","."));
    return Number.isFinite(val)&&val>=0&&val<=100?val:null;
  };
  // First 'percent' after W-L is the overall rate; subsequent splits are 1st/2nd.
  // Missing splits stay null and are not inferred.
  const first=percentage(pctCells[1]),second=percentage(pctCells[2]);
  seen.add(id);
  leaders.push({id,wins,losses,games,rate:Math.round(1000*score)/10,
    firstRate:first,secondRate:second});
  if(leaders.length>=100)break;
 }
 return leaders.length?{leaders:leaders.sort((a,b)=>b.games-a.games),
  games:Math.round(leaders.reduce((sum,l)=>sum+l.games,0)/2),
  measuredAt:null,kind:"simulator",sample:"Partidas de simulador; estadísticas publicadas de OPlayTCG"}:null;
}
export function extractEverythingHtml(html){
 if(typeof html!=="string"||!html.includes("Meta"))return null;
 const clean=trim(html);
 const match=clean.match(/(\d[\d.,]*)\s+(?:eligible\s+)?lists?[^.]{0,90}(?:events?|torneos)/i);
 // This source is contextual if its live leader data is not exposed in server-rendered HTML.
 return {kind:"tournament-independent",sample:"Referencia externa a torneos y listas legales",
  lists:match?toInt(match[1]):null,leaders:[],games:null,measuredAt:null};
}
async function getHtml(url,timeout=13000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{headers:{"accept":"text/html","user-agent":"MiAlbumOnePiece/1.0 (public meta research)"},signal:controller.signal});
  if(!response.ok)throw Error("HTTP "+response.status);
  const length=Number(response.headers.get("content-length")||0);
  if(length>7e6)throw Error("HTML de origen demasiado grande");
  const html=await response.text();
  if(html.length>7e6)throw Error("Origen demasiado grande");
  return html;
 }finally{clearTimeout(timer)}
}
const SOURCES=[
 {id:"oplay",name:"OPlayTCG",url:"https://oplaytcg.com/es/meta-stats",kind:"simulator",extract:extractOPlayHtml},
 {id:"everything",name:"Everything OPTCG",url:"https://everythingoptcg.com/meta",kind:"tournament-independent",extract:extractEverythingHtml}
];
export default {async fetch(request){
 const url=new URL(request.url),refresh=url.searchParams.has("refresh");
 const cacheKey="independent";
 const cached=memory.get(cacheKey);
 if(!refresh&&cached&&Date.now()-cached.at<TTL)return json(cached.value);
 const results=await Promise.all(SOURCES.map(async source=>{
  try{
   const data=source.extract(await getHtml(source.url));
   if(!data)throw Error("No se encontró una tabla verificable");
   return {id:source.id,name:source.name,url:source.url,status:"ok",fetchedAt:new Date().toISOString(),...data};
  }catch(error){
   return {id:source.id,name:source.name,url:source.url,status:"unavailable",kind:source.kind,
     error:"Datos no verificables en esta consulta",leaders:[]};
  }
 }));
 const value={updatedAt:new Date().toISOString(),sources:results,
  note:"Muestras independientes: no se mezclan, suman ni promedian las tasas de distintos servicios."};
 if(results.some(r=>r.status==="ok"))memory.set(cacheKey,{at:Date.now(),value});
 else if(cached)return json({...cached.value,stale:true});
 return json(value);
}};
function json(value){return new Response(JSON.stringify(value),{
 status:200,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":"public, s-maxage=900, stale-while-revalidate=3600"}})}
