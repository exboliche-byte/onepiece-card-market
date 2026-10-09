import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const begin=html.indexOf("function deckLeaderStandardPrinting(g){");
const end=html.indexOf("function deckGroupedTile(g){",begin);
assert.ok(begin>=0&&end>begin);
const base={id:"OP05-060",category:"Leader",name:"Luffy"};
const parallel={id:"OP05-060_p1",category:"Leader",name:"Luffy",isParallel:true};
const reprint={id:"OP05-060_r1",category:"Leader",name:"Luffy"};
const common={id:"OP05-100_p1",category:"Character"};
const {deckLeaderStandardPrinting}=runInNewContext(html.slice(begin,end)+"\n({deckLeaderStandardPrinting})",{
 state:{cards:[parallel,reprint,base,common]},
 deckPrintedCode:c=>String(c.id).replace(/_(?:p|r|c)\d+$/i,"")
});
test("The builder picks the normal leader even when parallel is first",()=>{
 const group={card:parallel,versions:[parallel,reprint,base]};
 assert.equal(deckLeaderStandardPrinting(group).id,"OP05-060");
});
test("The normal leader remains the cover when it was filtered out of the visible variants",()=>{
 const group={card:parallel,versions:[parallel]};
 assert.equal(deckLeaderStandardPrinting(group).id,"OP05-060");
});
test("Other types of cards retain their precise existing cover",()=>{
 assert.equal(deckLeaderStandardPrinting({card:common,versions:[common]}),common);
});
test("The deck builder uses the selected normal print for image, detail and leader assignment",()=>{
 assert.match(html,/const c=deckLeaderStandardPrinting\(g\)/);
 assert.match(html,/data-detail/);
 assert.match(html,/data-setleader/);
});
