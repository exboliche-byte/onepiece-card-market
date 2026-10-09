import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {status,buildPlayableIndex}=require("../collection-legality.js");
const card=(id,block)=>({id,block});
test("banned exact printings are separated",()=>{
 const idx=buildPlayableIndex([card("OP06-086",2)]);
 assert.equal(status(card("OP06-086_p1",2),idx),"banned");
 assert.equal(status(card("ST10-001",2),idx),"banned");
});
test("Mihawk ban is not activated before October 12 Europe time",()=>{
 const idx=buildPlayableIndex([card("OP14-020",4)]);
 assert.equal(status(card("OP14-020_p1",4),idx,Date.parse("2026-10-11T21:59:59Z")),null);
 assert.equal(status(card("OP14-020_p1",4),idx,Date.parse("2026-10-11T22:00:00Z")),"banned");
});
test("rotation is based on block, with legal reprints enabling all artworks",()=>{
 const rows=[card("OP01-025",1),card("OP02-010",1),card("OP02-010_r1",4),card("OP06-050",2)];
 const idx=buildPlayableIndex(rows);
 assert.equal(status(rows[0],idx),"rotated");
 assert.equal(status(rows[1],idx),null);
 assert.equal(status(rows[2],idx),null);
 assert.equal(status(rows[3],idx),null);
});
test("block X and updated old cards remain playable",()=>{
 const idx=buildPlayableIndex([card("OP01-016",1),card("OP03-044",1)]);
 assert.equal(status(card("OP01-016_p2",1),idx),null);
 assert.equal(status(card("OP03-044",1),idx),null);
});
test("unknown promotions and either card of a banned pair remain visible",()=>{
 const idx=buildPlayableIndex([]);
 assert.equal(status(card("P-001",null),idx),null);
 assert.equal(status(card("OP07-115",2),idx),null);
 assert.equal(status(card("EB04-058",4),idx),null);
 assert.equal(status(card("ST02-004",null),idx),"rotated");
});
test("imported exact print references keep logical legality rules",()=>{
 assert.equal(status(card("OP03-010__csv_ab29_reprint",1),buildPlayableIndex([])),"rotated");
});

test("Official July 2026 exception list keeps older legal starters in Standard",()=>{
 const old=[card("ST01-011",1),card("ST02-007",1),card("ST06-008",1)];
 const idx=buildPlayableIndex(old);
 for(const c of old)assert.equal(status(c,idx),null,c.id);
 assert.equal(status(card("ST02-004",1),idx),"rotated");
});
test("Previously banned cards released in April remain legal if their block is legal",()=>{
 const legal=buildPlayableIndex([card("OP07-045",2),card("EB01-059",2)]);
 assert.equal(status(card("OP07-045",2),legal),null);
 assert.equal(status(card("EB01-059",2),legal),null);
});
test("Archived collection displays prohibited cards first, and uses independent search filters",async()=>{
 const fs=await import("node:fs");
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const sw=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 assert.match(html,/bannedGroup\+rotatedGroup/);
 assert.match(html,/banned\.map\(c=>cardTile/);
 assert.match(html,/visibleRotated\.map\(c=>cardTile/);
 assert.match(html,/function switchCollectionArchiveMode/);
 assert.match(html,/collectionArchiveFilters\?\{/);
 assert.match(sw,/\/collection-legality\.js/);
});
