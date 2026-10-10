import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const sabo="11111111-1111-4111-8111-111111111111";
const koala="22222222-2222-4222-8222-222222222222";
const userId="33333333-3333-4333-8333-333333333333";
function setup(amount=7,deckModifiedAt={}){
  const saboDeck={id:sabo,name:"Sabo",leader:"",cards:{"OP11-011":4}};
  const koalaDeck={id:koala,name:"Koala",leader:"",cards:{"OP11-011":4}};
  const allocations={[sabo]:{"OP11-011":4}};
  const state={user:{id:userId},collectionReady:true,owned:{"OP11-011":4,"OP11-011_p1":amount-4},
    decks:[saboDeck,koalaDeck],sb:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{enabled:true,allocations,deck_modified_at:deckModifiedAt,revision:1}})})})})},tab:"catalog",cards:[]};
  const window={addEventListener(){}};
  const document={};
  const ctx={state,window,document,renderShell(){},notify(){},esc:x=>String(x),
    card:id=>({id,name:"Nico Robin"}),cardImg:c=>'<img src="'+c.id+'">',
    deckPrintedCode:id=>String(id).replace(/_p\d+$/i,"")};
  vm.runInNewContext(fs.readFileSync(new URL("../deck-physical.js",import.meta.url),"utf8"),ctx);
  return {api:window.DeckPhysical,state,saboDeck,koalaDeck,allocations,document};
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

test("pending only includes partly assembled decks, never deliberately unmounted boxes",async()=>{
 const {api,state,saboDeck}=setup(7);await api.load();
 assert.equal(api._testing.pendingCards().length,0,"Koala is deliberately unmounted");
 state.decks.push({id:"44444444-4444-4444-8444-444444444444",name:"Sin montar",leader:"",cards:{"OP11-011":4}});
 const raw={[sabo]:{"OP11-011":4},[koala]:{"OP11-011_p1":2}};
 const pending=api._testing.pendingCards(raw);
 assert.equal(pending.length,1);
 assert.equal(pending[0].missing,1);
 assert.equal(pending[0].free,1);
 assert.equal(pending[0].required,2);
 assert.equal(pending[0].decks[0].name,"Koala");
 assert.equal(api._testing.stats(saboDeck,raw).status,"montado");
});
test("missing quantities add up across incomplete decks without using mounted copies",async()=>{
 const {api,state}=setup(7);await api.load();
 const luffy="55555555-5555-4555-8555-555555555555";
 state.decks.push({id:luffy,name:"Luffy",leader:"",cards:{"OP11-011":4}});
 const raw={[sabo]:{"OP11-011":4},[koala]:{"OP11-011_p1":1},[luffy]:{"OP11-011_p1":1}};
 const pending=api._testing.pendingCards(raw);
 assert.equal(pending.length,1);
 assert.equal(pending[0].required,6);
 assert.equal(pending[0].free,1);
 assert.equal(pending[0].missing,5);
 assert.equal(pending[0].decks.length,2);
});
test("pending and deactivate buttons appear only when tracking is active",async()=>{
 const {api,state}=setup(7);
 assert.equal(api.pendingButton(),"");
 assert.equal(api.activeTrackingButton(),"");
 await api.load();
 assert.match(api.pendingButton(),/data-physical-pending/);
 assert.match(api.activeTrackingButton(),/data-physical-toggle/);
 state.collectionReady=false;
 assert.equal(api.pendingButton(),"");
});

test("prefer taking all four Sanjis from Sabo rather than splitting between Sabo and Buffy",async()=>{
 const {api,state,koalaDeck,allocations}=setup(6);
 const buffy="44444444-4444-4444-8444-444444444444";
 state.decks.push({id:buffy,name:"Buffy",leader:"",cards:{"OP11-011":2}});
 allocations[buffy]={"OP11-011_p1":2};
 await api.load();
 const planned=api._testing.plan(koalaDeck);
 assert.equal(planned.changes.length,1);
 assert.equal(planned.changes[0].from,sabo);
 assert.equal(planned.changes[0].quantity,4);
 assert.equal(planned.next[koala]["OP11-011"],4);
 assert.equal(planned.next[buffy]["OP11-011_p1"],2,"Buffy remains fully mounted");
 assert.equal(planned.next[sabo],undefined,"Sabo provides its whole playset");
});
test("prefer one donor covering the remainder even when a smaller donor is incomplete",async()=>{
 const {api,state,koalaDeck,allocations}=setup(6);
 const buffy="44444444-4444-4444-8444-444444444444";
 state.decks.push({id:buffy,name:"Buffy",leader:"",cards:{"OP11-011":4}});
 allocations[buffy]={"OP11-011_p1":2};
 await api.load();
 const planned=api._testing.plan(koalaDeck);
 assert.equal(planned.changes.length,1);
 assert.equal(planned.changes[0].from,sabo);
 assert.equal(planned.changes[0].quantity,4);
});
test("use the largest partial donor first when no box covers the shortage",async()=>{
 const {api,state,koalaDeck,allocations}=setup(5);
 const buffy="44444444-4444-4444-8444-444444444444";
 state.owned["OP11-011"]=3;
 state.owned["OP11-011_p1"]=2;
 state.decks.push({id:buffy,name:"Buffy",leader:"",cards:{"OP11-011":2}});
 allocations[sabo]={"OP11-011":3};
 allocations[buffy]={"OP11-011_p1":2};
 await api.load();
 const planned=api._testing.plan(koalaDeck);
 assert.equal(planned.changes.length,2);
 assert.equal(planned.changes[0].from,sabo);
 assert.equal(planned.changes[0].quantity,3);
 assert.equal(planned.changes[1].from,buffy);
 assert.equal(planned.changes[1].quantity,1);
});
test("show all free album movements before donor movements, regardless of card order",async()=>{
 const {api,state,koalaDeck}=setup(7);
 state.owned["OP11-012"]=1;
 koalaDeck.cards={"OP11-011":4,"OP11-012":1};
 await api.load();
 const planned=api._testing.plan(koalaDeck);
 assert.equal(planned.changes.length,3);
 const display=api._testing.orderedMovements(planned.changes);
 assert.equal(display[0].from,null);
 assert.equal(display[1].from,null);
 assert.equal(display[2].from,sabo);
 assert.equal(display[2].quantity,1);
 assert.equal(planned.changes[1].from,sabo,"display order must not change calculation or confirmation");
});

