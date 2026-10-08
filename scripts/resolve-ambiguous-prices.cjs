"use strict";
const cardBase=id=>String(id||"").replace(/_[prc]\d+$/i,"");
const exactUrl=url=>String(url||"").trim().replace("/en/OnePiece/","/es/OnePiece/");
const meaningfulPrice=n=>Number.isFinite(Number(n))&&Number(n)>0;
function resolveAmbiguousPrintLinks(outputCards,catalogCards,exactPrintOracle){
  const source=new Map(catalogCards.map(c=>[String(c.id),c]));
  const byProduct=new Map();
  for(const [id,row] of Object.entries(outputCards)){
    if(row?.cardmarketId!=null&&Number(row.cardmarketId)>0){
      const key=String(row.cardmarketId);
      if(!byProduct.has(key))byProduct.set(key,[]);
      byProduct.get(key).push(id);
    }
  }
  const conflicts=new Set();
  for(const ids of byProduct.values())if(ids.length>1)ids.forEach(id=>conflicts.add(id));
  // Even a supposedly exact website link cannot be assigned to two print IDs
  // of the same logical card without further unique evidence.
  const byBaseUrl=new Map();
  for(const [id,row] of Object.entries(outputCards)){
    const link=exactUrl(row?.url);
    if(!link)continue;
    const key=cardBase(id)+"|"+link;
    if(!byBaseUrl.has(key))byBaseUrl.set(key,[]);
    byBaseUrl.get(key).push(id);
  }
  for(const ids of byBaseUrl.values())if(ids.length>1)ids.forEach(id=>conflicts.add(id));
  const uniqueOracleUrls=new Map();
  for(const [id,urls] of exactPrintOracle?.urlsByPrint||[]){
    const url=exactUrl(urls?.[0]);
    if(!url)continue;
    const key=cardBase(id)+"|"+url;
    uniqueOracleUrls.set(key,(uniqueOracleUrls.get(key)||0)+1);
  }
  for(const id of conflicts){
    const row=outputCards[id];if(!row)continue;
    const oracle=exactPrintOracle?.priceByPrint?.get(id);
    const oracleLink=exactUrl(exactPrintOracle?.urlsByPrint?.get(id)?.[0]);
    const verifiedLink=oracleLink&&uniqueOracleUrls.get(cardBase(id)+"|"+oracleLink)===1?oracleLink:null;
    row.eur=meaningfulPrice(oracle)?Number(oracle):null;
    row.trend=null;row.low=null;row.avg=null;row.avg1=null;row.avg7=null;row.avg30=null;
    row.url=verifiedLink;
    row.cardmarketId=null;row.expansionId=null;
    row.version=Number.isFinite(Number(row.version))?row.version:null;
    row.stalePrice=false;
    row.source=verifiedLink||row.eur!==null?"Exact-print independent oracle; unverified primary product withheld":"Ambiguous print mapping withheld";
    const card=source.get(id);
    if(card){row.expansion=String(card.set_name||card.source_set||card.set||"");row.printSet=String(card.source_set||card.set||"")}
  }
  // A second pass is essential: independently selected oracle URLs may
  // reintroduce the same Cardmarket link after resolving product conflicts.
  const finalLinks=new Map();
  for(const [id,row] of Object.entries(outputCards)){
    const link=exactUrl(row?.url);
    if(!link)continue;
    const key=cardBase(id)+"|"+link;
    if(!finalLinks.has(key))finalLinks.set(key,[]);
    finalLinks.get(key).push(id);
  }
  let finalAmbiguousURLs=0;
  for(const ids of finalLinks.values()){
    if(ids.length<2)continue;
    finalAmbiguousURLs++;
    for(const id of ids){
      const row=outputCards[id],oracle=exactPrintOracle?.priceByPrint?.get(id);
      row.eur=meaningfulPrice(oracle)?Number(oracle):null;
      row.trend=null;row.low=null;row.avg=null;row.avg1=null;row.avg7=null;row.avg30=null;
      row.cardmarketId=null;row.expansionId=null;row.url=null;row.stalePrice=false;
      row.source="Unverified shared product link withheld; exact oracle price only";
    }
  }
  return {ambiguousPrints:conflicts.size,ambiguousProducts:[...byProduct.values()].filter(ids=>ids.length>1).length,finalAmbiguousURLs};
}
module.exports={resolveAmbiguousPrintLinks};
