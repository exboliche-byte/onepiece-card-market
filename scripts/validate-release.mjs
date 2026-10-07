import fs from "node:fs/promises";

function fail(message){throw new Error(message)}
function assert(condition,message){if(!condition)fail(message)}
function baseId(id){return String(id||"").replace(/_(?:p|r|c|jp)\d+$/i,"")}

const [html, priceRaw, cardsRaw] = await Promise.all([
  fs.readFile(new URL("../index.html", import.meta.url),"utf8"),
  fs.readFile(new URL("../data/cardmarket-prices.json", import.meta.url),"utf8"),
  fs.readFile(new URL("../data/cards.json", import.meta.url),"utf8")
]);

const inlineScripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match=>match[1]).filter(code=>code.trim());
assert(inlineScripts.length>0,"No inline application script found");
for(const code of inlineScripts)new Function(code);

const cardImgStart=html.indexOf("function cardImg(c,cls=");
const cardImgEnd=html.indexOf("\nfunction deckOwnedImg",cardImgStart);
assert(cardImgStart>=0&&cardImgEnd>cardImgStart,"cardImg function not found");
const cardImg=html.slice(cardImgStart,cardImgEnd);
assert(cardImg.includes('const loading="eager"'),"Rendered card images are not forced to eager loading");
assert(!cardImg.includes('"lazy"'),"cardImg still contains lazy loading");
assert(html.includes("function limitlessImageUrl(c)"),"Limitless exact-print image source missing");
assert(cardImg.includes("limitlessImageUrl(c)"),"cardImg does not use the exact-print Limitless image source");
assert(html.includes("function cardImageFallback(el)"),"Multi-source image fallback missing");

assert(html.includes("scanner:{active:false,busy:false,locked:false"),"Scanner lock state missing");
assert(/function scheduleScanner[\s\S]*?state\.scanner\.locked/.test(html),"Scanner scheduler does not respect lock state");
assert(/async function scanScannerFrame[\s\S]*?state\.scanner\.locked=true/.test(html),"Scanner does not lock after detection");
assert(html.includes("function scannerConfirmCandidate("),"Scanner consensus guard missing");
assert(/async function scanScannerFrame[\s\S]*?código suave[\s\S]*?código contraste/.test(html),"Scanner multi-pass code recognition missing");
assert(/function scannerUnlock[\s\S]*?state\.scanner\.locked=false/.test(html),"Scanner unlock flow missing");
assert(html.includes("data-scanner-discard"),"Scanner discard action missing");
assert(/function scannerAdd[\s\S]*?scannerUnlock\(/.test(html),"Scanner add does not resume scanning");

assert(/function priceMeta\(c\)[\s\S]*?return directMarketMeta\(c\)/.test(html),"Price metadata can remap away from exact print");
assert(/function resolveCSVPrint[\s\S]*?const exact=compatible\.find\(c=>norm\(c\.id\)===norm\(normalizedVariant\)\);[\s\S]*?if\(exact\)return exact/.test(html),"CSV exact variant_id resolution guard missing");

const priceData=JSON.parse(priceRaw);
const cards=Array.isArray(JSON.parse(cardsRaw))?JSON.parse(cardsRaw):Object.values(JSON.parse(cardsRaw)||{});
const catalogIds=new Set(cards.map(card=>String(card?.id||"")).filter(Boolean));
const unsafe=[];
let variants=0,pricedVariants=0;
for(const [id,entry] of Object.entries(priceData.cards||{})){
  if(!catalogIds.has(id) || !/_(?:p|r|c)\d+$/i.test(id))continue;
  variants++;
  const eur=Number(entry?.eur);
  if(Number.isFinite(eur)&&eur>0)pricedVariants++;
  const source=String(entry?.source||"");
  const url=String(entry?.url||"");
  if(entry?.cardmarketId!=null || entry?.expansionId!=null)unsafe.push(id+": inferred product");
  if(/\/Cards\//i.test(url))unsafe.push(id+": generic Cardmarket URL");
  if(Number.isFinite(eur)&&eur>0&&!/(exact[- ]print|Limitless\/Cardmarket)/i.test(source))unsafe.push(id+": non-exact price source");
  if(entry?.variantOf && String(entry.variantOf)!==baseId(id))unsafe.push(id+": wrong variantOf");
}
assert(!unsafe.length,"Unsafe variant pricing detected: "+unsafe.slice(0,20).join(", "));

console.log(JSON.stringify({
  ok:true,
  schemaVersion:priceData.schemaVersion,
  catalogCards:catalogIds.size,
  variants,
  pricedVariants,
  priceStats:priceData.stats||{}
}));
