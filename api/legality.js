/* Dynamic proxy for verified rules committed by GitHub Actions.
   Source is this project's public main branch, not an untrusted third party. */
const FEED="https://raw.githubusercontent.com/exboliche-byte/onepiece-card-market/main/data/legality.json";
const reply=(data,status=200,cache="no-store")=>Response.json(data,{status,headers:{"Cache-Control":cache}});
export default {
  async fetch(request){
    if(request.method!=="GET")return reply({error:"Method not allowed"},405);
    try{
      const response=await fetch(FEED,{signal:AbortSignal.timeout(10000),cache:"no-store",headers:{"Accept":"application/json"}});
      if(!response.ok)throw Error("GitHub source HTTP "+response.status);
      const rules=await response.json();
      if(rules?.schemaVersion!==1||rules?.region!=="en-europe"||
         !Array.isArray(rules.banned)||rules.banned.length>100||
         !Array.isArray(rules.bannedPairs)||
         !Array.isArray(rules.scheduledBans)||
         !rules.blockExceptions||typeof rules.blockExceptions!=="object"||
         Object.keys(rules.blockExceptions).length<20){
        throw Error("GitHub legality file has invalid structure");
      }
      return reply(rules,200,"public, max-age=0, s-maxage=1800, stale-while-revalidate=3600");
    }catch(e){
      console.error("Dynamic legality refresh failed:",String(e?.message||e));
      return reply({error:"Las reglas oficiales no están disponibles temporalmente"},503);
    }
  }
};
