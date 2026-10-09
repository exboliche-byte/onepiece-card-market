// Independent, clearly separated metagame datasets; never pool simulator and tournament samples.
const TTL=60*60*1000, memory=new Map();
const trim=x=>String(x||"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
 .replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&")
 .replace(/&[a-z]+;|&#\d+;/gi," ").replace(/\s+/g," ").trim();
const toInt=x=>Number(String(x??"").replace(/[^\d]/g,""));
const idRe=/\b(?:OP|EB|ST|PRB)-?\d{2}-\d{3}\b/i;
export function extractOPlayMatchups(html){
 // Next.js flight contains OPlay's published per-leader matchup records.
 // Raw payloads have escaped JSON quotes; parsing bounded 'm' arrays avoids
 // execution of any embedded JavaScript or trusting visible link labels.
 if(typeof html!=="string")return [];
 const flat=html.replace(/\\\"/g,'"');
 const header=/"g":(\d+),"l":"((?:OP|ST|EB|PRB)\d{2}-\d{3})","m":\[/g;
 const rows=new Map();let hit;
 while((hit=header.exec(flat))!==null){
   let depth=0,end=-1;
   for(let i=header.lastIndex-1;i<Math.min(flat.length,header.lastIndex+200000);i++){
     if(flat[i]==="[")depth++;
     if(flat[i]==="]"&&!--depth){end=i+1;break}
   }
   if(end<0)continue;
   let matches;
   try{matches=JSON.parse(flat.slice(header.lastIndex-1,end))}catch{continue}
   if(!Array.isArray(matches))continue;
   const leader=hit[2];
   for(const x of matches){
     const opponent=String(x?.o||"").toUpperCase();
     const g=Number(x?.g),w=Number(x?.w);
     if(!/^(?:OP|ST|EB|PRB)\d{2}-\d{3}$/.test(opponent)||opponent===leader||
       !Number.isSafeInteger(g)||g<1||g>10000000||
       !Number.isSafeInteger(w)||w<0||w>g)continue;
     const key=leader+"|"+opponent,firstGames=Number(x?.gf),firstWins=Number(x?.wf);
     const firstValid=Number.isInteger(firstGames)&&firstGames>=0&&firstGames<=g&&
       Number.isInteger(firstWins)&&firstWins>=0&&firstWins<=Math.min(w,firstGames)&&
       w-firstWins<=g-firstGames;
     const first=firstValid&&firstGames>0?{wins:firstWins,losses:firstGames-firstWins,games:firstGames}:null;
     const second=firstValid&&g-firstGames>0?
       {wins:w-firstWins,losses:g-firstGames-(w-firstWins),games:g-firstGames}:null;
     const record={leader,opponent,wins:w,losses:g-w,games:g,first,second};
     if(!rows.has(key)||g>rows.get(key).games)rows.set(key,record);
   }
   header.lastIndex=end;
 }
 return [...rows.values()];
}
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
  // The page publishes first/second rate AND sample size in distinct table cells.
  // Reject mismatched sample sizes: they must partition this leader's matches.
  const first=percentage(pctCells[1]),second=percentage(pctCells[2]);
  const splitCount=cell=>{
    const suffix=String(cell||"").match(/%\s*(?:±[^\d]*[\d.,]+\s*)?([\d.,]+)\s*$/);
    return suffix?toInt(suffix[1]):null;
  };
  const a=splitCount(pctCells[1]),b=splitCount(pctCells[2]);
  const splitValid=Number.isInteger(a)&&Number.isInteger(b)&&a+b===games&&a>0&&b>0;
  const playerCount=Number(cells[wlIndex+1]?.replace(/[^\d]/g,""));
  seen.add(id);
  leaders.push({id,wins,losses,games,rate:Math.round(1000*score)/10,
    firstRate:splitValid?first:null,secondRate:splitValid?second:null,
    firstGames:splitValid?a:null,secondGames:splitValid?b:null,
    players:Number.isFinite(playerCount)?playerCount:null});
  if(leaders.length>=100)break;
 }
 const header=trim(html.slice(0,Math.min(html.length,25000)));
 const totalMatch=header.match(/([\d.,]+)\s+partidas\s+analizadas/i);
 const observed=totalMatch?toInt(totalMatch[1]):null;
 const dateMatch=header.match(/Actualizado\s+el\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i);
 return leaders.length?{leaders:leaders.sort((a,b)=>b.games-a.games),
  games:observed||Math.round(leaders.reduce((sum,l)=>sum+l.games,0)/2),
  measuredAt:dateMatch?.[1]||null,matchups:extractOPlayMatchups(html),kind:"simulator",
  sample:"Partidas de simulador; estadísticas publicadas de OPlayTCG"}:null;
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
