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
      querySelectorAll:selector=>selector==="[data-tools-tab]"?buttons:[],
      addEventListener:()=>{}
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
    renderShell:()=>{},notify:s=>notices.push(s),console,fetch:async()=>({ok:false,json:async()=>({})}),
    setTimeout:()=>1,clearTimeout:()=>{}
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
test("Exact-print alerts warn only once for the same current price",async()=>{
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify({watch:[
    {id:"OP01-001",target:15,direction:"below"},
    {id:"OP01-002",target:6,direction:"above"}
  ]})});
  const cloud=mockDb(null);
  t.state.sb=cloud.client;
  await t.hub.loadCloud();
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

function mockDb(initial){
  let row=initial?structuredClone(initial):null,reads=0,writes=0;
  const client={from(name){
    assert.equal(name,"user_tools");
    return {
      select(){return {eq(){return {maybeSingle:async()=>{
        reads++;return {data:row?structuredClone(row):null,error:null};
      }}}}},
      insert(v){return {select(){return {single:async()=>{
        if(row)return {data:null,error:{code:"23505",message:"duplicate"}};
        row={...structuredClone(v),revision:1};writes++;
        return {data:{revision:1},error:null};
      }}}}},
      update(v){const filters={};return {
        eq(k,value){filters[k]=value;return this},
        select(){return this},
        async maybeSingle(){
          if(!row||row.revision!==filters.revision||row.user_id!==filters.user_id)
            return {data:null,error:null};
          row={...row,...structuredClone(v)};writes++;
          return {data:{revision:row.revision},error:null};
        }
      }}
    };
  }};
  return {client,row:()=>structuredClone(row),reads:()=>reads,writes:()=>writes};
}
test("Cloud migration preserves old local trade and alert settings",async()=>{
  const saved={trade:[[{id:"OP01-001",q:2,manual:10}],[]],
    watch:[{id:"OP01-002",target:7,direction:"above"}]};
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify(saved)});
  const cloud=mockDb(null);t.state.sb=cloud.client;
  assert.equal(await t.hub.loadCloud(),true);
  assert.equal(cloud.writes(),1);
  assert.equal(cloud.row().trade[0][0].q,2);
  assert.equal(cloud.row().watch[0].id,"OP01-002");
  assert.match(t.hub.view(),/Guardado en Supabase/);
});
test("Cloud load prefers existing remote settings to stale browser cache",async()=>{
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify({
    trade:[[{id:"OP01-001",q:100,manual:50}],[]],watch:[],revision:9})});
  const cloud=mockDb({user_id:"u1",trade:[[{id:"OP01-002",q:1,manual:5}],[]],
    watch:[],revision:9});t.state.sb=cloud.client;
  assert.equal(await t.hub.loadCloud(),true);
  const page=t.hub.view();
  assert.match(page,/Zoro/);
  assert.doesNotMatch(page,/5000\.00 €/);
  assert.equal(cloud.writes(),0);
});
test("Offline pending changes with same revision save; conflicts never overwrite",async()=>{
  const data={trade:[[{id:"OP01-001",q:2,manual:12}],[]],watch:[],pending:true,revision:2};
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify(data)});
  const cloud=mockDb({user_id:"u1",trade:[[],[]],watch:[],revision:2});
  t.state.sb=cloud.client;
  await t.hub.loadCloud();await t.hub.flushCloud();
  assert.equal(cloud.row().revision,3);
  assert.equal(cloud.row().trade[0][0].q,2);
  const other=setup({"mialbumonepiece_tools_u1":JSON.stringify({...data,revision:1})});
  const cloud2=mockDb({user_id:"u1",trade:[[],[]],watch:[],revision:3});
  other.state.sb=cloud2.client;
  await other.hub.loadCloud();await other.hub.flushCloud();
  assert.equal(cloud2.writes(),0);
  assert.match(other.hub.view(),/Decide cuál conservar/);
  assert.match(other.hub.view(),/Reemplazar datos de Supabase/);
});
test("Own-account SQL permissions are enabled for the tools table",()=>{
  const sql=fs.readFileSync(path.join(root,"supabase/migrations/20261009_user_tools_sync.sql"),"utf8");
  assert.match(sql,/alter table public\.user_tools enable row level security/i);
  assert.match(sql,/for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql,/for update to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test("Legacy browser drafts conflict visibly if another device already has cloud settings",async()=>{
  const cached={trade:[[{id:"OP01-001",q:1,manual:8}],[]],watch:[]};
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify(cached)});
  const remote=mockDb({user_id:"u1",trade:[[],[]],watch:[],revision:4});
  t.state.sb=remote.client;
  assert.equal(await t.hub.loadCloud(),true);
  assert.equal(remote.writes(),0);
  assert.match(t.hub.view(),/datos guardados antes de la sincronización/);
  assert.match(t.hub.view(),/Reemplazar datos de Supabase/);
  const local=JSON.parse(t.written["mialbumonepiece_tools_u1"]);
  assert.equal(local.trade[0][0].manual,8);
});
