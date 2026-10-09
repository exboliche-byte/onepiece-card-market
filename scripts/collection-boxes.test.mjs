import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const root=new URL("../",import.meta.url),read=f=>fs.readFileSync(new URL(f,root),"utf8");
const boxes=read("collection-boxes.js"),wants=read("wants.js"),html=read("index.html"),sql=read("supabase/migrations/20261009_collection_boxes.sql");

test("Collection boxes and two-step Wants screens load syntactically",()=>{
 assert.doesNotThrow(()=>new vm.Script(boxes));
 assert.doesNotThrow(()=>new vm.Script(wants));
 assert.match(html,/src="\/collection-boxes\.js"/);
 assert.match(html,/id="openCollectionBoxes"/);
 assert.match(html,/window\.CollectionBoxes\?\.bind/);
 assert.match(wants,/id="wantsBackToLists"/);
 assert.match(wants,/wants-list-directory/);
 assert.match(wants,/window\.openCardmarketWantsModal/);
 assert.match(html,/window\.openCardmarketWantsModal=openCardmarketWantsModal/);
});
test("Heart buttons are compact and contain no distracting labels",()=>{
 const all=html.split("\n").filter(line=>line.includes('data-want="'));
 // The deck's leader and regular cards reuse a single heart renderer.
 assert.ok(all.length>=5);
 assert.match(html,/deckCollectionWantActions\(display\.id,l\.id,1\)/);
 assert.match(html,/deckCollectionWantActions\(display\.id,source\.id,need\)/);
 assert.match(html,/deck-owned-actions\{display:grid;grid-template-columns:minmax\(0,2fr\) minmax\(0,1fr\)/);
 for(const line of all){
  assert.match(line,/aria-label="Añadir a mis wants"/);
  assert.match(line,/>💛<\/button>/);
  assert.doesNotMatch(line,/>💛 Añadir|>💛 A wants/);
 }
 assert.match(html,/button\[data-want\]/);
 assert.match(html,/width:36px!important/);
});
test("Every box is account-private and membership is per box and print, not per user and print",()=>{
 assert.match(sql,/alter table public\.user_collection_boxes enable row level security/i);
 assert.match(sql,/alter table public\.user_collection_box_cards enable row level security/i);
 assert.match(sql,/primary key\(box_id,card_id\)/i);
 assert.match(sql,/foreign key\(user_id,box_id\)/i);
 assert.match(sql,/owned\.card_id=public\.user_collection_box_cards\.card_id/);
 assert.doesNotMatch(sql,/UPDATE public\.collection_items|DELETE FROM public\.collection_items/i);
});
test("The same owned printing can belong to two boxes, without increasing ownership",async()=>{
 const printed={id:"OP13-004_p1",name:"Sabo",set:"OP13"};
 const uid="11111111-1111-4111-8111-111111111111";
 const boxesData=[
  {id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Luffy"},
  {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Thriller Bark"}
 ];
 const members=boxesData.map(b=>({box_id:b.id,card_id:printed.id}));
 const from=table=>{
  const q={
   select(){return q},eq(){return q},order(){return q},
   async limit(){return {data:boxesData,error:null}},
   async range(){return {data:members,error:null}}
  };return q;
 };
 const doc={createElement:()=>({}),head:{appendChild:()=>{}},querySelector:()=>null,querySelectorAll:()=>[]};
 const context={window:{},document:doc,
  state:{user:{id:uid},sb:{from},collectionReady:true,tab:"collection",boxesOpen:true,
    owned:{[printed.id]:2},cards:[printed]},
  esc:String,cardImg:()=>"<img>",cardPrintLabel:()=>"OP-13",
  cardExpansionCode:()=>"OP13",priceOf:()=>20,money:n=>String(n),
  norm:x=>String(x).toLowerCase(),notify(){},renderShell(){},console
 };
 vm.runInNewContext(boxes,context);
 await context.window.CollectionBoxes.load();
 assert.equal(context.window.CollectionBoxes.entries(boxesData[0]).length,1);
 assert.equal(context.window.CollectionBoxes.entries(boxesData[1]).length,1);
 assert.equal(context.state.owned[printed.id],2);
 const view=context.window.CollectionBoxes.view();
 assert.match(view,/Luffy/);assert.match(view,/Thriller Bark/);
});
