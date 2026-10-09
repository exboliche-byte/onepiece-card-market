import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {combineMetas} from "../api/meta-unified.js";
import {extractOPlayMatchups} from "../api/meta-comparison.js";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("meta.js"),prep=read("tournament-prep.js");

test("real matchup pairs are parsed from escaped OPlay flight JSON without duplication",()=>{
 const sample=String.raw`<script>self.__next_f.push([1,"{\"g\":300,\"l\":\"OP13-004\",\"m\":[{\"g\":20,\"o\":\"OP17-039\",\"w\":13,\"gf\":8,\"wf\":5},{\"g\":11,\"o\":\"OP17-058\",\"w\":4}]}"])</script>`;
 const out=extractOPlayMatchups(sample);
 assert.equal(out.length,2);
 const row=out.find(x=>x.opponent==="OP17-039");
 assert.equal(row.games,20);assert.equal(row.wins,13);
 assert.deepEqual(row.first,{wins:5,losses:3,games:8});
 assert.deepEqual(row.second,{wins:8,losses:4,games:12});
});

test("unified leader and matchup totals retain real counts but weight the two WR sources",()=>{
 const t={days:90,formatUsed:"OP17",games:100,eligibleEvents:20,includedEvents:12,
  leaders:[{id:"OP13-004",wins:24,losses:16,games:40},{id:"OP17-039",wins:4,losses:6,games:10}],
  matchups:[{leader:"OP13-004",opponent:"OP17-039",games:12,wins:8,losses:4}]};
 const s={games:500,measuredAt:"2026-10-06",leaders:[{id:"OP13-004",wins:20,losses:80,games:100,firstRate:40,secondRate:25,firstGames:50,secondGames:50},
 {id:"OP17-039",wins:30,losses:20,games:50},{id:"OP17-058",wins:70,losses:30,games:100}],
 matchups:[{leader:"OP13-004",opponent:"OP17-039",games:100,wins:45,losses:55,first:{games:40,wins:20,losses:20},second:{games:60,wins:25,losses:35}}]};
 const d=combineMetas(t,s);
 assert.equal(d.source,"Unified");
 assert.equal(d.leaders.length,3);
 const sabo=d.leaders.find(x=>x.id==="OP13-004");
 assert.equal(sabo.games,140);
 assert.equal(sabo.wins,44);assert.equal(sabo.losses,96);
 assert.ok(sabo.rate>20&&sabo.rate<60,"confidence-weighted WR");
 assert.equal(sabo.firstGames,50);assert.equal(sabo.secondGames,50);
 const r=d.matchups.find(x=>x.leader==="OP13-004"&&x.opponent==="OP17-039");
 assert.equal(r.games,112);assert.equal(r.wins,53);
 assert.equal(r.source,"combined");
 assert.ok(r.rate>45&&r.rate<67);
 assert.equal(r.first.games,40);
});

test("both user interfaces consume exactly one unified Meta API",()=>{
 assert.match(html,/fetch\("\/api\/meta-unified\?"/);
 assert.match(prep,/fetch\("\/api\/meta-unified\?"/);
 assert.doesNotMatch(html,/void loadIndependent\(\)/);
 assert.match(html,/const leaders=d\.leaders,index=pairIndex/);
 assert.match(prep,/global\.rate/);
 assert.match(prep,/W\/R combinado del líder/);
 assert.match(prep,/OPlay · 1\.º/);
});
