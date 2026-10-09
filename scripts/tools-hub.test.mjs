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
  const state={user:{id:"u1"},collectionReady:true,loading:false,tab:"trades",owned:{"OP01-001":2},
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
    competitiveLeaderOptions:()=>[{id:"OP01-003",name:"Sanji",card:cards[2]}],
    renderShell:()=>{},notify:s=>notices.push(s),console,fetch:async()=>({ok:false,json:async()=>({})}),
    setTimeout:()=>1,clearTimeout:()=>{}
  };
  vm.runInNewContext(source,root,{timeout:2500});
  const hub=root.window.OnePieceTools;
  function tab(name){
    if(name==="decks")return hub.decksView();
    if(name==="coach")return hub.coachView();
    return hub.tradePage();
  }
  return {hub,tab,notices,state,written};
}
test("Tools hub is wired into the current navigation and the production build",()=>{
  assert.match(html,/\["trades","Intercambios"\]/);
  assert.match(html,/OnePieceTools\?\.tradePage/);
  assert.match(html,/OnePieceTools\?\.bindTrade/);
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
  const before=JSON.stringify(t.state.owned),page=t.hub.tradePage();
  assert.match(page,/Intercambio manual/);
  assert.match(page,/24\.00 €/);
  assert.match(page,/8\.00 €/);
  assert.match(page,/-16\.00 €/);
  assert.equal(JSON.stringify(t.state.owned),before);
});
test("All tools render and the tournament panel reads personal rounds",()=>{
  const t=setup();
  assert.match(t.tab("decks"),/Mazos que casi puedes construir/);
  assert.doesNotMatch(t.tab("trade"),/Alertas de precios/);
  t.state.tournaments=[{leaderId:"OP01-003",rounds:[
    {opponentId:"OP01-002",kind:"swiss",result:"W",start:"1"},
    {opponentId:"OP01-001",kind:"swiss",result:"L",start:"2"},
    {opponentId:"OP01-002",kind:"bye",result:"W"}
  ]}];
  assert.match(t.tab("coach"),/2 rondas personales/);
  assert.match(t.tab("coach"),/data-tools-leader=/);
  assert.match(t.tab("trade"),/Intercambio manual/);
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
test("Cloud migration preserves existing local trade drafts",async()=>{
  const saved={trade:[[{id:"OP01-001",q:2,manual:10}],[]]};
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify(saved)});
  const cloud=mockDb(null);t.state.sb=cloud.client;
  assert.equal(await t.hub.loadCloud(),true);
  assert.equal(cloud.writes(),1);
  assert.equal(cloud.row().trade[0][0].q,2);
  assert.ok(!Object.hasOwn(cloud.row(),"watch"));
  assert.match(t.hub.tradePage(),/Guardado en Supabase/);
});
test("Cloud load prefers existing remote settings to stale browser cache",async()=>{
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify({
    trade:[[{id:"OP01-001",q:100,manual:50}],[]],revision:9})});
  const cloud=mockDb({user_id:"u1",trade:[[{id:"OP01-002",q:1,manual:5}],[]],
    revision:9});t.state.sb=cloud.client;
  assert.equal(await t.hub.loadCloud(),true);
  const page=t.hub.view();
  assert.match(page,/Zoro/);
  assert.doesNotMatch(page,/5000\.00 €/);
  assert.equal(cloud.writes(),0);
});
test("Offline pending changes with same revision save; conflicts never overwrite",async()=>{
  const data={trade:[[{id:"OP01-001",q:2,manual:12}],[]],pending:true,revision:2};
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify(data)});
  const cloud=mockDb({user_id:"u1",trade:[[],[]],revision:2});
  t.state.sb=cloud.client;
  await t.hub.loadCloud();await t.hub.flushCloud();
  assert.equal(cloud.row().revision,3);
  assert.equal(cloud.row().trade[0][0].q,2);
  const other=setup({"mialbumonepiece_tools_u1":JSON.stringify({...data,revision:1})});
  const cloud2=mockDb({user_id:"u1",trade:[[],[]],revision:3});
  other.state.sb=cloud2.client;
  await other.hub.loadCloud();await other.hub.flushCloud();
  assert.equal(cloud2.writes(),0);
  assert.match(other.hub.tradePage(),/Decide cuál conservar/);
  assert.match(other.hub.view(),/Reemplazar datos de Supabase/);
});
test("Own-account SQL permissions are enabled for the tools table",()=>{
  const sql=fs.readFileSync(path.join(root,"supabase/migrations/20261009_user_tools_sync.sql"),"utf8");
  assert.match(sql,/alter table public\.user_tools enable row level security/i);
  assert.match(sql,/for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql,/for update to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test("Legacy browser drafts conflict visibly if another device already has cloud settings",async()=>{
  const cached={trade:[[{id:"OP01-001",q:1,manual:8}],[]]};
  const t=setup({"mialbumonepiece_tools_u1":JSON.stringify(cached)});
  const remote=mockDb({user_id:"u1",trade:[[],[]],revision:4});
  t.state.sb=remote.client;
  assert.equal(await t.hub.loadCloud(),true);
  assert.equal(remote.writes(),0);
  assert.match(t.hub.view(),/datos guardados antes de la sincronización/);
  assert.match(t.hub.view(),/Reemplazar datos de Supabase/);
  const local=JSON.parse(t.written["mialbumonepiece_tools_u1"]);
  assert.equal(local.trade[0][0].manual,8);
});

test("Mutual acceptance, exact-print transfer and private policies are present",()=>{
 const sql=fs.readFileSync(path.join(root,"supabase/migrations/20261009_mutual_trade_offers.sql"),"utf8");
 assert.match(sql,/status text not null default 'pending'/i);
 assert.match(sql,/maker_accepted boolean not null default true/i);
 assert.match(sql,/taker_accepted boolean not null default false/i);
 assert.match(sql,/for select\s+to authenticated using \(maker_id=/i);
 assert.match(sql,/if uid<>off.taker_id then raise exception/i);
 assert.match(sql,/if not off.maker_accepted then raise exception/i);
 assert.match(sql,/quantity=quantity-n/i);
 assert.match(sql,/quantity=public.collection_items.quantity\+excluded.quantity/i);
 assert.match(sql,/update public.trade_offers set taker_accepted=true,status='completed'/i);
 assert.match(sql,/alter table public.user_tools drop column if exists watch/i);
 const client=fs.readFileSync(path.join(root,"trade-offers.js"),"utf8");
 new Function(client);
 assert.match(client,/trade_offer_create/);
 assert.match(client,/trade_offer_decide/);
 assert.match(client,/data-trade-act="accept"/);
 assert.match(html,/src="\/trade-offers.js"/);
 const build=fs.readFileSync(path.join(root,"scripts/vercel-build.sh"),"utf8");
 assert.match(build,/trade-offers\.js/);
 assert.doesNotMatch(html,/OnePieceTools\?\.checkAlerts/);
 assert.doesNotMatch(fs.readFileSync(path.join(root,"tools-hub.js"),"utf8"),/watchState|alertsView|data-watch-add/);
});
test("Recommendations and matchup coach are placed in Mazos and Torneos",()=>{
 assert.match(html,/id="openDeckCompletion"/);
 assert.match(html,/OnePieceTools\?\.decksView/);
 const tournament=fs.readFileSync(path.join(root,"tournaments.js"),"utf8");
 assert.match(tournament,/id="tourneyCoachOpen"/);
 assert.match(tournament,/OnePieceTools\?\.coachView/);
 assert.match(fs.readFileSync(path.join(root,"tools-hub.js"),"utf8"),/tools-leader-grid/);
});
