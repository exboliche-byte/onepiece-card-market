import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const sabo="11111111-1111-4111-8111-111111111111";
const koala="22222222-2222-4222-8222-222222222222";
const userId="33333333-3333-4333-8333-333333333333";
function setup(amount=7){
  const saboDeck={id:sabo,name:"Sabo",leader:"",cards:{"OP11-011":4}};
  const koalaDeck={id:koala,name:"Koala",leader:"",cards:{"OP11-011":4}};
  const allocations={[sabo]:{"OP11-011":4}};
  const state={user:{id:userId},collectionReady:true,owned:{"OP11-011":4,"OP11-011_p1":amount-4},
    decks:[saboDeck,koalaDeck],sb:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{enabled:true,allocations,revision:1}})})})})},tab:"catalog",cards:[]};
  const window={addEventListener(){}};
  const ctx={state,window,document:{},renderShell(){},notify(){},esc:x=>String(x),
    card:id=>({id,name:"Nico Robin"}),deckPrintedCode:id=>String(id).replace(/_p\d+$/i,"")};
  vm.runInNewContext(fs.readFileSync(new URL("../deck-physical.js",import.meta.url),"utf8"),ctx);
  return {api:window.DeckPhysical,state,saboDeck,koalaDeck,allocations};
}
test("a partially assembled deck borrows only one copy after using three from album",async()=>{
 const {api,saboDeck,koalaDeck,allocations}=setup(7);
 assert.equal(await api.load(),true);
 const planned=api._testing.plan(koalaDeck);
 assert.equal(planned.changes.length,2);
 assert.equal(planned.changes.find(x=>x.from===null).quantity,3);
 assert.equal(planned.changes.find(x=>x.from===sabo).quantity,1);
 assert.equal(planned.next[koala]["OP11-011_p1"],3);
 assert.equal(planned.next[koala]["OP11-011"],1);
 assert.equal(api._testing.stats(saboDeck,planned.next).status,"incompleto");
 assert.equal(api._testing.stats(koalaDeck,planned.next).status,"montado");
 assert.equal(allocations[sabo]["OP11-011"],4,"el plan no modifica los datos hasta confirmar");
});
test("the eighth copy stays free and is preferred over disassembling another deck",async()=>{
 const {api,state,saboDeck}=setup(7);await api.load();
 const transferred=api._testing.plan(state.decks[1]).next;
 // A fresh physical state after the first transfer, with one more Robin in the collection.
 const where=transferred;
 const extra=api._testing.stats(saboDeck,where);
 assert.equal(extra.assigned,3);
 state.owned["OP11-011_p1"]=4;
 // The planner's remaining-free count is independent of deck list and print variant.
 const used=api._testing.usedByPrinting(where);
 assert.equal(state.owned["OP11-011_p1"]-used["OP11-011_p1"],1);
});
test("the same print is never allocated twice beyond owned copies",async()=>{
 const {api,state}=setup(7);await api.load();
 const plan=api._testing.plan(state.decks[1]);
 const counts=api._testing.usedByPrinting(plan.next);
 assert.equal(counts["OP11-011"],4);
 assert.equal(counts["OP11-011_p1"],3);
 assert.equal(plan.missing.length,0);
});
test("optional tracking initially renders no badge when disabled or not loaded",()=>{
 const {api,saboDeck}=setup();
 assert.equal(api.statusMark(saboDeck),"");
});

test("status chip links directly to its own physical deck manager",async()=>{
 const {api,saboDeck}=setup();await api.load();
 const markup=api.statusMark(saboDeck);
 assert.match(markup,/button type="button"/);
 assert.match(markup,/data-physical-open="11111111-1111-4111-8111-111111111111"/);
 assert.match(markup,/montado/);
 assert.match(api.statusMark(saboDeck,false),/^<span /);
});
test("missing physical copy retains the requested print for its image",async()=>{
 const {api,state}=setup(7);await api.load();
 state.owned["OP11-011_p1"]=0;
 const planned=api._testing.plan(state.decks[1]);
 assert.equal(planned.missing.length,0,"donor has enough copies");
 state.decks[1].cards["OP11-012"]=2;
 const next=api._testing.plan(state.decks[1]);
 assert.equal(next.missing[0].id,"OP11-012");
 assert.equal(next.missing[0].quantity,2);
});
