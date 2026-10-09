import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const from=html.indexOf("function deckProhibitionReason(");
const to=html.indexOf("function importDeckText(",from);
assert.ok(from>0&&to>from,"deck legality helpers exist");
const helpers=html.slice(from,to);
function rules(){
 const legality={
   bannedIds:()=>["OP06-086","ST10-001"],
   bannedPairs:()=>[["EB04-058","OP07-115"]],
   restrictedIds:()=>["OP06-040"]
 };
 const context={window:{OnePieceLegality:legality},baseId:id=>String(id||"").toUpperCase().replace(/_(?:P|R|C)\d+$/,"")};
 vm.runInNewContext(helpers,context,{timeout:1000});
 return context;
}
test("banned cards and all alternate arts cannot be added or imported",()=>{
 const h=rules();
 assert.match(h.deckProhibitionReason("OP06-086_p1",{}),/prohibida/);
 assert.match(h.deckCreationProblem("OP01-001",{"OP06-086_r2":4}),/prohibida/);
 assert.match(h.deckCreationProblem("ST10-001_p1",{}),/prohibida/);
 assert.equal(h.deckCreationProblem("OP01-001",{"OP06-050":4}),"");
});
test("incompatible pairs and dynamically restricted cards are also prevented",()=>{
 const h=rules();
 assert.match(h.deckProhibitionReason("EB04-058",{"OP07-115_p1":2}),/Pareja prohibida/);
 assert.equal(h.deckProhibitionReason("EB04-058",{"OP07-115":0}),"");
 assert.match(h.deckCreationProblem("OP01-001",{"EB04-058":2,"OP07-115":1}),/Pareja prohibida/);
 assert.match(h.deckCreationProblem("OP01-001",{"OP06-040":1,"OP06-040_p1":1}),/restringida/);
});
test("editing, selecting a leader, preview saving and import have real guards",()=>{
 assert.match(html,/if\(Number\(delta\)>0\)\{\s*const prohibited=deckProhibitionReason\(id,d\.cards\)/);
 assert.match(html,/function setLeader\(id\)[\s\S]{0,250}deckProhibitionReason\(id,d\.cards\)/);
 assert.match(html,/function renderDeckResults\(\)[\s\S]{0,390}state\.cards\.filter\(c=>!deckProhibitionReason\(c\.id,d\.cards\)\)/);
 assert.match(html,/function importDeckText\([\s\S]{0,1400}deckCreationProblem\(leader,cards\)/);
 assert.match(html,/function validateDeckBackup\([\s\S]{0,1700}deckCreationProblem\(leader,copyCounts\)/);
 assert.match(html,/function saveCompetitiveDraft\([\s\S]{0,360}deckCreationProblem\(d\.leader,d\.cards\)/);
 assert.match(html,/function syncDeck\([\s\S]{0,470}deckCreationProblem\(d\.leader,d\.cards\)/);
 assert.match(html,/messages\.push\("Líder "\+baseId\(d\.leader\)\+" prohibido"\)/);
});
test("collection archive no longer shows explanations or regulation links",()=>{
 const a=html.indexOf("if(state.collectionArchivedOpen)return");
 const b=html.indexOf("return '<div class=\\"wrap collection-top\\"><div class=\\"hero collection-title-row\\">",a);
 assert.ok(a>=0&&b>a);
 const area=html.slice(a,b);
 assert.doesNotMatch(area,/Las prohibidas aparecen|Las reglas se sincronizan|Standard: bloque mínimo|Prohibiciones oficiales|Rotación oficial|collection-archive-note/);
 assert.match(area,/collectionViewNav\("archived"\)/);
});
