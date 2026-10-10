import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const src=fs.readFileSync(new URL("../wants-archive-cache.js",import.meta.url),"utf8");
function setup(){
 const store=new Map(),fakeStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>{store.set(k,v)}};
 const scope={window:{localStorage:fakeStorage},Date,console,module:{exports:{}}};
 vm.runInNewContext(src,scope);
 return {api:scope.module.exports,store};
}
test("reuses historical deck results after a new page load, without any user collection data",async()=>{
 const a=setup(),cards={"OP17-001":4},input={decks:[{leaderId:"OP17-099",cards,id:"deck1",name:"Public",source:"Limitless",player:"Private",record:{wins:12},sourceUrl:"https://example.com"}],notes:["Limitless: 2 páginas"]};
 const saved=await a.api.save(input);
 assert.ok(saved?.savedAt>0);
 assert.equal(saved.decks[0].player,undefined);
 assert.equal(saved.decks[0].record,undefined);
 const b=setup();for(const [k,v] of a.store)b.store.set(k,v);
 const loaded=await b.api.load();
 assert.equal(loaded.decks[0].leaderId,"OP17-099");
 assert.equal(loaded.decks[0].cards["OP17-001"],4);
 assert.equal(loaded.notes[0],"Limitless: 2 páginas");
});
test("an unavailable cache never prevents the UI from calculating new results",async()=>{
 const a=setup();
 assert.equal(await a.api.load(),null);
 assert.equal(await a.api.save({decks:[]}),null);
});
test("cache script is present in production bundle before wants.js",()=>{
 const build=fs.readFileSync(new URL("./vercel-build.sh",import.meta.url),"utf8");
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(build,/wants-archive-cache\.js/);
 assert.match(html,/src="\/wants-archive-cache\.js"/);
 assert.ok(html.indexOf("/wants-archive-cache.js")<html.indexOf("/wants.js"));
});
