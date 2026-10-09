import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const source=fs.readFileSync(path.join(root,"trade-offers.js"),"utf8");
const sql=fs.readFileSync(path.join(root,"supabase/migrations/20261009_trade_user_autocomplete.sql"),"utf8");
const original=fs.readFileSync(path.join(root,"supabase/migrations/20261009_mutual_trade_offers.sql"),"utf8");
function setup(have){
 const uid="11111111-1111-1111-1111-111111111111";
 const peer="22222222-2222-2222-2222-222222222222";
 const rows=[{id:"a1",maker_id:peer,taker_id:uid,maker_label:"Uno",taker_label:"Dos",status:"pending",
  offered:[{id:"OP01-001_p1",q:2}],requested:[{id:"OP02-002_p1",q:2}],created_at:"2026-10-09T00:00:00Z"}];
 const state={tab:"trades",user:{id:uid},collectionReady:true,cards:[],owned:{"OP02-002_p1":have}};
 const calls=[];
 const sb={
  from(table){
   if(table==="trade_offers")return {select(){return {order(){return {limit:async()=>({data:rows,error:null})}}}}};
   if(table==="collection_items")return {select(){return {
    eq(){return {in:async()=>({data:[{card_id:"OP02-002_p1",quantity:have}],error:null})}}
   }}};
   throw Error("Unknown "+table);
  },
  rpc:async(name,args)=>{calls.push({name,args});return {data:[],error:null}}
 };
 state.sb=sb;
 let handler=null;
 const btn={dataset:{id:"a1",tradeAct:"accept"},onclick:null};
 const document={createElement:()=>({textContent:""}),head:{appendChild:()=>{}},
  querySelector:()=>null,querySelectorAll:q=>q==="[data-trade-act]"?[btn]:[],
  addEventListener:()=>{}};
 const context={window:{OnePieceTools:{tradeItems:()=>[[],[]]}},state,document,
  esc:x=>String(x),card:()=>null,cardImg:c=>'<img data-card="'+c.id+'">',
  priceOf:()=>null,money:n=>String(n),qty:id=>state.owned[id]||0,
  renderShell:()=>{},notify:()=>{},console,
  setTimeout:()=>1,clearTimeout:()=>{},confirm:()=>true,
  loadCollectionFromCloud:async()=>{},Date};
 vm.runInNewContext(source,context,{timeout:2000});
 return {module:context.window.TradeOffers,state,calls,btn,rows};
}
test("Trade views show exact print images even if card isn't in the cached catalogue",async()=>{
 const {module}=setup(0);await module.load(true);
 const page=module.view();
 assert.match(page,/img data-card="OP01-001_p1"/);
 assert.match(page,/img data-card="OP02-002_p1"/);
 assert.match(page,/OP02-002_p1/);
});
test("Accept button is disabled and explains the missing exact-print quantity",async()=>{
 const {module}=setup(1);await module.load(true);
 const page=module.view();
 assert.match(page,/No tienes suficientes cartas/);
 assert.match(page,/OP02-002_p1 \(1\/2\)/);
 assert.match(page,/data-trade-act="accept"[^>]+disabled/);
});
test("Accept button becomes available when the account owns all required copies",async()=>{
 const {module}=setup(2);await module.load(true);
 const page=module.view(),tag=page.match(/<button[^>]+data-trade-act="accept"[^>]+>/)?.[0];
 assert.ok(tag);
 assert.doesNotMatch(tag,/disabled/);
});
test("An outdated client cannot accept: fresh server inventory check stops RPC",async()=>{
 const {module,state,calls,btn}=setup(1);
 await module.load(true);
 state.owned["OP02-002_p1"]=3; // cached view says enough; DB says only one.
 module.bind();
 assert.equal(typeof btn.onclick,"function");
 await btn.onclick();
 assert.equal(calls.filter(x=>x.name==="trade_offer_decide").length,0);
});
test("Autocomplete is restricted to authenticated user profiles and never exposes emails",()=>{
 assert.match(sql,/returns table\(username text,display_name text\)/);
 assert.match(sql,/limit 8/);
 assert.match(sql,/p\.id<>uid/);
 assert.match(sql,/revoke all on function public\.trade_search_users\(text\) from public,anon/);
 assert.doesNotMatch(sql,/select .*email/);
 assert.match(source,/trade_search_users/);
 assert.match(source,/data-trade-username/);
 assert.match(source,/setTimeout\(async/);
});
test("Database still authorizes mutual acceptance and transfers inventory atomically",()=>{
 assert.match(original,/if uid<>off\.taker_id then raise exception/);
 assert.match(original,/if not off\.maker_accepted then raise exception/);
 assert.match(original,/and quantity>=n/);
 assert.match(original,/if not found then raise exception 'El destinatario ya no tiene suficientes copias/);
 assert.match(original,/update public\.trade_offers set taker_accepted=true,status='completed'/);
});
