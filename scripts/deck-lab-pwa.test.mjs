import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html"),module=read("deck-lab.js"),hub=read("tools-hub.js");
const code=id=>String(id||"").replace(/_p\d+$/i,"");
function lab(){
 const context={
   window:{},document:{addEventListener(){}},
   state:{decks:[],deckId:null,cards:[]},deckPrintedCode:code,
   card:id=>({id,name:id}),cardImg:()=>"",esc:String,
   money:n=>String(n),deckTotalValue:()=>0,notify:()=>{},
   Math
 };
 vm.runInNewContext(module,context);
 return context.window.OnePieceDeckLab.helpers;
}
test("Simulation probabilities match exact hypergeometric probabilities",()=>{
 const x=lab();
 const sample=1-(46/50)*(45/49)*(44/48)*(43/47)*(42/46);
 assert.ok(Math.abs(x.probability(50,4,5)-sample)<1e-10);
 assert.equal(x.probability(50,0,5),0);
 assert.equal(x.probability(50,50,5),1);
 assert.equal(x.probability(50,2,5,3),0);
});
test("Mazo study groups playable numbers without mutating print identities",()=>{
 const x=lab(),d={cards:{"OP01-001_p1":2,"OP01-001":1,"OP01-002":2}};
 const before=JSON.stringify(d),total=x.counts(d);
 assert.equal(total.get("OP01-001"),3);
 assert.equal(x.entries(d).filter(z=>z==="OP01-001_p1").length,2);
 assert.equal(x.entries(d).length,5);
 assert.equal(JSON.stringify(d),before);
});
test("Discovery tabs, deck tools and install flow are wired to real handlers",()=>{
 assert.match(html,/id="deckDiscoveryMine"/);
 assert.match(html,/setDeckMode\?\.\("mine"\)/);
 assert.match(hub,/function deckFit\(/);
 assert.match(hub,/h\.sort==="fit"/);
 assert.match(html,/id="deckSimulate"/);
 assert.match(html,/id="deckCompare"/);
 assert.match(html,/OnePieceDeckLab\?\.simulate/);
 assert.match(html,/OnePieceDeckLab\?\.compare/);
 assert.match(html,/mobileMorePanel/);
 assert.match(html,/setAttribute\("aria-expanded","false"\)/);
 assert.match(html,/menu\.contains\(e\.target\)/);
 assert.match(html,/id="installAppBtn"/);
 assert.match(html,/MiAlbumPWA\?\.bind/);
 assert.match(html,/src="\/pwa\.js"/);
 assert.match(html,/src="\/deck-lab\.js"/);
});
test("PWA artifacts are present, safe and bundled",()=>{
 const m=JSON.parse(read("manifest.json")),sw=read("sw.js"),build=read("scripts/vercel-build.sh");
 assert.equal(m.display,"standalone");
 assert.ok(m.icons.some(x=>x.sizes==="192x192"));
 assert.ok(m.icons.some(x=>x.sizes==="512x512"));
 for(const size of [192,512]){
   const data=fs.readFileSync(new URL("../icon-"+size+".png",import.meta.url));
   assert.equal(data.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 }
 assert.match(sw,/navigator|GET|req\.method/);
 assert.match(sw,/\/api\//);
 assert.match(sw,/SMALL_DATA/);
 assert.match(build,/deck-lab\.js/);
 assert.match(build,/pwa\.js/);
 assert.match(build,/icon-512\.png/);
 assert.match(build,/deck-lab-pwa\.test\.mjs/);
});
test("Yellow floating scanner is absent; catalog and Tools still offer the scanner",()=>{
 const scanner=read("scanner.js"),css=read("deck-lab.css");
 assert.doesNotMatch(scanner,/scanLaunch|📷 Escanear cartas/);
 assert.doesNotMatch(css,/scanLaunch/);
 assert.match(html,/class="secondary btn catalog-search-scan" data-scan-open/);
 assert.match(html,/\["HERRAMIENTAS",\["proxies","scanner"\]\]/);
 assert.match(html,/window\.openOnePieceScanner\?\.\(\)/);
 assert.match(scanner,/window\.openOnePieceScanner=open/);
});
