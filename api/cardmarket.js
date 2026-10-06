let productCache=null;
let priceCache=null;
let cacheAt=0;
const TTL=60*60*1000;

function rows(x){return Array.isArray(x)?x:(x&&typeof x==="object"?Object.values(x):[])}
function cardIdsFrom(v){
  const out=[];
  const text=typeof v==="string"?v:JSON.stringify(v||"");
  const m=text.match(/(?:OP|ST|EB|PRB|P|EX|DON)[-_]\\d{2,3}(?:_[a-z0-9]+)?/gi)||[];
  for(const s of m)if(!out.includes(s.toUpperCase()))out.push(s.toUpperCase());
  return out;
}
function num(v){
  if(v===null||v===undefined||v==="")return NaN;
  const n=Number(String(v).replace(",","."));
  return Number.isFinite(n)?n:NaN;
}
export default async function handler(req,res){
  try{
    const ids=String(req.query?.ids||"").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
    const now=Date.now();
    if(!productCache||!priceCache||now-cacheAt>TTL){
      const [pr,pg]=await Promise.all([
        fetch("https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json"),
        fetch("https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json")
      ]);
      if(!pr.ok||!pg.ok)throw new Error("Cardmarket feed unavailable");
      productCache=rows(await pr.json());priceCache=rows(await pg.json());cacheAt=now;
    }
    const guide=new Map();
    for(const x of priceCache){
      const id=x?.idProduct??x?.productId??x?.id;
      if(id!=null)guide.set(String(id),x);
    }
    const want=new Set(ids),out={};
    for(const p of productCache){
      const matches=cardIdsFrom(p);
      let cid=null;for(const id of matches)if(want.has(id)){cid=id;break}
      if(!cid)continue;
      const pid=p?.idProduct??p?.productId??p?.id;
      const g=pid!=null?guide.get(String(pid)):null;
      if(!g)continue;
      const vals=[g.priceTrend,g.price_trend,g.trend,g.avg30,g.average,g.lowPrice,g.low,g.avg1,g.avg7];
      const val=vals.map(num).find(Number.isFinite);
      if(Number.isFinite(val))out[cid]=val;
    }
    res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({updatedAt:new Date(cacheAt).toISOString(),prices:out});
  }catch(e){
    res.status(503).json({error:"No se pudo obtener el precio de referencia de Cardmarket."});
  }
}