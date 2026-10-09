import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {extractOPlayHtml,extractEverythingHtml} from "../api/meta-comparison.js";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const meta=fs.readFileSync(new URL("../meta.js",import.meta.url),"utf8");
const report=fs.readFileSync(new URL("../meta-report.js",import.meta.url),"utf8");

test("one competitive draft becomes a real UUID before first cloud write",()=>{
 const d=html.split("async function saveCompetitiveDraft(){")[1].split("function deckLibraryView(){")[0];
 assert.match(d,/d\.id=crypto\.randomUUID\(\)/);
 assert.match(d,/await syncDeck\(d\)/);
 assert.match(html,/function ensureSavedDeckUuid\(deck\)/);
 assert.match(html,/deck\.id=crypto\.randomUUID\(\)/);
 assert.doesNotMatch(html,/id="retryDeckCloudSync"/);
});
test("auth reconciles only changed decks automatically",()=>{
 const block=html.split("async function syncCloudInternal(userId){")[1].split("let supabaseInitPromise")[0];
 assert.match(block,/pendingExisting/);
 assert.match(block,/void retryPendingDeckSync\(\)/);
 assert.match(block,/deck_tombstones/);
});
test("independent published simulator W-L is parsed without mixing samples",()=>{
 const sample='<table><tbody><tr><td>1</td><td><span>Rocks.D.Xebec</span><span>OP17-039</span></td>'+
 '<td>8382</td><td>4403-3979</td><td>929</td><td>52.5%</td><td>48.9% 3643</td>'+
 '<td>55.3% 4739</td></tr></tbody></table>';
 const result=extractOPlayHtml(sample);
 assert.equal(result.leaders.length,1);
 assert.equal(result.leaders[0].id,"OP17-039");
 assert.equal(result.leaders[0].games,8382);
 assert.equal(result.leaders[0].firstRate,48.9);
 assert.equal(result.leaders[0].secondRate,55.3);
 assert.equal(result.leaders[0].rate,52.5);
});
test("independent reference is contextual not invented results",()=>{
 const result=extractEverythingHtml("<html><title>Meta</title><body>Leader lists and tournaments</body></html>");
 assert.deepEqual(result.leaders,[]);
 assert.equal(result.kind,"tournament-independent");
});
test("report clearly marks independent sources and sample provenance",()=>{
 new vm.Script(report);
 assert.match(report,/No se suman ni se promedian/);
 assert.match(report,/OPlayTCG/);
 assert.match(report,/Everything OPTCG/);
 assert.match(report,/n simulador|n OPlay/);
 assert.match(meta,/loadIndependent\(\)/);
 assert.match(meta,/Informe contrastado/);
});
