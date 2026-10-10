import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=readFileSync(new URL("../tools-hub.js",import.meta.url),"utf8");
const start=source.indexOf("function uniqueLeaderRecommendations(rows){");
const end=source.indexOf("function decksView(){",start);
assert.ok(start>=0&&end>start,"Missing leader dedupe helper");
const printed=id=>String(id||"").replace(/_(?:p|r|c)\d+$/i,"").toUpperCase();
const {uniqueLeaderRecommendations}=runInNewContext(source.slice(start,end)+"\n({uniqueLeaderRecommendations})",{printed});
const row=(leaderId,absent,fit,i)=>({r:{leaderId},m:{absent},fit:{score:fit},i});
test("Puedo completar selects the fewest missing copies per leader",()=>{
 const list=[row("OP05-060_p1",0,1,4),row("OP05-060",3,1,0),row("OP07-079",1,1,2),row("OP01-001",2,1,3)].sort((a,b)=>a.m.absent-b.m.absent);
 const unique=uniqueLeaderRecommendations(list);
 assert.deepEqual(Array.from(unique,x=>x.i),[4,2,3]);
 assert.equal(list.length,4);
});
test("Para mí keeps the best personal score per leader",()=>{
 const list=[row("OP05-060",15,72,1),row("OP05-060_p1",2,95,8),row("OP07-079",3,88,6),row("OP01-001",7,80,2)].sort((a,b)=>b.fit.score-a.fit.score);
 const unique=uniqueLeaderRecommendations(list);
 assert.deepEqual(Array.from(unique,x=>x.i),[8,6,2]);
 assert.equal(new Set(unique.map(x=>printed(x.r.leaderId))).size,unique.length);
});
test("Unknown leader IDs are skipped and originals remain unchanged",()=>{
 const input=[row("",0,100,0),row("OP05-060",1,20,1),row("OP05-060",0,30,2),row("OP09-061",3,5,3)];
 assert.deepEqual(Array.from(uniqueLeaderRecommendations(input),x=>x.i),[1,3]);
 assert.equal(input.length,4);
});
test("Dedupe is applied after filtering and sorting without breaking Preview or Compare",()=>{
 assert.match(source,/rows=uniqueLeaderRecommendations\(rows\);\s*body=/);
 assert.match(source,/rows=rows\.filter\(x=>x\.m\.absent<=maximum/);
 assert.match(source,/rows\.sort\(\(a,b\)=>b\.fit\.score-a\.fit\.score/);
 assert.match(source,/data-tools-preview/);
 assert.match(source,/data-tools-compare/);
});
