import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const labCode=read("deck-lab.js"),toolsCode=read("tools-hub.js");
const html=read("index.html"),sw=read("sw.js"),pwa=read("pwa.js"),build=read("scripts/vercel-build.sh");
const printed=id=>String(id||"").replace(/_p\d+$/i,"");
function laboratory(){
 const cards=[
  {id:"OP05-001",category:"Character",name:"Alpha"},
  {id:"OP05-001_p1",category:"Character",name:"Alpha parallel"},
  {id:"OP05-002",category:"Character",name:"Beta"},
  {id:"OP05-060",category:"Leader",name:"Leader",life:4}
 ];
 const state={cards,decks:[],deckId:null,owned:{"OP05-001_p1":2,"OP05-001":1,"OP05-060":1}};
 const mock={window:{},document:{addEventListener(){}},state,deckPrintedCode:printed,
  card:id=>cards.find(c=>c.id===id)||null,cardImg:()=>"",esc:String,money:n=>String(n),deckTotalValue:()=>0,
  priceOf:c=>c?.id==="OP05-001"?3:c?.id==="OP05-001_p1"?5:c?.id==="OP05-002"?10:1,
  isJapaneseCatalogCard:()=>false,notify:()=>{},Math};
 vm.runInNewContext(labCode,mock);
 return {helpers:mock.window.OnePieceDeckLab.helpers,state};
}
test("Mulligan odds and two-card combo use exact multivariate combinations",()=>{
 const {helpers:h}=laboratory();
 const expected=1-(46/50)*(45/49)*(44/48)*(43/47)*(42/46);
 assert.ok(Math.abs(h.probability(50,4,5)-expected)<1e-10);
 const combo=h.comboChance(50,[4,4],5);
 assert.ok(combo>0&&combo<h.probability(50,4,5));
 assert.ok(h.comboChance(50,[4,4],7)>combo);
 assert.equal(h.comboChance(5,[1,1],20),1); // incomplete deck: clamp to five cards
 const mulligan=1-(1-combo)**2;
 assert.ok(mulligan>combo&&mulligan<1);
});
test("The simulator has life, DON and no first-player draw, without card-effect promises",()=>{
 const {helpers:h}=laboratory();
 assert.equal(h.leaderLife({leader:"OP05-060"}),4);
 assert.equal(h.leaderLife({leader:"unknown"}),5);
 assert.match(labCode,/lab\.life=cards\.splice\(0,Math\.min\(lab\.lifeCount/);
 assert.match(labCode,/lab\.turn===1&&lab\.first\?1:2/);
 assert.match(labCode,/lab\.turn===1&&lab\.first/);
 assert.match(labCode,/data-lab-play/);
 assert.match(labCode,/data-lab-combo/);
});
test("Temporary pasted lists preserve card print IDs and reject unknown cards",()=>{
 const {helpers:h}=laboratory();
 const parsed=h.parsePasted("4x OP05-001_p1\n2 OP05-002\n1x OP05-060",{leader:"OP05-060"});
 assert.equal(parsed.deck.cards["OP05-001_p1"],4);
 assert.equal(parsed.deck.cards["OP05-002"],2);
 assert.equal(parsed.deck.leader,"OP05-060");
 assert.ok(h.parsePasted("3x OP99-999",{leader:"OP05-060"}).error);
});
test("Buying a target deck uses exact-print collection stocks and the cheapest purchasable print",()=>{
 const {helpers:h,state}=laboratory();
 const ownedBefore=JSON.stringify(state.owned);
 const costs=new Map([
  ["OP05-001",{price:3,card:state.cards[0]}],
  ["OP05-002",{price:10,card:state.cards[2]}],
  ["OP05-060",{price:1,card:state.cards[3]}]
 ]);
 const result=h.neededToBuy({leader:"OP05-060",cards:{"OP05-001":4,"OP05-002":1}},costs);
 assert.equal(result.copies,2);
 assert.equal(result.total,13);
 assert.equal(result.unknown,0);
 assert.equal(JSON.stringify(state.owned),ownedBefore);
 assert.match(labCode,/competitiveLists/);
 assert.match(labCode,/compareWithCompetitive/);
});
test("Personal recommendations use unified Wilson-confidence meta and deduplicate archetypes",()=>{
 const injected=toolsCode.replace(/\}\)\(\);\s*$/,"window.__rankTest={deckFit,personalStats,h};})();");
 assert.notEqual(injected,toolsCode);
 const state={user:{id:"u"},collectionReady:true,cards:[],decks:[],owned:{},
  tournaments:[{leaderId:"OP05-001",rounds:[{kind:"swiss",result:"W"},{kind:"bye",result:"W"},{kind:"swiss",result:"L"}]}]};
 const root={
  window:{},state,document:{createElement:()=>({textContent:""}),head:{appendChild(){}},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]},
  localStorage:{getItem:()=>null,setItem(){}},esc:String,money:n=>String(n),
  deckPrintedCode:printed,deckOwnedCopies:()=>0,deckAvailableByPrinting:()=>({}),
  card:()=>null,cardImg:()=>"",qty:()=>0,priceOf:()=>null,isJapaneseCatalogCard:()=>false,
  resolveDeckImportCard:()=>null,competitiveLeaderOptions:()=>[],baseId:printed,
  norm:s=>String(s).toLowerCase(),renderShell(){},notify(){},setTimeout:()=>1,clearTimeout(){}
 };
 vm.runInNewContext(injected,root);
 const {deckFit,personalStats,h}=root.window.__rankTest;
 assert.equal(personalStats("OP05-001").games,2,"BYEs must not count as games");
 h.metaData={leaders:[
  {id:"OP05-001",confidenceRate:53,confidenceGames:10000,games:10000},
  {id:"OP05-002",confidenceRate:43,confidenceGames:37,games:37}
 ]};
 const a=deckFit({leaderId:"OP05-001"},{owned:0,total:51,cost:50,unknown:0});
 const b=deckFit({leaderId:"OP05-002"},{owned:51,total:51,cost:0,unknown:0});
 assert.ok(a.score>b.score,"trusted meta must outweigh owning a weak deck");
 assert.match(toolsCode,/const leaderMap=new Map/);
 assert.match(toolsCode,/\/api\/meta-unified\?days=90/);
 assert.match(toolsCode,/toolsPreference/);
 assert.match(toolsCode,/data-tools-compare/);
});
test("External comparison access, PWA deferred updates and safe offline fallback are wired",()=>{
 assert.match(html,/data-compare-competitive/);
 assert.match(html,/id="compareLibraryDecks"/);
 assert.match(html,/id="pwaUpdateBtn"/);
 assert.match(pwa,/updatefound/);
 assert.match(pwa,/registration\.waiting\.postMessage\("SKIP_WAITING"\)/);
 assert.match(pwa,/window\.addEventListener\("offline"/);
 assert.match(sw,/mialbumonepiece-v17/);
 assert.match(sw,/\/offline\.html/);
 assert.match(sw,/url\.pathname\.startsWith\("\/api\/"\)/);
 assert.doesNotMatch(sw,/then\(\(\)=>self\.skipWaiting\(\)\)/);
 assert.match(read("offline.html"),/Sin conexión/);
 assert.match(build,/offline\.html/);
});
