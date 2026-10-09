import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const begin=html.indexOf("function deckDefaultPrinting(g){");
const end=html.indexOf("function deckGroupedTile(g){",begin);
assert.ok(begin>=0&&end>begin);
const cards=[
 {id:"OP05-060_p1",category:"Leader",isParallel:true},
 {id:"OP05-060_r1",category:"Leader"},
 {id:"OP05-060",category:"Leader"},
 {id:"OP05-100_p1",category:"Character",isParallel:true},
 {id:"OP05-100",category:"Character"},
 {id:"OP05-101_p2",category:"Event",isParallel:true},
 {id:"OP05-101",category:"Event"},
 {id:"OP05-102_p1",category:"Stage",isParallel:true},
 {id:"OP05-102",category:"Stage"},
];
const {deckDefaultPrinting}=runInNewContext(html.slice(begin,end)+"\n({deckDefaultPrinting})",{
 state:{cards},
 baseId:id=>id.replace(/_(?:p|r|c)\d+$/i,""),
 variantKindOf:c=>c.id.includes("_p")?"parallel":c.id.includes("_r")?"reprint":"base"
});
test("Every deck-builder group displays the original print rather than parallel or reprint",()=>{
 for(const [code,cat] of [["OP05-060","Leader"],["OP05-100","Character"],["OP05-101","Event"],["OP05-102","Stage"]]){
  const parallel=cards.find(c=>c.id===code+"_p1")||cards.find(c=>c.id===code+"_p2");
  assert.equal(deckDefaultPrinting({card:parallel,versions:[parallel]}).id,code,cat);
 }
});
test("Ordinary cover never substitutes a printing in a different logical card group",()=>{
 const single={id:"EB01-001_p1",category:"Character",isParallel:true};
 assert.equal(deckDefaultPrinting({card:single,versions:[single]}),single);
});
test("The cover is used for image, detail and selected card but original saved print IDs are not touched",()=>{
 assert.match(html,/const c=deckDefaultPrinting\(g\)/);
 assert.match(html,/cardImg\(c,"cardimg"\)/);
 assert.match(html,/data-setleader/);
 assert.match(html,/data-adddeck/);
});
test("Deck pagination updates the correct state field and clamps the page to the number of results",()=>{
 assert.match(html,/if\(k==="deck"\)\{\s*state\.deckPage=Math\.max/);
 assert.match(html,/void renderDeckResults\(\)/);
 assert.match(html,/state\.deckPage=page/);
 assert.match(html,/Math\.ceil\(groups\.length\/PAGE\)/);
 assert.doesNotMatch(html,/state\[k\]\.page=Math\.max\(1,state\[k\]\.page/);
});
