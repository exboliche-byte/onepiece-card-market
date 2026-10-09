import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {extractOPlayHtml} from "../api/meta-comparison.js";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const meta=read("meta.js"),api=read("api/meta.js");
test("Meta lands on a visual tier list with matrix and turn-order tabs",()=>{
 assert.doesNotThrow(()=>new vm.Script(meta));
 assert.match(meta,/section:"tiers"/);
 assert.match(meta,/nav\("tiers","🏆 Tier list"\)/);
 assert.match(meta,/nav\("matrix","▦ Matriz W\/R"\)/);
 assert.match(meta,/nav\("firstsecond","🥇 1\.º \/ 2\.º"\)/);
 assert.doesNotMatch(meta,/nav\("report"/);
});
test("The W-R matrix is a heatmap of actual tournament matchups",()=>{
 assert.match(meta,/meta-matrix-table/);
 assert.match(meta,/meta-wr-great/);
 assert.match(meta,/x\.games<6/);
 assert.match(meta,/slice\(0,m\.expanded\?28:12\)/);
});
test("Turn-order bars show verified OPlay sample counts for both positions",()=>{
 const html='<html><table><tr><td>1</td><td>Sabo OP13-004</td><td>8526</td>'+
 '<td>4593-3933</td><td>793</td><td>53.9%±1.1</td>'+
 '<td>50.4% 4066</td><td>57.0% 4460</td></tr></table></html>';
 const data=extractOPlayHtml(html);
 assert.equal(data.leaders.length,1);
 assert.equal(data.leaders[0].firstGames,4066);
 assert.equal(data.leaders[0].secondGames,4460);
 assert.equal(data.leaders[0].players,793);
 assert.match(meta,/metaTurnSort/);
 assert.match(meta,/x\.firstGames>0&&x\.secondGames>0/);
});
test("Public tournament coverage is no longer fixed to 24",()=>{
 assert.match(api,/expanded\?140:100/);
 assert.match(api,/maxPages=expanded\?5:3/);
 assert.match(api,/coverageComplete:/);
 assert.doesNotMatch(api,/expanded\?80:24/);
 assert.match(meta,/torneos analizados/);
});
