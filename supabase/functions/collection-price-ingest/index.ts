// Hosted Supabase Edge Function; service role is supplied only by the Supabase runtime.
// Deliberately not exposed to the browser. Vercel Cron presents a high-entropy bearer token.
const EXPECTED_SHA256="0faa98064f4daac631533fb341346f0e0bc80050e02fdcd5a802b43499fbf7a7";
const SOURCE="https://raw.githubusercontent.com/michalkiral/optcg-data/main/data/prices/summary.json";
const LIMIT=100000,CHUNK=300;
const send=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const parseId=x=>{const id=String(x||"").trim().toLowerCase();return /^(?:[a-z]{1,6}-?\d{1,3}-\d{3}|p-\d{3})(?:_(?:p|r|c|jp)\d+)?$/.test(id)?id:null};
async function authorized(request){
 const bearer=request.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return false;
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const actual=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
 return actual===EXPECTED_SHA256;
}
async function postRows(base,key,table,rows,onConflict){
 const r=await fetch(base+"/rest/v1/"+table+"?on_conflict="+onConflict,{
  method:"POST",
  headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json",prefer:"resolution=merge-duplicates,return=minimal"},
  body:JSON.stringify(rows),signal:AbortSignal.timeout(24000)
 });
 if(!r.ok)throw Error(table+" upsert failed ("+r.status+")");
}
Deno.serve(async request=>{
 if(request.method!=="POST")return send({error:"Method not allowed"},405);
 if(!await authorized(request))return send({error:"Unauthorized"},401);
 const url=String(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!/^https:\/\/[^/]+\.supabase\.co$/.test(url)||!key)return send({error:"Supabase writer unavailable"},503);
 try{
  const response=await fetch(SOURCE,{signal:AbortSignal.timeout(25000),headers:{"cache-control":"no-cache"}});
  if(!response.ok)throw Error("Price source "+response.status);
  const raw=await response.json();
  if(!raw?.cards||typeof raw.cards!=="object"||Array.isArray(raw.cards))throw Error("Invalid dataset");
  const updated=new Date(raw.updatedAt);
  if(!Number.isFinite(updated.getTime())||Date.now()-updated.getTime()>72*3600e3||updated.getTime()-Date.now()>6*3600e3)throw Error("Stale or invalid market data");
  const day=new Date().toISOString().slice(0,10);
  const unique=new Map();
  for(const [rawId,entry] of Object.entries(raw.cards)){
   const id=parseId(rawId),price=Number(entry?.eur);
   if(!id||entry?.eur==null||entry?.eur===""||!Number.isFinite(price)||price<=0||price>=1000000)continue;
   if(unique.has(id))continue;
   unique.set(id,{print_id:id,price_day:day,eur:Number(price.toFixed(4)),source_updated_at:updated.toISOString()});
   if(unique.size>LIMIT)throw Error("Unexpectedly large source");
  }
  const rows=[...unique.values()];
  if(rows.length<100)throw Error("Incomplete dataset");
  const marker={price_day:day,source_updated_at:updated.toISOString(),version_count:rows.length,complete:false,started_at:new Date().toISOString(),completed_at:null};
  await postRows(url,key,"price_history_ingestions",[marker],"price_day");
  for(let i=0;i<rows.length;i+=CHUNK*3){
   const slices=[];
   for(let j=i;j<Math.min(i+CHUNK*3,rows.length);j+=CHUNK)slices.push(postRows(url,key,"card_price_history",rows.slice(j,j+CHUNK),"print_id,price_day"));
   await Promise.all(slices);
  }
  await postRows(url,key,"price_history_ingestions",[{...marker,complete:true,completed_at:new Date().toISOString()}],"price_day");
  return send({ok:true,priceDay:day,versionCount:rows.length});
 }catch(error){console.error("Price history capture failed",error);return send({error:String(error?.message||error)},502)}
});
