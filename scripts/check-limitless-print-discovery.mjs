import fs from "node:fs";
import assert from "node:assert/strict";
import parser from "./parse-market-price.cjs";
const script=fs.readFileSync(new URL("./update-cardmarket-prices.mjs",import.meta.url),"utf8");
const start=script.indexOf("function parseLimitlessPage(html, requestedUrl) {");
const end=script.indexOf("\nasync function loadLimitlessPrintMappings(",start);
if(start<0||end<0)throw Error("Limitless page parser missing");
const src=script.slice(start,end);
const parse=new Function("parseLimitlessPrice","return ("+src+")")(parser.parseLimitlessPrice);
const base="https://onepiece.limitlesstcg.com/cards/en/OP13-043";
async function get(url){
 const r=await fetch(url,{headers:{accept:"text/html","user-agent":"MiAlbumOnePiece print coverage test"},signal:AbortSignal.timeout(35000)});
 assert.ok(r.ok,"Limitless HTTP "+r.status);return parse(await r.text(),url);
}
const primary=await get(base);
console.log("LIMITLESS_AUDIT_BASE",JSON.stringify({id:primary.printId,versions:primary.versionLinks,eur:primary.eur,url:primary.cardmarketUrl}));
assert.ok(primary.versionLinks.length>=2,"The live page exposes two extra printings but parser found "+primary.versionLinks.length);
const others=await Promise.all(primary.versionLinks.filter(x=>x.version<=2).map(x=>get(x.url)));
for(const p of others)console.log("LIMITLESS_AUDIT_VARIANT",JSON.stringify({id:p.printId,eur:p.eur,expansion:p.expansion,image:p.imageUrl,url:p.cardmarketUrl}));
assert.ok(others.some(x=>x.printId==="OP13-043_p2"),"Missing verified p2 image ID");
assert.ok(others.some(x=>x.printId==="OP13-043_p1"),"Missing verified p1 image ID");
console.log("LIMITLESS_AUDIT_PASS exact public print identities verified");
