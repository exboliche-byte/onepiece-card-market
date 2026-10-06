const url="https://www.tcggo.com/one-piece/paramount-war/nami-36";
const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0"}});
console.log("STATUS",r.status);
const html=await r.text();
console.log("LEN",html.length);
for(const needle of ["Cardmarket ID","Version","EU Prices","API","episodes/","cards/30857"]) {
  const i=html.indexOf(needle);
  console.log("\nNEEDLE",needle,"POS",i);
  if(i>=0) console.log(html.slice(Math.max(0,i-500),i+2500));
}
