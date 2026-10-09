import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const hub=fs.readFileSync(path.join(root,"tools-hub.js"),"utf8");
function fn(name,next){
 const start=html.indexOf("function "+name+"("),end=html.indexOf(next,start);
 assert.ok(start>=0&&end>start,"Missing navigation function "+name);
 return html.slice(start,end);
}
function discardFrom(origin){
 const draft={id:"draft-preview",draftCompetitive:true,draftDirty:false};
 const saved={id:"another-deck",draftCompetitive:false};
 const state={decks:[draft,saved],deckId:draft.id,deckLibrary:false,deckChoosingLeader:false,
  deckDiscover:true,tab:"decks",deckPreviewOrigin:origin,deckPreviewScrollY:315};
 const ctx={state,confirm:()=>true,renderShell:()=>{},replaceAppHistory:()=>{ctx.savedSnapshot={tab:state.tab,deckId:state.deckId}},
   window:{scrollTo:args=>{ctx.scroll=args}}};
 vm.runInNewContext(fn("discardCompetitiveDraft","async function saveCompetitiveDraft"),ctx,{timeout:1000});
 ctx.discardCompetitiveDraft();
 return ctx;
}
test("Completion preview returns to completion and discards only the ephemeral preview",()=>{
 const ctx=discardFrom("deck-completion");
 assert.equal(ctx.state.tab,"deck-completion");
 assert.equal(ctx.savedSnapshot.tab,"deck-completion");
 assert.equal(ctx.state.deckDiscover,false);
 assert.equal(ctx.state.decks.length,1);
 assert.equal(ctx.state.decks[0].id,"another-deck");
 assert.equal(ctx.scroll.top,315);
});
test("Mazos preview returns to its regular competitive search results",()=>{
 const ctx=discardFrom("decks");
 assert.equal(ctx.state.tab,"decks");
 assert.equal(ctx.state.deckDiscover,true);
 assert.equal(ctx.scroll.top,0);
 assert.equal(ctx.state.decks.length,1);
});
test("Discover mazos is an in-app button, not a new-tab link",()=>{
 assert.match(html,/id="openDeckCompletion" type="button"/);
 assert.match(html,/#\("openDeckCompletion"\)\?\.addEventListener\("click"/);
 assert.doesNotMatch(html,/href="\/deck-completion" target="_blank"/);
});
test("Preview origin is explicitly passed and retained for app history navigation",()=>{
 assert.match(hub,/openCompetitiveDeckPreview\(0,"deck-completion"\)/);
 assert.match(html,/function openCompetitiveDeckPreview\(index,origin="decks"\)/);
 assert.match(html,/state\.deckPreviewOrigin=origin==="deck-completion"/);
 assert.match(html,/deckPreviewOrigin:state\.deckPreviewOrigin\|\|""/);
 assert.match(html,/state\.deckPreviewOrigin=view\.deckPreviewOrigin==="deck-completion"/);
 assert.match(html,/state\.tab=fromCompletion\?"deck-completion":"decks"/);
 assert.match(html,/draft\?'Volver a resultados'/);
});
