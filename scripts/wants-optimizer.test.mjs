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
