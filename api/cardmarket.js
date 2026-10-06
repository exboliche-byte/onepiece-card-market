let priceData=null;
let cacheAt=0;
const TTL=6*60*60*1000;
const SOURCE="https://raw.githubusercontent.com/michalkiral/optcg-data/main/data/prices/summary.json";

function norm(v){return String(v??"").trim().toLowerCase()}
function priceNumber(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
async function loadPrices(){
  const now=Date.now();
  if(priceData&&now-cacheAt<TTL)return;
  const r=await fetch(SOURCE,{cache:"no-store"});
  if(!r.ok)throw new Error("Price source unavailable");
  const data=await r.json();
  if(!data||!data.cards||typeof data.cards!=="object")throw new Error("Invalid price source");
  const cards=new Map();
  for(const [id,row] of Object.entries(data.cards)){
    const value=priceNumber(row?.eur);
    if(value!==null)cards.set(norm(id),value);
  }
  priceData={cards,updatedAt:data.updatedAt||null,source:data.source||"Cardmarket EUR"};
  cacheAt=now;
}
export default {
  async fetch(request){
    try{
      const url=new URL(request.url);
      const ids=[...new Set(String(url.searchParams.get("ids")||"").split(",").map(norm).filter(Boolean))].slice(0,600);
      if(!ids.length)return Response.json({prices:{},updatedAt:null,source:"Cardmarket EUR"});
      await loadPrices();
      const out={};
      for(const id of ids){
        const value=priceData.cards.get(id);
        if(value!==undefined)out[id]=value;
      }
      return new Response(JSON.stringify({
        prices:out,
        updatedAt:priceData.updatedAt,
        source:priceData.source
      }),{
        status:200,
        headers:{
          "content-type":"application/json; charset=utf-8",
          "cache-control":"public, s-maxage=21600, stale-while-revalidate=86400"
        }
      });
    }catch(e){
      return Response.json(
        {prices:{},updatedAt:null,error:"Precio de referencia no disponible"},
        {status:502}
      );
    }
  }
};
