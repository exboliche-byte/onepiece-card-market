import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const api=readFileSync(new URL("../api/competitive-decks.js",import.meta.url),"utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const main=scripts.find(x=>x.includes("function competitiveDeckSearchView()"));
assert.ok(main,"main SPA script found");
assert.doesNotThrow(()=>new Function(main),"SPA inline JS syntax is valid");
test("Deck finder exposes card search with catalog images, mode switch and real result lists",()=>{
 assert.match(html,/data-competitive-mode="card"/);
 assert.match(html,/id="competitiveCardSearch"/);
 assert.match(html,/data-competitive-card/);
 assert.match(html,/competitiveCardGridHtml\(\)/);
 assert.match(html,/savedDecksWithCompetitiveCard/);
 assert.match(html,/data-preview-competitive/);
 assert.match(html,/data-open-card-deck/);
});
test("Backend filters playable tournament decklists by playable printed card ID",()=>{
 const cleaned=api.replace(/^import .*?;\s*$/m,"").replace("export default {","const endpoint={");
 const get=vm.runInNewContext(cleaned+"\n({toResult,endpoint,normalizeLeader})",{
   fetch:()=>{},Response:class{},getLegalityRules:async()=>({}),deckPlayable:()=>true,
   console,Date,URL,URLSearchParams,setTimeout,clearTimeout,Map,Math,Number,Object,String,Array
 });
 const leader={set:"OP05",number:"060",name:"Luffy"};
 const list={leader,character:[{set:"OP05",number:"119",count:4},{set:"OP09",number:"001",count:46}]};
 const event={id:"321",name:"Tournament",players:64,date:new Date().toISOString()};
 const row={decklist:list,placing:2,name:"Player",record:{wins:3,losses:1,ties:0}};
 const yes=get.toResult(event,row,"all",{},"OP05-119");
 const no=get.toResult(event,row,"all",{},"OP05-120");
 assert.equal(yes.leaderId,"OP05-060");
 assert.equal(yes.cards["OP05-119"],4);
 assert.equal(no,null);
 assert.equal(get.toResult(event,row,"all",{},"OP05-060").leaderId,"OP05-060");
 assert.match(api,/cardFilter&&leaderId!==cardFilter/);
 assert.match(api,/leader==="all"&&!cardFilter/);
});
test("Public lists are validated by Standard legality and cards are matched by printed code",()=>{
 assert.match(html,/standardCompetitiveDeckPlayable\(deck\.leaderId,deck\.cards\)/);
 assert.match(html,/deckPrintedCode\(id\)===state\.deckDiscoverCard/);
 assert.match(html,/deckPrintedCode\(c\)/);
 assert.match(html,/competitiveDeckSearchVersion/);
});
