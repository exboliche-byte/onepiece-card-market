import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("..",import.meta.url));
const code=fs.readFileSync(path.join(root,"tools-hub.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
function setup(){
 const cards=[
  {id:"OP01-001_p1",name:"Monkey D. Luffy",set:"OP-01",set_name:"Romance Dawn"},
  {id:"OP01-001_p2",name:"Monkey D. Luffy",set:"OP-01",set_name:"Romance Dawn"},
  {id:"ST01-001",name:"Roronoa Zoro",set:"ST-01",set_name:"Starter Deck"}
 ];
 const state={user:{id:"u1"},tab:"trades",collectionReady:true,owned:{"OP01-001_p1":1},
  cards,decks:[],tournaments:[],prices:{}};
 const input={value:"",handlers:{},addEventListener(event,cb){this.handlers[event]=cb}};
 const output={innerHTML:"",handlers:{},addEventListener(event,cb){this.handlers[event]=cb},contains:()=>true};
 const data={};
 const context={
  state,window:{TradeOffers:{view:()=>"",bind:()=>{}}},
  document:{createElement:()=>({textContent:""}),head:{appendChild:()=>{}},
   querySelector:id=>({"#toolsSearch":input,"#toolsSearchResults":output})[id]||null,
   querySelectorAll:()=>[],addEventListener:()=>{}},
  localStorage:{getItem:key=>data[key]||null,setItem:(key,value)=>{data[key]=value}},
  esc:value=>String(value),
  money:n=>n==null?"—":Number(n).toFixed(2)+" €",
  card:id=>state.cards.find(c=>c.id===id),
  cardImg:c=>"<img alt='"+c.id+"'>",
  qty:id=>state.owned[id]||0,
  priceOf:c=>c?.id==="OP01-001_p1"?12:5,
  norm:s=>String(s).toLowerCase(),
  isJapaneseCatalogCard:()=>false,
  baseId:id=>id.split("_")[0],
  deckPrintedCode:id=>typeof id==="string"?id:id?.id||"",
  deckAvailableByPrinting:()=>({}),deckOwnedCopies:()=>0,
  resolveDeckImportCard:id=>state.cards.find(c=>c.id===id),
  competitiveLeaderOptions:()=>[],renderShell:()=>{},notify:()=>{},
  fetch:async()=>({ok:false,json:async()=>({})}),setTimeout:()=>1,clearTimeout:()=>{}
 };
 state.sb={from(name){assert.equal(name,"user_tools");return {
  select(){return {eq(){return {maybeSingle:async()=>({data:{trade:[[],[]],revision:1},error:null})}}}}
 }}};
 vm.runInNewContext(code,context,{timeout:2500});
 return {hub:context.window.OnePieceTools,input,output,state};
}
test("Trade card search filters by name/code and preserves each exact print",async()=>{
 const {hub,input,output}=setup();
 hub.tradePage();await hub.loadCloud();hub.bindTrade();
 input.value="luffy";input.handlers.input();
 assert.match(output.innerHTML,/OP01-001_p1/);
 assert.match(output.innerHTML,/OP01-001_p2/);
 assert.doesNotMatch(output.innerHTML,/ST01-001/);
 input.value="romance luffy";input.handlers.input();
 assert.match(output.innerHTML,/OP01-001_p1/);
 input.value="OP01-001_p2";input.handlers.input();
 assert.match(output.innerHTML,/OP01-001_p2/);
});
test("Replacing results does not detach add button and draft retains exact variant",async()=>{
 const {hub,input,output}=setup();
 hub.tradePage();await hub.loadCloud();hub.bindTrade();
 input.value="luffy";input.handlers.input();
 const button={dataset:{tradeAdd:"0",card:"OP01-001_p1"}};
 output.handlers.click({target:{closest:()=>button}});
 const page=hub.tradePage();
 assert.match(page,/OP01-001_p1/);
 assert.match(page,/12\.00 €/);
 assert.match(page,/Entrego/);
});
test("Catalog replacement refreshes search index",async()=>{
 const {hub,input,output,state}=setup();
 hub.tradePage();await hub.loadCloud();hub.bindTrade();
 input.value="zoro";input.handlers.input();
 assert.match(output.innerHTML,/ST01-001/);
 state.cards=[{id:"OP02-007",name:"New Card",set:"OP-02"}];
 input.value="new card";input.handlers.input();
 assert.match(output.innerHTML,/OP02-007/);
 assert.doesNotMatch(output.innerHTML,/ST01-001/);
});
test("Asynchronous trade refresh retains card and username search focus",()=>{
 assert.match(html,/const keepFocus=active&&\["toolsSearch","tradePeer"\]\.includes\(active\.id\)/);
 assert.match(html,/field\.focus\(\{preventScroll:true\}\)/);
 assert.match(html,/field\.setSelectionRange\(keepFocus\.start,keepFocus\.end\)/);
});

test("Trade results have one full-width row per card and responsive non-overflowing columns",()=>{
 const css=code.slice(code.indexOf('style.textContent='));
 assert.match(css,/\.tools-results\{display:grid;grid-template-columns:minmax\(0,1fr\);grid-auto-flow:row/);
 assert.match(css,/\.tools-found\{display:grid;grid-template-columns:55px minmax\(0,1fr\) 44px 44px/);
 assert.match(css,/overflow-x:hidden/);
 assert.match(css,/@media\(max-width:540px\)\{\.tools-found\{grid-template-columns:42px minmax\(0,1fr\) 36px 36px/);
 assert.match(css,/\.tools-found \.grow\{min-width:0;overflow-wrap:anywhere\}/);
});

test("Trade results reserve readable text space at narrow mobile widths",()=>{
 assert.match(code,/class="tools-found-actions"/);
 assert.match(code,/grid-template-areas:"image info" "image actions"/);
 assert.match(code,/\.tools-item\{display:grid;grid-template-columns:55px minmax\(0,1fr\)/);
 assert.match(code,/\.tools-results \.tools-found>\.grow\{grid-area:info/);
 assert.match(code,/word-break:normal/);
});
