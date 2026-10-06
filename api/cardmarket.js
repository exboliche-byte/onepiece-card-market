let productCache=null;
let priceCache=null;
let cacheAt=0;
const TTL=6*60*60*1000;

function rows(x){
  if(Array.isArray(x))return x;
  if(x&&Array.isArray(x.products))return x.products;
  if(x&&Array.isArray(x.priceGuides))return x.priceGuides;
  return x&&typeof x==="object"?Object.values(x):[];
}
function norm(v){return String(v??"").toUpperCase().replace(/\s+/g," ").trim()}
function baseId(id){return norm(id).replace(/_(?:P\d+|R\d+)$/,"")}
function extractIds(v){
  const text=typeof v==="string"?v:JSON.stringify(v||"");
  return [...new Set((text.match(/(?:(?:OP|ST|EB)\d{2}-\d{3}|(?:PRB|P|EX|DON)[-_]\d{2,3})(?:_[A-Z0-9]+)?/gi)||[]).map(norm))];
}
function number(v){
  if(v===null||v===undefined||v==="")return NaN;
  const n=Number(String(v).replace(",","."));
  return Number.isFinite(n)?n:NaN;
}
function scoreProduct(p,wanted){
  const ids=extractIds(p);
  const name=norm(p?.name||p?.enName||"");
  let score=0;
  for(const id of wanted){
    if(ids.includes(id))score=Math.max(score,100);
    if(baseId(id)===baseId(ids[0]||""))score=Math.max(score,70);
    if(name.includes(baseId(id)))score=Math.max(score,50);
    if(/_(P\d+|R\d+)$/.test(id)&&/(PARALLEL|V\.\d+|ALT|REPRINT)/.test(name))score+=8;
  }
  return score;
}
export default {
  async fetch(request){
    try{
      const url=new URL(request.url);
      const ids=String(url.searchParams.get("ids")||"").split(",").map(norm).filter(Boolean).slice(0,120);
      if(!ids.length)return Response.json({prices:{},updatedAt:null,source:"Cardmarket public data"});
      const now=Date.now();
      if(!productCache||!priceCache||now-cacheAt>TTL){
        const [pr,pg]=await Promise.all([
          fetch("https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json"),
          fetch("https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json")
        ]);
        if(!pr.ok||!pg.ok)throw new Error("Cardmarket feed unavailable");
        productCache=rows(await pr.json());
        priceCache=rows(await pg.json());
        cacheAt=now;
      }
      const guide=new Map();
      for(const x of priceCache){
        const id=x?.idProduct??x?.productId??x?.id;
        if(id!=null)guide.set(String(id),x);
      }
      const out={};
      for(const wantedId of ids){
        const base=baseId(wantedId);
        let best=null,bestScore=-1;
        for(const p of productCache){
          const idsIn=extractIds(p);
          if(!idsIn.some(id=>id===wantedId||baseId(id)===base))continue;
          const pid=p?.idProduct??p?.productId??p?.id;
          const g=pid!=null?guide.get(String(pid)):null;
          if(!g)continue;
          const val=[g.trend,g.avg,g.avg30,g.priceTrend,g.average,g.low].map(number).find(Number.isFinite);
          if(!Number.isFinite(val))continue;
          const score=scoreProduct(p,[wantedId]);
          if(score>bestScore){bestScore=score;best=val;}
        }
        if(best!==null)out[wantedId]=best;
      }
      return new Response(JSON.stringify({prices:out,updatedAt:new Date(cacheAt).toISOString(),source:"Cardmarket public data"}),{
        status:200,
        headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, s-maxage=21600, stale-while-revalidate=86400"}
      });
    }catch(e){
      return Response.json({prices:{},updatedAt:null,error:"Precio de referencia no disponible"},{status:502});
    }
  }
};