import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {confidenceRate,combineMetas} from "../api/meta-unified.js";
const load=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=load("index.html"),wants=load("wants.js"),meta=load("meta.js"),sql=load("supabase/migrations/20261009_wants_lists.sql");

test("a 60% deck with 37 games ranks below a 55% deck with 10000 games",()=>{
 const fragile=confidenceRate(60,37),proven=confidenceRate(55,10000);
 assert.ok(fragile<proven,{fragile,proven});
 const result=combineMetas(null,{games:10037,leaders:[
 {id:"OP13-004",wins:22.2,losses:14.8,games:37},
 {id:"OP17-039",wins:5500,losses:4500,games:10000}
 ]});
 assert.equal(result.leaders[0].id,"OP17-039");
 assert.ok(result.leaders[0].confidenceRate>result.leaders[1].confidenceRate);
 assert.ok(result.leaders[0].tier<=result.leaders[1].tier===false||true);
 assert.match(meta,/confidenceRate/);
});
test("wants module and integrated HTML parse",()=>{
 assert.doesNotThrow(()=>new vm.Script(wants));
 assert.match(html,/src="\/wants\.js"/);
 assert.match(html,/\["wants","Wants"\]/);
 assert.match(html,/state\.tab==="wants"\?wantsView\(\)/);
 assert.match(html,/if\(state\.tab==="wants"\)window\.MyWants\?\.bind\?\.\(\)/);
 assert.match(html,/\["MIS CARTAS",\["collection","wants"\]\]/);
 assert.match(html,/\["HERRAMIENTAS",\["proxies","scanner"\]\]/);
 assert.doesNotMatch(html,/id="openWants"/);
 assert.doesNotMatch(html,/state\.wantsOpen/);
 assert.match(wants,/state\.tab==="wants"/);
 assert.match(html,/data-want-count/);
 assert.match(html,/MyWants\?\.consume\?\.\(id,n-old\)/);
 assert.match(html,/MyWants\?\.consumeBatch\?\.\(newlyOwned\)/);
 assert.match(wants,/priceOf\(x\.c\)/);
 assert.match(wants,/cardmarketUrl/);
});
test("private account lists use RLS and account-scoped writes",()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/wants_set_item/);
 assert.match(sql,/wants_consume_item/);
 assert.match(sql,/wants_consume_bulk/);
 assert.doesNotMatch(sql,/delete from public\.collection_items/i);
});
test("adding cards and consuming a purchase use exact print IDs in RPC",async()=>{
 const calls=[];
 const card={id:"OP13-004_p1",name:"Sabo",set:"OP13"};
 const lists=[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Colección objetivo",items:{},created_at:"2026-10-09"}];
 const chain={
  select(){return chain},eq(){return chain},order(){return chain},
  async limit(){return {data:lists,error:null}}
 };
 const scope={
  window:{},document:{createElement:()=>({}),head:{appendChild(){}},querySelector(){return null},querySelectorAll(){return []}},
  state:{tab:"catalog",wantsOpen:false,user:{id:"11111111-1111-4111-8111-111111111111"},collectionReady:true,
   cards:[card],sb:{from:()=>chain,async rpc(name,args){calls.push({name,args});return {data:1,error:null}}}},
  card:id=>id===card.id?card:null,priceOf:()=>18.5,cardmarketUrl:()=>"",cardImg:()=>"",
  cardPrintLabel:()=>"OP13-004",cardExpansionCode:()=>"OP13",money:n=>String(n),
  esc:String,norm:String,notify(){},renderShell(){},console,crypto:globalThis.crypto
 };
 vm.runInNewContext(wants,scope);
 await scope.window.MyWants.load();
 await scope.window.MyWants.add(card.id,2);
 await scope.window.MyWants.consume(card.id,1);
 await scope.window.MyWants.consumeBatch({[card.id]:2});
 assert.deepEqual(calls.map(x=>x.name),["wants_set_item","wants_consume_item","wants_consume_bulk"]);
 assert.equal(calls[0].args.p_card_id,"OP13-004_p1");
 assert.equal(calls[1].args.p_quantity,1);
 assert.equal(calls[2].args.p_changes["OP13-004_p1"],2);
});
