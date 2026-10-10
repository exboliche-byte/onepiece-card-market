import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const module={exports:{}};
vm.runInNewContext(fs.readFileSync(new URL("../wants-optimizer.js",import.meta.url),"utf8"),{module,window:{}});
const {prepare,optimize,bestPrices,printed}=module.exports;
const d=(leader,cards)=>({leaderId:leader,cards,players:32});
const filler={"OP17-001":4,"OP17-002":4,"OP17-003":4,"OP17-004":4,"OP17-005":4,"OP17-006":4,"OP17-007":4,"OP17-008":4,"OP17-009":4,"OP17-010":4,"OP17-011":4,"OP17-012":4,"OP17-013":2};
test("all prints and reprints contribute owned copies exactly once",()=>{
 const owned={"OP17-001_p1":2,"OP17-001_r1":1,"OP17-001":1};
 const prices=bestPrices([{id:"OP17-001_p1",name:"A"},{id:"OP17-001",name:"A"}],
  c=>c.id==="OP17-001"?1.7:5,()=>false,()=>"/shop");
 assert.equal(prices.get("OP17-001").id,"OP17-001");
 const pre=prepare([d("OP17-099",filler)],owned,prices,()=>true);
 assert.equal(pre.decks[0].needed.has("OP17-001"),false);
 assert.equal(printed("OP17-001_r1"),"OP17-001");
});
test("counts every legal historical composition, deduplicates identical copies, rejects invalid and JP",()=>{
 const priced=bestPrices(Object.keys(filler).concat("OP17-099").map(id=>({id,name:id})),()=>1,()=>false,()=>null);
 const pre=prepare([d("OP17-099",filler),d("OP17-099",filler),d("OP17-100",filler),{...d("OP17-105",filler),format:"jp"},d("OP17-099",{"OP17-001":49,"OP17-002":1})],
 {},priced,x=>x.leaderId!=="OP17-100");
 assert.equal(pre.stats.legal,1);assert.equal(pre.stats.duplicates,1);assert.equal(pre.stats.illegal,3);
});
test("shared purchases unlock multiple distinct leaders and do not spend twice",()=>{
 const prices=bestPrices([...Object.keys(filler),"OP17-099","OP17-098"].map(id=>({id,name:id})),()=>1,()=>false,()=>null);
 const owned={...Object.fromEntries(Object.keys(filler).map(id=>[id,4])),"OP17-013":2};
 const pre=prepare([d("OP17-099",filler),d("OP17-098",filler)],owned,prices,()=>true);
 const r=optimize(pre,2);
 assert.equal(r.unlocked,2);assert.equal(r.leaders,2);assert.equal(r.purchases.reduce((s,x)=>s+x.qty,0),2);
 assert.equal(r.spent,2);assert.equal(optimize(pre,0).unlocked,0);
});
test("unknown prices cannot be treated as zero or selected to fit the budget",()=>{
 const prices=bestPrices(Object.keys(filler).map(id=>({id,name:id})),()=>1,()=>false,()=>null);
 const owned=Object.fromEntries(Object.keys(filler).map(id=>[id,filler[id]]));
 const pre=prepare([d("OP17-099",filler)],owned,prices,()=>true);
 assert.equal(pre.stats.unpriced,1);
 const r=optimize(pre,500);
 assert.equal(r.spent,0);assert.equal(r.unlocked,0);assert.equal(r.purchases.length,0);
});

test("Wants overview contains a budget optimizer without changing existing account lists",async()=>{
 const scope={
  window:{},document:{createElement:()=>({}),head:{appendChild(){}},querySelector:()=>null,querySelectorAll:()=>[]},
  state:{tab:"catalog",user:{id:"owner"},collectionReady:true,owned:{},cards:[],sb:{
   from:()=>({select(){return this},eq(){return this},order(){return this},async limit(){return {data:[],error:null}}})
  }},
  money:n=>n===null?"—":String(n)+" €",esc:String,norm:String,
  renderShell(){},notify(){},console,crypto:globalThis.crypto
 };
 vm.runInNewContext(fs.readFileSync(new URL("../wants-optimizer.js",import.meta.url),"utf8"),scope);
 vm.runInNewContext(fs.readFileSync(new URL("../wants.js",import.meta.url),"utf8"),scope);
 await scope.window.MyWants.load();
 const html=scope.window.MyWants.view();
 assert.match(html,/Compra inteligente/);
 assert.match(html,/woptBudget/);
 assert.match(html,/woptAnalyze/);
 assert.match(html,/Elige una lista/);
 assert.doesNotMatch(html,/Datos públicos de otra cuenta/);
});

