const url="https://www.tcggo.com/one-piece/paramount-war/nami-36";
const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0"}});
console.log("STATUS",r.status);
const html=await r.text();
console.log("LEN",html.length);
console.log("CARDMARKET",html.match(/Cardmarket ID[\s\S]{0,500}/i)?.[0]||"none");
console.log("VERSION",html.match(/Version[\s\S]{0,120}/i)?.[0]||"none");
console.log("PRICES",html.match(/EU Prices[\s\S]{0,1600}/i)?.[0]||"none");
console.log("API",html.match(/(?:/cards/|/episodes/)[^"'<> ]{1,100}/g)?.slice(0,20)||[]);
