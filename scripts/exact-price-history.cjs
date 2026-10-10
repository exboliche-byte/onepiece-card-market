"use strict";
// Never carry a previous price over merely because its catalog card ID matches.
const normalizeUrl=url=>String(url||"").trim().replace("/en/OnePiece/","/es/OnePiece/");
function trustedPreviousPrice(previous,{productId=null,exactUrl=null}={}){
 if(!previous||previous.stalePrice||/Automatic exact-print market summary fallback/i.test(String(previous.source||"")))return null;
 const product=Number(productId);
 const sameProduct=productId!==null&&productId!==undefined&&Number.isSafeInteger(product)&&product>0&&Number(previous.cardmarketId)===product;
 const url=normalizeUrl(exactUrl);
 const sameLink=!!url&&/^https:\/\/www\.cardmarket\.com\//i.test(url)&&normalizeUrl(previous.url)===url;
 if(!sameProduct&&!sameLink)return null;
 const value=Number(previous.eur);
 return Number.isFinite(value)&&value>0?value:null;
}
module.exports={trustedPreviousPrice};
