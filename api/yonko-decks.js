import {getLegalityRules,deckPlayable} from "./standard-legality.js";

// Public HTML adapter: only /yonko/sets and /yonko/events pages are accessed.
// Panku's robots.txt allows these paths and disallows /api/; never request it.
// This is a bounded, cached search, not a copy of their underlying database.
const ORIGIN="https://www.pankurecords.com";
const INDEX_TTL=2*60*60*1000,EVENT_TTL=2*60*60*1000;
const MAX_EVENTS_PER_SEARCH=16,PARALLEL=4,HTML_LIMIT=3_800_000;
const indexes=new Map(),events=new Map();
const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function code(v){return String(v||"").trim().toUpperCase().replace(/_(?:P|R|C)\d+$/,"")}
function clamp(v,lo,hi,def){const n=Number(v);return Number.isInteger(n)&&n>=lo&&n<=hi?n:def}
function decode(v){return String(v||"").replace(/<!--[\s\S]*?-->/g,"").replace(/&(?:amp|#38);/g,"&").replace(/&(?:quot|#34);/g,'"').replace(/&#(?:39|x27);|&apos;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">")}
function plain(html){return decode(String(html||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ")).trim()}
function dateFromText(value){
 const m=String(value||"").match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
 if(!m)return null;
 const n=months[m[2].slice(0,3).toLowerCase()],dt=new Date(Date.UTC(+m[3],n,+m[1]));
 return dt.getUTCMonth()===n&&dt.getUTCDate()===+m[1]?dt.toISOString().slice(0,10):null;
}
function pageUrl(u,prefix){
 try{
  const uri=new URL(decode(u),ORIGIN);
  if(uri.origin!==ORIGIN||!uri.pathname.startsWith(prefix)||!/^[-/\w]+$/.test(uri.pathname))return null;
  return uri.pathname;
 }catch{return null}
}
async function fetchPublic(path,ttl,map){
 const now=Date.now(),cached=map.get(path);
 if(cached&&now-cached.at<ttl)return cached.value;
 if(cached?.pending)return cached.pending;
 const pending=(async()=>{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),11000);
  try{
   const response=await fetch(ORIGIN+path,{
    headers:{"accept":"text/html","user-agent":"MiAlbumOnePiece/1.0 (public read-only deck search; https://onepiece-card-market.vercel.app)"},
    redirect:"follow",signal:ctl.signal,cache:"no-store"
   });
   if(!response.ok)throw Error("Yonko HTTP "+response.status);
   if(!String(response.headers.get("content-type")||"").includes("text/html"))throw Error("Yonko no devolvió HTML");
   if(Number(response.headers.get("content-length")||0)>HTML_LIMIT)throw Error("HTML demasiado grande");
   const html=await response.text();
   if(html.length>HTML_LIMIT)throw Error("HTML demasiado grande");
   map.set(path,{at:Date.now(),value:html});
   if(map.size>100){const key=map.keys().next().value;map.delete(key)}
   return html;
  }finally{clearTimeout(timer)}
 })();
 map.set(path,{pending,at:now,value:cached?.value});
 try{return await pending}catch(e){
  if(cached?.value)return cached.value;
  map.delete(path);throw e
 }
}
export function parseIndex(html,format="en"){
 const found=[],seen=new Set();
 for(const m of String(html||"").matchAll(/<section\b([^>]*\bdata-yonko-kind="[^"]+"[^>]*)>([\s\S]*?)<\/section>/gi)){
  const attrs=m[1],chunk=m[2];
  const link=chunk.match(/<h3\b[^>]*>[\s\S]*?<a\b[^>]*href="([^"]*\/yonko\/events\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const path=link&&pageUrl(link[1],"/yonko/events/");
  if(!path||seen.has(path))continue;seen.add(path);
  const head=chunk.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||"";
  const kind=attrs.match(/\bdata-yonko-kind="([^"]+)"/)?.[1]||"";
  const region=attrs.match(/\bdata-yonko-play-region="([^"]+)"/)?.[1]||"";
  found.push({path,name:plain(link[2]),kind,region,
   major:/data-yonko-major="true"/i.test(attrs),date:dateFromText(plain(head)),
   leaderCodes:[...new Set([...chunk.matchAll(/\/yonko\/leaders\/((?:(?:op|st|eb|prb)\d{2}|p)-\d{3})/gi)].map(x=>code(x[1])))] ,format});
 }
 return found;
}
export function parseDeckText(raw){
 const parts=decode(raw).split(/\s+/).map(s=>s.trim()).filter(Boolean);
 if(parts.length<2||parts.length>51)return null;
 let leaderId="",cards={};
 for(let i=0;i<parts.length;i++){
  const m=parts[i].match(/^(\d{1,2})x((?:(?:OP|ST|EB|PRB)\d{2}|P)-\d{3})$/i);
  if(!m)return null;
  const n=Number(m[1]),id=code(m[2]);if(n<1||n>50)return null;
  if(i===0){if(n!==1)return null;leaderId=id}
  else cards[id]=(cards[id]||0)+n;
 }
 const total=Object.values(cards).reduce((a,b)=>a+b,0);
 return total===50?{leaderId,cards}:null;
}
function place(raw){
 const m=String(raw||"").match(/^(?:Top[\s-]*|T)(\d+)|^(\d+)(?:st|nd|rd|th)/i);
 return m?Number(m[1]||m[2]):0;
}
function record(raw){
 const m=String(raw||"").match(/\((\d{1,2})\s*-\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\)/);
 const wins=m?+m[1]:0,losses=m?+m[2]:0,ties=m&&m[3]?+m[3]:0;
 return {wins,losses,ties};
}
export function parseEvent(html,event){
 const out=[],sourcePath=event.path;
 for(const item of String(html||"").matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)){
  const section=item[1],textarea=section.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/i);
  const composition=textarea&&parseDeckText(textarea[1]);
  if(!composition)continue;
  const summary=section.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1]||"";
  const spans=[...summary.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(x=>plain(x[1]));
  const placingLabel=spans[0]||"Resultado publicado",player=spans[1]||"Jugador";
  const leaderName=spans[2]||composition.leaderId;
  const path=section.match(/href="(\/yonko\/decks\/[^"]+)"/)?.[1];
  const url=pageUrl(path,"/yonko/decks/")||sourcePath;
  const rec=record(placingLabel),matches=rec.wins+rec.losses+rec.ties;
  const placing=place(placingLabel);
  out.push({id:"yonko:"+url,source:"Yonko / One Piece Top Decks",
   sourceUrl:ORIGIN+url,tournament:String(event.name||"Torneo"),date:event.date,
   players:0,placing,quality:placing===1?"Ganador":placing>0&&placing<=4?"Top 4":placing>0&&placing<=8?"Top 8":placing>0&&placing<=16?"Top 16":placingLabel,
   player,country:event.region||"",record:rec,winRate:matches?(rec.wins+rec.ties*.5)/matches:null,
   leaderId:composition.leaderId,leaderName,cards:composition.cards,mainCount:50,
   format:event.format,kind:event.kind,major:event.major,region:event.region});
 }
 return out;
}
function unique(arr){const m=new Map();for(const value of arr)if(!m.has(value.path))m.set(value.path,value);return [...m.values()]}
function pickEvents(all,leader,offset){
 const cand=leader==="ALL"?all:all.filter(e=>e.leaderCodes.includes(leader));
 // Mix major and recent events instead of presenting only small local stores.
 const sorted=cand.slice().sort((a,b)=>{
  const recent=String(b.date||"").localeCompare(String(a.date||""));
  if(leader!=="ALL")return recent||Number(b.major)-Number(a.major);
  return Number(b.major)-Number(a.major)||recent;
 });
 // Source index already sorted by freshness. Interleave major and other sources.
 const majors=sorted.filter(e=>e.major),others=sorted.filter(e=>!e.major),mixed=[];
 while(majors.length||others.length){
  for(let i=0;i<2&&majors.length;i++)mixed.push(majors.shift());
  for(let i=0;i<2&&others.length;i++)mixed.push(others.shift());
 }
 return {chosen:mixed.slice(offset,offset+MAX_EVENTS_PER_SEARCH),allCount:mixed.length};
}
async function fetchBatch(chosen){
 const data=[];let errors=0;
 for(let i=0;i<chosen.length;i+=PARALLEL){
  const batch=await Promise.all(chosen.slice(i,i+PARALLEL).map(async e=>{
   try{return parseEvent(await fetchPublic(e.path,EVENT_TTL,events),e)}
   catch{return null}
  }));
  for(const decks of batch)if(decks)data.push(...decks);else errors++;
 }
 return {data,errors};
}
function json(body,status=200){
 return new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":status===200?"public, s-maxage=900, stale-while-revalidate=1800":"no-store"
 }});
}
export default {
 async fetch(request){
  const u=new URL(request.url),leader=code(u.searchParams.get("leader")||"all"),card=code(u.searchParams.get("card"));
  const format=u.searchParams.get("format")==="jp"?"jp":"en";
  const days=clamp(u.searchParams.get("days"),30,365,90),page=clamp(u.searchParams.get("page"),1,60,1);
  const limit=clamp(u.searchParams.get("limit"),1,200,120);
  if(leader!=="ALL"&&!/^(?:(?:OP|ST|EB|PRB)\d{2}|P)-\d{3}$/.test(leader)||
     card&&!/^(?:(?:OP|ST|EB|PRB)\d{2}|P)-\d{3}$/.test(card))
   return json({error:"Código de líder o carta inválido",results:[]},400);
  try{
   const sets=format==="jp"?["jp-op17","jp-op16","jp-op15"]:
    days<=90?["op17","op16"]:["op17","op16","op15","eb03"];
   const indexResults=await Promise.all(sets.map(async set=>{
    try{return parseIndex(await fetchPublic("/yonko/sets/"+set,INDEX_TTL,indexes),format)}
    catch{return []}
   }));
   const now=Date.now(),cutoff=now-days*86400000;
   const available=unique(indexResults.flat()).filter(e=>!e.date||
    Date.parse(e.date)>=cutoff&&Date.parse(e.date)<=now+86400000);
   if(!available.length)throw Error("No se pudo leer el índice público de Yonko.");
   const selection=pickEvents(available,leader,page===1?0:(page-1)*MAX_EVENTS_PER_SEARCH);
   const {data,errors}=await fetchBatch(selection.chosen);
   const rules=format==="en"?await getLegalityRules():null;
   const seen=new Set(),results=[];
   for(const result of data){
    if(leader!=="ALL"&&result.leaderId!==leader)continue;
    if(card&&result.leaderId!==card&&!Number(result.cards[card]||0))continue;
    if(format==="en"&&!deckPlayable(result.leaderId,result.cards,rules))continue;
    if(seen.has(result.id))continue;seen.add(result.id);
    results.push(result);
   }
   results.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||
    (a.placing||999)-(b.placing||999));
   return json({source:"Yonko / One Piece Top Decks",format,results:results.slice(0,limit),
    availableMatches:results.length,scannedEvents:selection.chosen.length-errors,
    availableEvents:selection.allCount,page,hasMore:page*MAX_EVENTS_PER_SEARCH<selection.allCount,
    partial:errors>0,errors});
  }catch(e){return json({error:"No se pudo acceder a las listas públicas de Yonko: "+String(e.message||"Error"),
   source:"Yonko / One Piece Top Decks",results:[]},502)}
 }
};
