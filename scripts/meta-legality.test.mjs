import test from "node:test";
import assert from "node:assert/strict";
import {cardPlayable,deckPlayable,sanitizeMeta,minimumBlock,currentLegalitySnapshot as rules} from "../api/standard-legality.js";
const now=Date.parse("2026-10-09T12:00:00+02:00");
test("rotated or banned leaders cannot appear in current Standard",()=>{
 assert.equal(minimumBlock(now),2);
 assert.equal(cardPlayable("OP01-001",rules,now),false);
 assert.equal(cardPlayable("ST10-001",rules,now),false);
 assert.equal(cardPlayable("OP05-060",rules,now),true);
 assert.equal(cardPlayable("OP01-016",rules,now),true);
 assert.equal(cardPlayable("OP14-020",rules,now),true);
 assert.equal(cardPlayable("OP14-020",rules,Date.parse("2026-10-12T00:00:00+02:00")),false);
});
test("list legality rejects banned cards, rotated cards, illegal combinations and restricted copies",()=>{
 const base={"OP09-002":4,"OP07-115":2};
 assert.equal(deckPlayable("OP05-060",base,rules,now),true);
 assert.equal(deckPlayable("OP05-060",{...base,"OP06-086":1},rules,now),false);
 assert.equal(deckPlayable("OP05-060",{...base,"OP01-005":1},rules,now),false);
 assert.equal(deckPlayable("OP05-060",{...base,"EB04-058":2},rules,now),false);
 assert.equal(deckPlayable("ST10-001",base,rules,now),false);
});
test("tier list and matchups discard non-playable leaders without changing W/R samples",()=>{
 const d={games:60,leaders:[{id:"OP01-001",games:20},{id:"OP05-060",games:20},{id:"ST10-001",games:20}],
 matchups:[{leader:"OP05-060",opponent:"OP01-001",games:10},{leader:"OP05-060",opponent:"OP05-060",games:10}]};
 const v=sanitizeMeta(d,rules,now);
 assert.deepEqual(v.leaders.map(x=>x.id),["OP05-060"]);
 assert.deepEqual(v.matchups.map(x=>x.opponent),["OP05-060"]);
 assert.equal(v.leaders[0].games,20);
});
