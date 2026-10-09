import {getLegalityRules,deckPlayable} from "./standard-legality.js";

// Read-only, on-demand adapter for publicly listed English-format tournament decklists.
// This is NOT an official API and does not access the site's private database.
// Keep requests small, cache them, and fail visibly if public access stops working.
const HOST="https://onepiecetopdecks.com";
const PAGES=[
 "/deck-list/english-op17-deck-list-the-worlds-strongest-warriors/",
 "/deck-list/english-op16-deck-list-the-time-of-battle/",
 "/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/",
 "/deck-list/english-op-14-eb-04-deck-list-the-azure-sea-seven/"
];
const TTL=60*60*1000, TIMEOUT=11000, MAX_HTML=6_000_000;
let cache={at:0,pages:[],errors:[]};
let inFlight=null;
const int=v=>Number.isFinite(Number(v))?Math.floor(Number(v)):0;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const codePattern=/^(?:(?:OP|ST|EB|PRB)\d{2}|P)-\d{3}$/i;
const normalizeCode=value=>String(value||"").trim().toUpperCase().replace(/_(?:P|R|C)\d+$/,"");
function unescapeHtml(s){
 return String(s||"").replace(/&(?:amp|#0*38|#x0*26);/gi,"&")
  .replace(/&quot;|&#0*34;/gi,'"').replace(/&#0*39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&nbsp;/gi," ");
}
function stripHtml(html){
 return unescapeHtml(String(html||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ")).trim();
}
export function parseDeckComposition(raw){
 const text=String(raw||"").trim().toUpperCase();
 const entries=text.split(/a/i).filter(Boolean);
 if(entries.length<2||entries.length>60)return null;
 const cards={};let leaderId="";
 for(let i=0;i<entries.length;i++){
  const m=entries[i].match(/^(\d{1,2})N((?:(?:OP|ST|EB|PRB)\d{2}|P)-\d{3})$/);
  if(!m)return null;
  const count=Number(m[1]),id=m[2];
  if(count<1||count>50)return null;
  if(i===0){if(count!==1)return null;leaderId=id}
  else cards[id]=(cards[id]||0)+count;
 }
 if(Object.values(cards).reduce((a,b)=>a+b,0)!==50)return null;
 return {leaderId,cards};
}
function dateOf(text){
 const value=String(text||"").trim();
 if(!/^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(value))return null;
 const [month,day,year]=value.split("/").map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return date.toISOString().slice(0,10);
}
function placement(raw){
 const text=String(raw||"").trim(),m=text.match(/(?:^|\s)(?:T|Top[ -]?)(\d+)|^(\d+)(?:st|nd|rd|th)?/i);
 return m?Number(m[1]||m[2]):0;
}
function recordOf(raw){
 const m=String(raw||"").match(/\((\d{1,2})\s*-\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\)/);
 return {wins:m?Number(m[1]):0,losses:m?Number(m[2]):0,ties:m&&m[3]?Number(m[3]):0};
}
function pageDeck(row,pageUrl){
 const deck=parseDeckComposition(row.dg);
 if(!deck)return null;
 const date=dateOf(row.date);
 if(!date)return null;
 const place=placement(row.pl);
 const record=recordOf(row.pl);
 // A number in parentheses at the end of "Host" is the published event size.
 const size=String(row.hs||"").match(/\((\d{2,5})\)\s*$/);
 const players=size?Number(size[1]):0;
 const sourceUrl=String(row.url||pageUrl);
 const quality=place===1?"Ganador":place>0&&place<=4?"Top 4":place>0&&place<=8?"Top 8":place>0&&place<=16?"Top 16":"Resultado publicado";
 return {
  id:"topdecks:"+date+":"+deck.leaderId+":"+String(row.au||"")+"_"+sourceUrl.length+"_"+row.dg.slice(-18),
  source:"One Piece Top Decks",sourceUrl,
  tournament:String(row.tn||"Torneo").slice(0,150)+(row.hs?" · "+String(row.hs).slice(0,150):""),
  date,players,placing:place,quality,
  player:String(row.au||"Jugador").slice(0,150),
  country:String(row.cn||"").slice(0,80),
  record,winRate:(record.wins+record.losses+record.ties)>0?(record.wins+record.ties*.5)/(record.wins+record.losses+record.ties):null,
  leaderId:deck.leaderId,leaderName:String(row.dn||deck.leaderId).slice(0,120),
  cards:deck.cards,mainCount:50
 };
}
function extractLinks(html,pageUrl){
 const rows=[],anchor=/<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1/gi;
 for(const m of String(html||"").matchAll(anchor)){
  const href=unescapeHtml(m[2]).replace(/\\u0026/gi,"&").replace(/\\\//g,"/");
  if(!href.includes("deckgen")||!href.includes("dg="))continue;
  try{
   const u=new URL(href,pageUrl);
   if(u.hostname!=="onepiecetopdecks.com"&&u.hostname!=="www.onepiecetopdecks.com")continue;
   if(!u.pathname.includes("/deckgen"))continue;
   const p=u.searchParams;
   rows.push({dg:p.get("dg"),au:p.get("au"),cn:p.get("cn"),date:p.get("date"),dn:p.get("dn"),hs:p.get("hs"),pl:p.get("pl"),tn:p.get("tn"),url:u.toString()});
  }catch{}
 }
 return rows;
}
function extractTableRows(html,pageUrl){
 const rows=[];
 for(const tr of String(html||"").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>stripHtml(m[1]));
  if(cells.length<11||!/^1n(?:OP|ST|EB|PRB)\d{2}-\d{3}/i.test(cells[0]))continue;
  rows.push({dg:cells[0],dn:cells[4],date:cells[5],cn:cells[6],au:cells[7],pl:cells[8],tn:cells[9],hs:cells[10],url:pageUrl});
 }
 return rows;
}
export function parseTopDecksPage(html,pageUrl){
 const out=[],seen=new Set();
 for(const raw of [...extractLinks(html,pageUrl),...extractTableRows(html,pageUrl)]){
  const key=[raw.dg,raw.au,raw.date,raw.pl].join("|");
  if(seen.has(key))continue;
  const parsed=pageDeck(raw,pageUrl);
  if(parsed){seen.add(key);out.push(parsed)}
 }
 return out;
}
async function fetchPage(path){
 const url=HOST+path,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT);
 try{
  const response=await fetch(url,{
   headers:{"accept":"text/html","user-agent":"MiAlbumOnePiece/1.0 (public decklist search; contact via MiAlbumOnePiece)"},
   redirect:"follow",cache:"no-store",signal:controller.signal
  });
  if(!response.ok)throw Error("HTTP "+response.status);
  const mime=response.headers.get("content-type")||"";
  if(!mime.toLowerCase().includes("text/html"))throw Error("Respuesta no es HTML público");
  const length=Number(response.headers.get("content-length")||0);
  if(length>MAX_HTML)throw Error("Página demasiado grande");
  const html=await response.text();
  if(html.length>MAX_HTML)throw Error("Página demasiado grande");
  const decks=parseTopDecksPage(html,url);
  if(!decks.length)throw Error("No se pudo interpretar ninguna lista pública");
  return decks;
 }finally{clearTimeout(timer)}
}
async function loadPublicPages(){
 if(cache.at&&Date.now()-cache.at<TTL&&cache.pages.length)return cache;
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  const settled=await Promise.all(PAGES.map(path=>fetchPage(path).then(decks=>({path,decks})).catch(error=>({path,error:String(error.message||error)}))));
  const pages=settled.filter(x=>x.decks),errors=settled.filter(x=>x.error);
  // Do not overwrite a previously usable cache with a temporary upstream failure.
  if(pages.length)cache={at:Date.now(),pages,errors};
  return pages.length?cache:{at:Date.now(),pages:cache.pages,errors};
 })().finally(()=>{inFlight=null});
 return inFlight;
}
function json(body,status=200){
 return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":status===200?"public, s-maxage=3600, stale-while-revalidate=3600":"no-store"}});
}
export default {
 async fetch(request){
  const url=new URL(request.url);
  if(url.searchParams.get("probe")==="1"){
   const response=await fetch(HOST+PAGES[1],{headers:{"user-agent":"Mozilla/5.0","accept":"text/html"}});
   const html=await response.text();
   const low=html.toLowerCase(),idx=low.indexOf("1nop");
   return json({status:response.status,contentType:response.headers.get("content-type"),length:html.length,
    title:html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||"",
    links:(html.match(/deckgen/gi)||[]).length,
    codes:(html.match(/1n(?:op|eb|st)\d{2}-\d{3}/gi)||[]).length,
    tr:(html.match(/<tr\b/gi)||[]).length,
    sample:idx>=0?html.slice(Math.max(0,idx-190),idx+650):html.slice(0,600)
   });
  }
  const leader=normalizeCode(url.searchParams.get("leader")||"all");
  const cardFilter=normalizeCode(url.searchParams.get("card")||"");
  if((leader!=="ALL"&&!codePattern.test(leader))||(cardFilter&&!codePattern.test(cardFilter)))
   return json({error:"Código de carta o líder no válido",results:[]},400);
  const days=clamp(int(url.searchParams.get("days"))||90,30,365);
  const limit=clamp(int(url.searchParams.get("limit"))||20,1,120);
  try{
   const [data,rules]=await Promise.all([loadPublicPages(),getLegalityRules()]);
   if(!data.pages.length)return json({
    source:"One Piece Top Decks",results:[],availableMatches:0,
    error:"No se ha podido establecer una conexión de lectura con las páginas públicas de One Piece Top Decks.",
    diagnostic:data.errors.map(x=>({page:x.path,error:x.error}))
   },503);
   const cutoff=Date.now()-days*86400000;
   const found=new Map();
   for(const page of data.pages){
    for(const deck of page.decks){
     if(Date.parse(deck.date)<cutoff||Date.parse(deck.date)>Date.now()+86400000)continue;
     if(leader!=="ALL"&&deck.leaderId!==leader)continue;
     if(cardFilter&&deck.leaderId!==cardFilter&&!Number(deck.cards[cardFilter]||0))continue;
     if(!deckPlayable(deck.leaderId,deck.cards,rules))continue;
     const key=[deck.leaderId,deck.date,deck.player,deck.tournament,Object.entries(deck.cards).sort().join(",")].join("|");
     if(!found.has(key))found.set(key,deck);
    }
   }
   const results=[...found.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||(a.placing||999)-(b.placing||999)).slice(0,limit);
   return json({source:"One Piece Top Decks",leader:leader.toLowerCase()==="all"?"all":leader,card:cardFilter||null,
    results,availableMatches:found.size,scannedEvents:data.pages.length,
    partial:!!data.errors.length,unavailablePages:data.errors.length,
    note:"Fuente comunitaria no oficial. Tamaño del torneo solo cuando se especifica en el sitio. No equivale a estadísticas del meta."});
  }catch(error){
   return json({source:"One Piece Top Decks",results:[],error:"No se puede consultar One Piece Top Decks en este momento."},503);
  }
 }
};