test("optimized shopping unlocks all concrete decklists and separately identifies already buildable decks",()=>{
 const prices=bestPrices([...Object.keys(filler),"OP17-099","OP17-098","OP17-097"].map(id=>({id,name:id})),()=>1,()=>false,()=>null);
 const owned={...Object.fromEntries(Object.keys(filler).map(id=>[id,filler[id]])),"OP17-097":1};
 const all=[d("OP17-099",filler),d("OP17-098",filler),d("OP17-097",filler)];
 const pre=prepare(all,owned,prices,()=>true);
 const result=optimize(pre,2);
 assert.equal(result.unlocked,2);
 assert.equal(result.results.length,2);
 assert.equal(result.baseline,1);
 assert.equal(result.baselineDecks[0].leaderId,"OP17-097");
 assert.deepEqual(Array.from(result.results,x=>x.leaderId).sort(),["OP17-098","OP17-099"]);
});
test("Wants lists show leader image, complete deck composition and a load-more control",()=>{
 const src=fs.readFileSync(new URL("../wants.js",import.meta.url),"utf8");
 const from=src.indexOf("function optimizerDeckCatalog(){"),to=src.indexOf("function optimizerHtml(){");
 assert.ok(from>=0&&to>from);
 const fragment=src.slice(from,to);
 const cacheCards=[{id:"OP17-099",name:"Luffy",set:"OP17"},...Object.keys(filler).map(id=>({id,name:"Card "+id,set:"OP17"}))];
 const state={cards:cacheCards};
 const opt={showBuildable:1,showOwned:1};
 const scope={state,opt,window:{WantsDeckOptimizer:{printed}},h:String,
  cardImg:c=>'<img data-leader="'+c.id+'">',isJapaneseCatalogCard:()=>false,Date};
 const render=vm.runInNewContext(fragment+";optimizerDeckSection",scope);
 const cards=[{...d("OP17-099",filler),tournament:"Test event",sourceUrl:"https://play.limitlesstcg.com/tournament/a"},
              {...d("OP17-099",filler),id:"two",tournament:"Other event"}];
 const markup=render(cards);
 assert.match(markup,/Mazos que puedes montar con esta compra/);
 assert.match(markup,/data-leader="OP17-099"/);
 assert.match(markup,/1× Luffy/);
 assert.match(markup,/4× Card OP17-001/);
 assert.match(markup,/50 cartas/);
 assert.match(markup,/data-wopt-more="buildable"/);
 assert.match(markup,/1 restantes/);
 assert.doesNotMatch(markup,/Other event/);
});

test("one recommendation per leader even if multiple legal builds become playable",()=>{
 const other={...filler,"OP17-013":1,"OP17-014":1};
 const prices=bestPrices([...Object.keys(filler),"OP17-014","OP17-098","OP17-099"].map(id=>({id,name:id})),()=>1,()=>false,()=>null);
 const owned={...Object.fromEntries(Object.keys(filler).map(id=>[id,filler[id]])),"OP17-013":1};
 const prepared=prepare([d("OP17-099",filler),d("OP17-099",other),d("OP17-098",filler)],owned,prices,()=>true);
 const r=optimize(prepared,4);
 assert.equal(r.unlocked,2,"each distinct leader is counted just once");
 assert.equal(new Set(r.results.map(x=>x.leaderId)).size,r.results.length);
 assert.equal(r.leaders,2);
 assert.equal(r.purchases.reduce((s,x)=>s+x.qty,0),3);
});
test("existing built leaders are excluded before optimizer buys anything",()=>{
 const prices=bestPrices([...Object.keys(filler),"OP17-099","OP17-098"].map(id=>({id,name:id})),()=>1,()=>false,()=>null);
 const owned=Object.fromEntries(Object.entries(filler).map(([id,q])=>[id,q]));
 const alreadyMounted=prepare([d("OP17-099",filler),d("OP17-098",filler)],owned,prices,()=>true,new Set(["OP17-099"]));
 const r=optimize(alreadyMounted,10);
 assert.equal(alreadyMounted.stats.alreadyBuilt,1);
 assert.equal(alreadyMounted.stats.legal,1);
 assert.equal(r.baseline,0);
 assert.equal(r.results.length,1);
 assert.equal(r.results[0].leaderId,"OP17-098");
 assert.equal(r.purchases.length,1);
});
test("existing complete saved decks and physically-mounted saved decks are recognized by leader",()=>{
 const source=fs.readFileSync(new URL("../wants.js",import.meta.url),"utf8");
 const from=source.indexOf("function mountedWantsLeaderCodes(){"),to=source.indexOf("function refreshOptimizer(){",from);
 assert.ok(from>=0&&to>from);
 const complete={leader:"OP17-099",cards:filler,id:"deck1"};
 const incomplete={leader:"OP17-098",cards:{"OP17-001":4},id:"deck2"};
 const physicallyUnmounted={leader:"OP17-097",cards:filler,id:"deck3"};
 const state={decks:[complete,incomplete,physicallyUnmounted,{...complete,draftCompetitive:true}]};
 const window={WantsDeckOptimizer:{printed},DeckPhysical:{isMounted:d=>d.id==="deck3"?false:null}};
 const collect=vm.runInNewContext(source.slice(from,to)+";mountedWantsLeaderCodes",{state,window,Set,Object,Number});
 assert.deepEqual(Array.from(collect()).sort(),["OP17-099"]);
 window.DeckPhysical.isMounted=d=>d.id==="deck3"?true:null;
 assert.deepEqual(Array.from(collect()).sort(),["OP17-097","OP17-099"]);
});
test("Wants purchase card picture uses exact priced variant, and click opens its detail",()=>{
 const source=fs.readFileSync(new URL("../wants.js",import.meta.url),"utf8");
 assert.match(source,/card\(p\.id\)\?'<button class="wopt-purchase-photo"/);
 assert.match(source,/cardImg\(card\(p\.id\),"wopt-purchase-art"\)/);
 assert.match(source,/\.wopt-purchase-photo\[data-detail\]/);
 assert.match(source,/openCardDetail\(b\.dataset\.detail\)/);
});
