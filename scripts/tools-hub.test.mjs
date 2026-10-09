import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const source=fs.readFileSync(path.join(root,"tools-hub.js"),"utf8");
const api=fs.readFileSync(path.join(root,"api/competitive-decks.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const cards=[
  {id:"OP01-001",name:"Luffy",set:"OP-01",category:"Character"},
  {id:"OP01-002",name:"Zoro",set:"OP-01",category:"Character"},
  {id:"OP01-003",name:"Sanji",set:"OP-01",category:"Leader"}
];
function setup(saved={}){
  const notices=[],written={...saved},buttons=[];
  const state={user:{id:"u1"},collectionReady:true,loading:false,tab:"tools",owned:{"OP01-001":2},
    cards,decks:[],tournaments:[],prices:{}};
  const root={
    state,window:{},document:{
      createElement:()=>({textContent:""}),
      head:{appendChild:()=>{}},
      querySelector:()=>null,
      querySelectorAll:selector=>selector==="[data-tools-tab]"?buttons:[]
    },
    localStorage:{getItem:k=>written[k]||null,setItem:(k,v)=>{written[k]=v}},
    esc:s=>String(s),money:n=>n===null||n===undefined?"—":Number(n).toFixed(2)+" €",
    card:id=>cards.find(c=>c.id===id),cardImg:c=>"<img alt='"+c.id+"'>",qty:id=>state.owned[id]||0,
    priceOf:c=>c?.id==="OP01-001"?12:c?.id==="OP01-002"?5:1,
    norm:s=>String(s).toLowerCase(),isJapaneseCatalogCard:()=>false,baseId:id=>id,
    deckPrintedCode:id=>typeof id==="string"?id:id?.id||"",
    deckAvailableByPrinting:()=>({}),deckOwnedCopies:()=>0,
    resolveDeckImportCard:id=>cards.find(c=>c.id===id),
    competitiveLeaderOptions:()=>[{id:"OP01-003",name:"Sanji"}],
    renderShell:()=>{},notify:s=>notices.push(s),console,fetch:async()=>({ok:false,json:async()=>({})})
  };
  vm.runInNewContext(source,root,{timeout:2500});
  const hub=root.window.OnePieceTools;
  function tab(name){
    const btn={dataset:{toolsTab:name}};
    buttons.splice(0,buttons.length,btn);
    hub.bind();assert.equal(typeof btn.onclick,"function");btn.onclick();
    return hub.view();
  }
  return {hub,tab,notices,state,written};
}
test("Tools hub is wired into the current navigation and the production build",()=>{
  assert.match(html,/\["tools","Herramientas"\]/);
  assert.match(html,/OnePieceTools\?\.view/);
  assert.match(html,/OnePieceTools\?\.bind/);
  assert.match(html,/src="\/tools-hub\.js"/);
  const build=fs.readFileSync(path.join(root,"scripts/vercel-build.sh"),"utf8");
  assert.match(build,/tools-hub\.js/);
});
test("Manual trade totals never change the owned collection",()=>{
  const saved=JSON.stringify({trade:[
    [{id:"OP01-001",q:2,manual:null}],
    [{id:"OP01-002",q:1,manual:8}]
  ],watch:[]});
  const t=setup({"mialbumonepiece_tools_u1":saved});
  const before=JSON.stringify(t.state.owned),page=t.hub.view();
  assert.match(page,/Intercambio manual/);
  assert.match(page,/24\.00 €/);
  assert.match(page,/8\.00 €/);
  assert.match(page,/-16\.00 €/);
  assert.equal(JSON.stringify(t.state.owned),before);
});
test("All tools render and the tournament panel reads personal rounds",()=>{
  const t=setup();
  assert.match(t.tab("decks"),/Mazos que casi puedes construir/);
  assert.match(t.tab("alerts"),/Alertas de precios/);
  t.state.tournaments=[{leaderId:"OP01-003",rounds:[
    {opponentId:"OP01-002",kind:"swiss",result:"W",start:"1"},
    {opponentId:"OP01-001",kind:"swiss",result:"L",start:"2"},
    {opponentId:"OP01-002",kind:"bye",result:"W"}
  ]}];
  assert.match(t.tab("coach"),/2 rondas personales/);
  assert.match(t.tab("trade"),/Intercambio manual/);
});
test("Exact-print alerts warn only once for the same current price",()=>{
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify({watch:[
    {id:"OP01-001",target:15,direction:"below"},
    {id:"OP01-002",target:6,direction:"above"}
  ]})});
  assert.match(t.tab("alerts"),/1 objetivos alcanzados/);
  t.hub.checkAlerts();t.hub.checkAlerts();
  assert.equal(t.notices.length,1);
  assert.match(t.notices[0],/precio objetivo/);
});
test("Competitive endpoint adds optional multi-leader mode without removing exact leader filtering",()=>{
  assert.match(api,/leader!=="all"&&leaderId!==leader/);
  assert.match(api,/leader==="all"\?120:30/);
  assert.match(api,/const perLeader=new Map/);
  assert.match(api,/if\(n>=3\)return false/);
});
