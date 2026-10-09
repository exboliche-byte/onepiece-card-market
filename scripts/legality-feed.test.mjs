import test from "node:test";
import assert from "node:assert/strict";
import {parseBandai} from "./update-legality.mjs";
const row=ids=>ids.map(id=>"<li><a href='/cards'>"+id+" Name</a></li>").join("");
const bans=["OP06-047","OP03-040","OP06-086","ST10-001","OP06-116"];
const main="<h3>Cards with Active Restrictions</h3><h4>Banned Cards</h4>"+row(bans)+
"<h4>Restricted Cards</h4>There are currently no cards in this category."+
"<h4>Banned Pair Cards</h4>"+row(["OP07-115","EB04-058","OP11-040","OP11-067","OP11-040","OP08-069"])+"<h3>History</h3>";
const block="<h3>Cards Generally Permitted in Standard Regulation</h3>"+
row(["EB01-006","EB02-061","EB03-061","EB04-044","OP01-016","OP01-120","OP02-013","OP03-122","OP04-083","OP05-069","OP05-074","OP05-119"])+
"<h3>Cards Eligible for Use Under Block Number ④</h3>"+
row(["OP01-039","OP02-005","ST01-011","ST02-007","ST06-008","OP03-044","OP04-016","OP04-077","OP04-096"])+
"<h3>Updated Block Number and cards that have been reprinted</h3>";
test("Bandai active bans and all three distinct pairs are extracted",()=>{
 const rules=parseBandai(main,block,{updatedAt:"2026-10-09",scheduledBans:[]});
 assert.deepEqual(rules.banned,[...bans].sort());
 assert.deepEqual(rules.bannedPairs,[["EB04-058","OP07-115"],["OP08-069","OP11-040"],["OP11-040","OP11-067"]]);
 assert.equal(rules.blockExceptions["OP01-016"],"X");
 assert.equal(rules.blockExceptions["ST02-007"],4);
});
test("future Mihawk ban gets activated later and removed once listed officially",()=>{
 const prev={scheduledBans:[{id:"OP14-020",effectiveAt:"2026-10-12T00:00:00+02:00"}]};
 assert.equal(parseBandai(main,block,prev).scheduledBans.length,1);
 assert.deepEqual(parseBandai(main.replace("OP06-047","OP14-020"),block,prev).scheduledBans,[]);
});
test("a damaged official page cannot erase the last list",()=>{
 assert.throws(()=>parseBandai("Offline","",{}),/parser/);
 assert.throws(()=>parseBandai(main.replace(/OP\d{2}-\d{3}/g,"BAD"),block,{}),/parser/);
 assert.throws(()=>parseBandai(main,block,{blockExceptions:Object.fromEntries(Array.from({length:100},(_,i)=>["P-"+String(i).padStart(3,"0"),4]))}),/parser/);
});
