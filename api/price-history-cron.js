// Vercel scheduled GET endpoint. Only Vercel's CRON_SECRET can trigger writes.
export default {
  async fetch(request){
    const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
    if(request.method!=="GET")return json({error:"Method not allowed"},405);
    const secret=process.env.CRON_SECRET;
    if(!secret||request.headers.get("authorization")!=="Bearer "+secret)return json({error:"Unauthorized"},401);
    const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
    if(!url.startsWith("https://")||!url.endsWith(".supabase.co"))return json({error:"Supabase not configured"},503);
    try{
      const result=await fetch(url+"/functions/v1/collection-price-ingest",{method:"POST",headers:{authorization:"Bearer "+secret},signal:AbortSignal.timeout(120000)});
      const payload=await result.json().catch(()=>({error:"Invalid upstream response"}));
      return json(payload,result.status);
    }catch(error){return json({error:String(error?.message||error)},502)}
  }
};