test("two full partial donors beat a fragmented transfer across three boxes",async()=>{
 const {api,state,koalaDeck,allocations}=setup(5);
 const buffy="44444444-4444-4444-8444-444444444444";
 const luffy="55555555-5555-4555-8555-555555555555";
 state.owned={"OP11-011":2,"OP11-011_p1":2,"OP11-011_p2":1};
 state.decks[0].cards={"OP11-011":2};
 state.decks.push(
  {id:buffy,name:"Buffy",leader:"",cards:{"OP11-011":2}},
  {id:luffy,name:"Luffy",leader:"",cards:{"OP11-011":4}}
 );
 allocations[sabo]={"OP11-011":2};
 allocations[buffy]={"OP11-011_p1":2};
 allocations[luffy]={"OP11-011_p2":1};
 await api.load();
 const planned=api._testing.plan(koalaDeck);
 assert.equal(planned.changes.length,2);
 assert.equal(planned.changes.reduce((sum,x)=>sum+x.quantity,0),4);
 assert.equal(planned.changes.some(x=>x.from===luffy),false,"avoid touching a third box with only one copy");
 assert.equal(planned.next[luffy]["OP11-011_p2"],1);
});

test("both deck list changes and physical changes influence most-recent-first ordering",async()=>{
 const physicalDates={[sabo]:"2026-10-10T13:00:00.000Z"};
 const {api,state,saboDeck,koalaDeck}=setup(7,physicalDates);
 saboDeck.updatedAt="2026-10-08T10:00:00.000Z";
 koalaDeck.updatedAt="2026-10-10T12:00:00.000Z";
 assert.deepEqual(api.sortDecks(state.decks).map(d=>d.id),[koala,sabo],
  "before loading locations, sort by saved list edit dates");
 await api.load();
 assert.deepEqual(api.sortDecks(state.decks).map(d=>d.id),[sabo,koala],
  "physical edit newer than list edit wins");
 assert.equal(state.decks[0],saboDeck,"sorting must not mutate saved array");
 koalaDeck.updatedAt="2026-10-10T14:00:00.000Z";
 assert.deepEqual(api.sortDecks(state.decks).map(d=>d.id),[koala,sabo],
  "a new list edit moves the deck back to the top");
});
test("moving physical copies updates the recipient and every donor, not list timestamps",async()=>{
 const {api,state,document,saboDeck,koalaDeck}=setup(7);
 saboDeck.updatedAt="2026-10-08T10:00:00.000Z";
 koalaDeck.updatedAt="2026-10-09T10:00:00.000Z";
 await api.load();
 const listeners=new Map();
 const modal={innerHTML:"",className:"",addEventListener(){},remove(){},
   querySelector:selector=>({addEventListener:(_event,listener)=>listeners.set(selector,listener)}),
   querySelectorAll:()=>[]};
 document.createElement=()=>modal;
 document.body={appendChild(){}};
 const writes=[];
 state.sb={from:()=>({
   update(payload){writes.push(payload);return this},
   eq(){return this},select(){return this},
   maybeSingle:async()=>({data:{revision:2},error:null})
 })};
 await api.open(koala);
 listeners.get("[data-physical-plan]")();
 await listeners.get("[data-physical-apply]")();
 assert.equal(writes.length,1);
 const modified=writes[0].deck_modified_at;
 assert.ok(modified[sabo],"source deck changed");
 assert.ok(modified[koala],"recipient deck changed");
 assert.equal(modified[sabo],modified[koala],"one movement saves a shared timestamp");
 assert.ok(Number.isFinite(Date.parse(modified[sabo])));
 assert.equal(saboDeck.updatedAt,"2026-10-08T10:00:00.000Z");
 assert.equal(koalaDeck.updatedAt,"2026-10-09T10:00:00.000Z");
 assert.deepEqual(api.sortDecks(state.decks).map(d=>d.id),[koala,sabo],
  "the latest physical changes sort above the old list timestamps");
});
test("physical date sanitization ignores invalid per-deck data",()=>{
 const {api}=setup();
 const clean=api._testing.sanitizeDeckDates({
  [sabo]:"2026-10-10T09:00:00.000Z",
  invalid:"2026-10-10T09:00:00.000Z",
  [koala]:"not a date"
 });
 assert.deepEqual(Object.keys(clean),[sabo]);
 assert.equal(clean[sabo],"2026-10-10T09:00:00.000Z");
});
