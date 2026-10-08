"use strict";
/* Cardmarket and Limitless can format EUR as 1,234.56 or 1.234,56.
   Decide by the rightmost punctuation, which marks decimal position. */
function parseLimitlessPrice(value){
 const raw=String(value??"").trim().replace(/[^\d.,]/g,"");
 if(!raw||!/\d/.test(raw))return null;
 const commas=(raw.match(/,/g)||[]).length,dots=(raw.match(/\./g)||[]).length;
 let numeric=raw;
 if(commas&&dots){
   numeric=raw.lastIndexOf(",")>raw.lastIndexOf(".")
     ?raw.replace(/\./g,"").replace(",",".")
     :raw.replace(/,/g,"");
 }else if(commas||dots){
   const sep=commas?",":".",parts=raw.split(sep);
   if(parts.length>2){
     const last=parts.pop();
     numeric=parts.join("")+(last.length===2?"."+last:last);
   }else{
     const [major,minor]=parts;
     const thousands=minor.length===3&&major.length>=1&&major!=="0";
     numeric=thousands?major+minor:major+"."+minor;
   }
 }
 const n=Number(numeric);
 return Number.isFinite(n)&&n>0?n:null;
}
module.exports={parseLimitlessPrice};
