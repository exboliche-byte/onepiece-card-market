import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html"),tools=read("tools-hub.js"),meta=read("meta.js"),prep=read("tournament-prep.js");
test("competitive suggestions exclude banned and rotated exact cards and leaders",()=>{
 const a=html.indexOf("function standardLeaderPlayable("),b=html.indexOf("function competitiveLeaderOptions()",a);
 assert.ok(a>=0&&b>a);
 const map={"OP01-001":{id:"OP01-001",category:"Leader"},"OP05-060":{id:"OP05-060",category:"Leader"},
 "OP06-086":{id:"OP06-086",category:"Character"},"OP09-001":{id:"OP09-001",category:"Character"}};
 const ctx={resolveDeckImportCard:id=>map[id],collectionLegalityStatus:c=>["OP01-001","OP06-086"].includes(c.id)?"rotated":null,
   deckCreationProblem:()=>""};
 vm.runInNewContext(html.slice(a,b),ctx,{timeout:1000});
 assert.equal(ctx.standardLeaderPlayable("OP01-001"),false);
 assert.equal(ctx.standardLeaderPlayable("OP05-060"),true);
 assert.equal(ctx.standardCompetitiveDeckPlayable("OP05-060",{"OP06-086":4}),false);
 assert.equal(ctx.standardCompetitiveDeckPlayable("OP05-060",{"OP09-001":4}),true);
 assert.match(html,/standardCompetitiveDeckPlayable\(deck\.leaderId,deck\.cards\)/);
 assert.match(html,/if\(!standardCompetitiveDeckPlayable\(result\.leaderId,result\.cards\)\)/);
 assert.match(tools,/standardCompetitiveDeckPlayable\(r\.leaderId,r\.cards\)/);
 assert.match(tools,/standardCompetitiveDeckPlayable\(x\.leaderId,x\.cards\)/);
});
test("tier list community, simulator and preparation filter illegals even after cached responses",()=>{
 assert.match(meta,/function standardMetaData\(v\)/);
 assert.match(meta,/standardLeaderPlayable\(x\.id\)/);
 assert.match(meta,/const x=standardMetaData\(m\.global\)/);
 assert.match(meta,/const shown=standardMetaData\(/);
 assert.match(prep,/leaderOptions\(\)\{return .*standardLeaderPlayable/);
 assert.match(prep,/!standardLeaderPlayable\(x\.opponent\)/);
});
