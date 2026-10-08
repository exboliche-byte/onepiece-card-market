"use strict";
// Identify future releases by catalogue codes and authoritative product evidence.
function registerCatalogExpansionNames(packs, aliases){
  const discovered=new Set();
  const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  for(const pack of packs){
    const raw=String(pack?.code||"").trim().toUpperCase(),match=raw.match(/^(OP|ST|EB|PRB)-?(\d{2,3})$/);
    if(!match)continue;
    const code=match[1]+"-"+match[2],name=String(pack?.name||"").trim();
    if(!name||normalize(name)===normalize(raw))continue;
    aliases[code]??=[];
    if(!aliases[code].some(existing=>normalize(existing)===normalize(name)))aliases[code].push(name);
    discovered.add(code);
  }
  return discovered;
}
function registerProductExpansionNames(discovered,products,primaryExpansionBySet,expansionNamesById,aliases,extractCardCode){
  const normalize=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  for(const code of discovered){
    const id=primaryExpansionBySet?.get(code);
    if(!Number.isFinite(Number(id)))continue;
    const compact=code.replace("-","");
    const evidence=products.filter(p=>Number(p.idExpansion)===Number(id)&&extractCardCode(p.name)?.startsWith(compact+"-"));
    if(evidence.length<20)continue;
    const name=String(expansionNamesById?.get(Number(id))||evidence[0]?.expansionName||"").trim();
    if(!name)continue;
    aliases[code]??=[];
    if(!aliases[code].some(x=>normalize(x)===normalize(name)))aliases[code].push(name);
  }
}
module.exports={registerCatalogExpansionNames,registerProductExpansionNames};
