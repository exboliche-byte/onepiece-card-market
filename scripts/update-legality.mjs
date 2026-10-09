import fs from "node:fs/promises";
import {pathToFileURL} from "node:url";

export const URLS={
 banned:"https://en.onepiece-cardgame.com/news/restriction.html",
 blocks:"https://en.onepiece-cardgame.com/news/blockicon-card.html"
};
const ID_RX=/\b(?:(?:OP|EB|ST|PRB)\d{2,3}-\d{3}|P-\d{3})\b/gi;
const HEADING=/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
const CARD_ID=/^(?:(?:OP|EB|ST|PRB)\d{2,3}-\d{3}|P-\d{3})$/;
function plain(s){
 return String(s||"").replace(/<!--[\s\S]*?-->/g,"")
  .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi,"")
  .replace(/<[^>]*>/g," ").replace(/&(?:nbsp|#160|#xa0);/gi," ")
  .replace(/&amp;/gi,"&").replace(/&(?:#(\d+)|#x([0-9a-f]+));/gi,(_,d,h)=>String.fromCodePoint(parseInt(d||h,h?16:10)))
  .replace(/\s+/g," ").trim();
}
function sections(html){
 const hs=[...html.matchAll(HEADING)].map(m=>({text:plain(m[2]),level:Number(m[1]),start:m.index,end:m.index+m[0].length}));
 return hs.map((h,i)=>{
  const next=hs.slice(i+1).find(c=>c.level<=h.level);
  return {...h,content:plain(html.slice(h.end,next?.start??html.length))};
 });
}
function ids(s){return [...new Set((s.match(ID_RX)||[]).map(id=>id.toUpperCase()))]}
function ensure(ok,reason){if(!ok)throw Error("Official legality parser: "+reason)}
const CIRCLED="⓪①②③④⑤⑥⑦⑧⑨⑩";
function numberOfBlock(s){
 const token=String(s).match(/(?:Block Number|Block Icon)\s*([⓪①②③④⑤⑥⑦⑧⑨⑩]|\d+)/i)?.[1];
 return !token?null:CIRCLED.includes(token)?CIRCLED.indexOf(token):Number(token);
}
export function parseBandai(bannedHtml,blocksHtml,previous){
 const banSections=sections(bannedHtml),blockSections=sections(blocksHtml);
 const last=pattern=>[...banSections].reverse().find(s=>pattern.test(s.text));
 const ban=last(/^Banned Cards$/i),restricted=last(/^Restricted Cards$/i),pair=last(/^Banned Pair Cards$/i);
 const x=blockSections.find(s=>/^Cards Generally Permitted in Standard Regulation$/i.test(s.text));
 const numeric=blockSections.filter(s=>/^Cards Eligible for Use Under Block Number/i.test(s.text));
 ensure(ban&&restricted&&pair&&x&&numeric.length,"expected Bandai sections missing");
 const banned=ids(ban.content).sort(),limited=ids(restricted.content).sort();
 const pairIds=(pair.content.match(ID_RX)||[]).map(id=>id.toUpperCase());
 ensure(banned.length||/there are currently no/i.test(ban.content),"missing ban list");
 ensure(limited.length||/there are currently no/i.test(restricted.content),"missing restricted list");
 ensure(pairIds.length||/there are currently no/i.test(pair.content),"missing banned pair list");
 ensure(pairIds.length%2===0&&pairIds.length<=100,"invalid banned pairs");
 const bannedPairs=[];
 for(let i=0;i<pairIds.length;i+=2)bannedPairs.push([pairIds[i],pairIds[i+1]].sort());
 bannedPairs.sort((a,b)=>a.join("|").localeCompare(b.join("|")));
 const xIds=ids(x.content);
 ensure(xIds.length>=8,"incomplete block X section");
 const exceptions=Object.fromEntries(xIds.map(id=>[id,"X"]));
 for(const group of numeric){
  const num=numberOfBlock(group.text),cards=ids(group.content);
  ensure(Number.isInteger(num)&&num>=2&&num<=20&&cards.length>=2,"unrecognized block exception section");
  for(const id of cards)if(exceptions[id]!=="X")exceptions[id]=Math.max(Number(exceptions[id]||0),num);
 }
 ensure(Object.keys(exceptions).length>=20,"incomplete exception list");
 const oldCount=Object.keys(previous?.blockExceptions||{}).length;
 ensure(!oldCount||Object.keys(exceptions).length>=Math.floor(oldCount*.65),"unexpected loss of exceptions");
 return {
  schemaVersion:1,region:"en-europe",updatedAt:previous?.updatedAt||new Date().toISOString().slice(0,10),
  sources:URLS,banned,restricted:limited,bannedPairs,
  blockExceptions:Object.fromEntries(Object.entries(exceptions).sort(([a],[b])=>a.localeCompare(b))),
  scheduledBans:(previous?.scheduledBans||[]).filter(s=>CARD_ID.test(s.id)&&!banned.includes(s.id))
 };
}
async function fetchOfficial(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{"User-Agent":"MiAlbumOnePiece-LegalitySync/1.0","Accept":"text/html"}});
 if(!r.ok)throw Error("Bandai "+r.status+" "+url);
 const html=await r.text();if(html.length<1000)throw Error("Official response unexpectedly short "+url);
 return html;
}
async function main(){
 const path=new URL("../data/legality.json",import.meta.url);
 const prev=JSON.parse(await fs.readFile(path,"utf8"));
 const html=await Promise.all([fetchOfficial(URLS.banned),fetchOfficial(URLS.blocks)]);
 const next=parseBandai(html[0],html[1],prev);
 const fingerprint=x=>JSON.stringify({...x,updatedAt:""});
 if(fingerprint(prev)===fingerprint(next)){console.log("Official rules unchanged");return}
 next.updatedAt=new Date().toISOString().slice(0,10);
 await fs.writeFile(path,JSON.stringify(next,null,2)+"\n");
 console.log("Official legality updated:",next.banned.length,"banned",next.bannedPairs.length,"pairs",Object.keys(next.blockExceptions).length,"exceptions");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exitCode=1});
