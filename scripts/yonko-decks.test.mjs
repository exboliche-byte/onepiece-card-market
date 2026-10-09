import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../api/yonko-decks.js",import.meta.url),"utf8");
const code=source.replace(/^import .*?;\s*$/gm,"").replace(/^export function /gm,"function ").replace("export default {","const adapter={");
const funcs=vm.runInNewContext(code+"\n({parseIndex,parseDeckText,parseEvent,pickEvents})",{Date,Map,Set,Math,Number,URL,URLSearchParams,Response,
 fetch:()=>Promise.reject(Error("offline")),getLegalityRules:async()=>({}),deckPlayable:()=>true,
 AbortController,setTimeout,clearTimeout});
const deck="1xOP17-079\n4xOP17-086\n4xOP17-094\n4xOP17-080\n4xOP17-081\n4xOP17-082\n4xOP17-087\n2xOP17-091\n4xOP17-095\n4xOP17-089\n4xOP15-088\n4xOP17-119\n3xOP17-093\n2xOP17-098\n3xST14-017";
const index='<section aria-labelledby="feed-op17-abc" data-yonko-kind="major" data-yonko-major="true" data-yonko-play-region="europe"><h3><a href="/yonko/events/op17-abc123">Bandai(Utrecht)</a><span>Regional</span><span>7 Sep 2026<!-- --> · <!-- -->Europe</span></h3><ol><li><a href="/yonko/leaders/op17-079-elbaph-luffy">Elbaph Luffy</a></li></ol></section>';
const details='<details open=""><summary><span>1st (13-2)</span><span>Stefano Vinci</span><span>Elbaph Luffy</span><span>51<!-- --> cards</span></summary><div><a href="/yonko/decks/op17-5e83d337f76a">Full list</a><textarea readOnly="" rows="6">'+deck+'</textarea></div></details>';
test("Index parsing gets English event, date, region and leader without fetching private APIs",()=>{
 const events=funcs.parseIndex(index,"en");
 assert.equal(events.length,1);
 assert.equal(events[0].path,"/yonko/events/op17-abc123");
 assert.equal(events[0].date,"2026-09-07");
 assert.equal(events[0].region,"europe");
 assert.equal(events[0].leaderCodes[0],"OP17-079");
});
test("Deck parser enforces exactly 50 main cards plus leader",()=>{
 const found=funcs.parseDeckText(deck);
 assert.equal(found.leaderId,"OP17-079");
 assert.equal(found.cards["OP17-086"],4);
 assert.equal(Object.values(found.cards).reduce((s,n)=>s+n,0),50);
 assert.equal(funcs.parseDeckText("1xOP17-079\n2xOP17-086"),null);
});
test("Yonko event parser returns a correctly attributed list with its source URL",()=>{
 const ev=funcs.parseIndex(index,"en")[0];
 const result=funcs.parseEvent(details,ev);
 assert.equal(result.length,1);
 assert.equal(result[0].source,"Yonko / One Piece Top Decks");
 assert.equal(result[0].sourceUrl,"https://www.pankurecords.com/yonko/decks/op17-5e83d337f76a");
 assert.equal(result[0].placing,1);
 assert.equal(result[0].record.wins,13);
 assert.equal(result[0].record.losses,2);
 assert.equal(result[0].format,"en");
 assert.equal(result[0].players,0);
});
test("Invalid or malformed event HTML is ignored, never fakes records",()=>{
 const ev=funcs.parseIndex(index,"jp")[0];
 assert.equal(funcs.parseEvent("<h1>Nothing</h1>",ev).length,0);
 assert.equal(funcs.parseEvent(details.replace("1xOP17-079","4xOP17-079"),ev).length,0);
});
