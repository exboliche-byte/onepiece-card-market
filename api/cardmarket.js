let productCache=null;
let priceCache=null;
let priceIndex=null;
let cacheAt=0;
const TTL=6*60*60*1000;

function rows(x){
  if(Array.isArray(x))return x;
  if(x&&Array.isArray(x.products))return x.products;
  if(x&&Array.isArray(x.priceGuides))return x.priceGuides;
  return x&&typeof x==="object"?Object.values(x):[];
}
function norm(v){return String(v??"").toUpperCase().replace(/\s+/g," ").trim()}
function baseId(id){return norm(id).replace(/_(?:P\d+|R\d+|C\d+)$/,"")}
function extractIds(v){
  const text=typeof v==="string"?v:JSON.stringify(v||"");
  return [...new Set((text.match(/(?:(?:OP|ST|EB)\d{2}-\d{3}|(?:PRB|P|EX|DON)[-_]\d{2,3})(?:_[A-Z0-9]+)?/gi)||[]).map(norm))];
}
function number(v){
  if(v===null||v===undefined||v==="")return NaN;
  const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:NaN;
}
function priceValue(g){return [g?.trend,g?.avg,g?.avg30,g?.avg7,g?.avg1,g?.low].map(number).find(Number.isFinite)}
function scoreProduct(p,wanted){
  const ids=extractIds(p),name=norm(p?.name||p?.enName||"");let score=0;
  for(const id of wanted){
    if(ids.includes(id))score=Math.max(score,100);
    if(baseId(id)===baseId(ids[0]||""))score=Math.max(score,70);
    if(name.includes(baseId(id)))score=Math.max(score,50);
    if(/_(P\d+|R\d+|C\d+)$/.test(id)&&/(PARALLEL|V\.\d+|ALT|REPRINT)/.test(name))score+=8;
  }
  return score;
}
function buildPriceIndex(){
  const guide=new Map();
  for(const x of priceCache||[]){const id=x?.idProduct??x?.productId??x?.id;if(id!=null)guide.set(String(id),x)}
  const exact=new Map();
  for(const p of productCache||[]){
    const pid=p?.idProduct??p?.productId??p?.id,g=pid!=null?guide.get(String(pid)):null,val=priceValue(g);
    if(!Number.isFinite(val))continue;
    const ids=extractIds(p);
    for(const id of ids){
      const score=scoreProduct(p,[id]),current=exact.get(id);
      if(!current||score>current.score)exact.set(id,{value:val,score});

    }
  }
  priceIndex={exact};
}
export default {
  async fetch(request){
    try{
      const url=new URL(request.url);
      const ids=[...new Set(String(url.searchParams.get("ids")||"").split(",").map(norm).filter(Boolean))].slice(0,600);
      if(!ids.length)return Response.json({prices:{},updatedAt:null,source:"Cardmarket public data"});
      const now=Date.now();
      if(!productCache||!priceCache||!priceIndex||now-cacheAt>TTL){
        const [pr,pg]=await Promise.all([
          fetch("https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json"),
          fetch("https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json")
        ]);
        if(!pr.ok||!pg.ok)throw new Error("Cardmarket feed unavailable");
        productCache=rows(await pr.json());priceCache=rows(await pg.json());cacheAt=now;buildPriceIndex();
      }
      const out={};
      for(const wantedId of ids){
        const hit=priceIndex.exact.get(wantedId)||priceIndex.exact.get(norm(wantedId));
        if(hit&&Number.isFinite(hit.value))out[wantedId]=hit.value;
      }
      return new Response(JSON.stringify({prices:out,updatedAt:new Date(cacheAt).toISOString(),source:"Cardmarket public data"}),{status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, s-maxage=21600, stale-while-revalidate=86400"}});
    }catch(e){return Response.json({prices:{},updatedAt:null,error:"Precio de referencia no disponible"},{status:502})}
  }
};