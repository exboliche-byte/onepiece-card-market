import fs from "node:fs/promises";

const PROMOS_URL="https://onepiece.limitlesstcg.com/cards/promos";
const UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36";

async function fetchText(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch(url,{headers:{"user-agent":UA,"accept":"text/html,application/xhtml+xml","accept-language":"en-US,en;q=0.9","referer":"https://onepiece.limitlesstcg.com/cards"},signal:controller.signal,redirect:"follow"});
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return await r.text();
  }finally{clearTimeout(timer)}
}
function decode(v){return String(v||"").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"')}
function titleOf(html,fallback){
  const h=String(html||"");
  const m=h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decode(String(m?.[1]||fallback).replace(/<[^>]+>/g," ").replace(/\s+/g," ").replace(/\s+[–-]\s+Limitless One Piece.*$/i,"").trim())||fallback;
}
function productLinks(html){
  const out=new Set();
  const text=String(html||"");
  // Limitless has used absolute, root-relative and bare relative links over time.
  // Parse the route itself instead of depending on one HTML href shape.
  for(const m of text.matchAll(/(?:https?:\/\/onepiece\.limitlesstcg\.com)?\/?cards\/en\/([a-z0-9][a-z0-9-]+)/gi)){
    const slug=m[1];
    if(/^(?:P-\d{3}|(?:OP|ST|EB|PRB)\d{2}-\d{3})$/i.test(slug))continue;
    out.add("https://onepiece.limitlesstcg.com/cards/en/"+slug);
  }
  return [...out];
}
function exactImages(html){
  const out=new Map();
  const re=/https?:\/\/limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com\/one-piece\/[^"'<>\s]+\/((?:P-\d{3}|(?:OP|ST|EB|PRB)\d{2}-\d{3})(?:_(?:p|r|c)\d+)?)_EN\.webp/gi;
  for(const m of String(html||"").matchAll(re))out.set(m[1],m[0]);
  return out;
}
function baseId(id){return String(id||"").replace(/_(?:p|r|c)\d+$/i,"")}
function variantKind(id){return /_r\d+$/i.test(id)?"reprint":/_(?:p|c)\d+$/i.test(id)?"parallel":"base"}

async function main(){
  const path=new URL("../data/cards.json",import.meta.url);
  const cards=JSON.parse(await fs.readFile(path,"utf8"));
  if(!Array.isArray(cards)||!cards.length)throw new Error("Local card catalog is empty");

  let indexHtml;
  try{indexHtml=await fetchText(PROMOS_URL)}
  catch(error){
    console.warn("Limitless promo index unavailable; keeping existing catalog:",error?.message||error);
    return;
  }
  const links=productLinks(indexHtml);
  if(!links.length){
    const title=titleOf(indexHtml,"");
    const probe=indexHtml.toLowerCase().indexOf("welcome pack 2026 vol.1");
    const sample=probe>=0?indexHtml.slice(Math.max(0,probe-350),probe+550).replace(/\s+/g," "):indexHtml.slice(0,900).replace(/\s+/g," ");
    console.warn("Limitless promo index returned no product links; title=",title,"length=",indexHtml.length,"sample=",sample);
    return;
  }

  const pages=[];
  let cursor=0;
  async function worker(){
    while(true){
      const i=cursor++;if(i>=links.length)return;
      const url=links[i];
      try{
        const html=await fetchText(url);
        pages.push({url,title:titleOf(html,url.split("/").pop()),images:exactImages(html)});
      }catch(error){console.warn("Limitless promo page failed:",url,error?.message||error)}
    }
  }
  await Promise.all(Array.from({length:6},()=>worker()));

  const byId=new Map(cards.map(c=>[String(c?.id||"").toUpperCase(),c]));
  const baseMap=new Map();
  for(const c of cards){
    const base=baseId(c?.id).toUpperCase();
    if(!baseMap.has(base)||String(c?.id||"").toUpperCase()===base)baseMap.set(base,c);
  }

  const added=[];
  for(const page of pages){
    for(const [id,image] of page.images){
      const key=id.toUpperCase();
      if(byId.has(key))continue;
      const base=baseMap.get(baseId(id).toUpperCase());
      if(!base)continue;
      const copy={
        ...base,
        id,
        number:baseId(id),
        set:"PROMOTIONCARD",
        source_set:"PROMOTIONCARD",
        origin_set:String(base?.origin_set||base?.source_set||base?.set||""),
        set_name:page.title,
        pack_name:page.title,
        image,
        imageUrl:image,
        isParallel:variantKind(id)==="parallel",
        limitlessPrint:true
      };
      cards.push(copy);
      byId.set(key,copy);
      added.push({id,set_name:page.title});
    }
  }

  cards.sort((a,b)=>String(a?.id||"").localeCompare(String(b?.id||""),"en",{numeric:true}));
  if(added.length)await fs.writeFile(path,JSON.stringify(cards,null,2)+"\n","utf8");

  const op13043=cards.filter(c=>/^OP13-043(?:_|$)/i.test(String(c?.id||""))).map(c=>({id:c.id,set_name:c.set_name,image:c.image}));
  console.log(JSON.stringify({promoPages:pages.length,added:added.length,sampleAdded:added.slice(0,20),op13043}));
}
main().catch(error=>{console.error(error);process.exit(1)});
