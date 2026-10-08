import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("..",import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const html=read("index.html");
const sw=read("sw.js");
const tournaments=read("tournaments.js");
const prices=read("api/cardmarket.js");
test("all inline JavaScript in the main page parses",()=>{
 const inline=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([,attributes,script])=>!/\bsrc\s*=/.test(attributes)&&script.trim());
 assert.ok(inline.length>=1,"No main script");
 for(const [,attrs,js] of inline)assert.doesNotThrow(()=>new vm.Script(js,{filename:"index-inline.js"}));
});
test("all scripts referenced in HTML are included in the project",()=>{
 const refs=[...html.matchAll(/<script\b[^>]*\bsrc=["'](\/[^"']+)["']/gi)].map(m=>m[1]);
 assert.ok(refs.length>=6);
 for(const ref of refs)assert.ok(fs.existsSync(path.join(root,ref)),"Missing module "+ref);
});
test("all critical views and workflows have entry points",()=>{
 for(const v of ["catalog","collection","album","decks","tournaments","meta","account"])
   assert.ok(html.includes('"'+v+'"'),"View unavailable: "+v);
 for(const f of ["scanner.js","proxy-generator.js","deck-image-share.js","collection-history.js","tournaments.js","meta.js"])
   assert.ok(fs.existsSync(path.join(root,f)));
});
test("catalog updates are network-first and private API responses are never cached",()=>{
 assert.ok(sw.includes('url.pathname.startsWith("/api/")'));
 assert.ok(sw.includes('const isData=url.pathname.startsWith("/data/")'));
 assert.ok(sw.includes('cache:isData||event.request.mode==="navigate"?"no-store"'));
});
test("new tournament formats are derived from source packs and all leaders can be selected",()=>{
 assert.ok(!tournaments.includes('set:"OP-17"'),"Hard-coded expansion OP-17");
 assert.ok(!tournaments.includes("selected=setName(set)"),"Leader filter confused titles with set codes");
 assert.ok(tournaments.includes('state.packs||[]'));
});
test("price fallback never writes zero or null as a current market price",()=>{
 assert.ok(prices.includes("Number.isFinite(n)&&n>0?n:null"));
 assert.ok(html.includes('if(Number.isFinite(n)&&n>0){state.prices[id]=n'));
});
test("meta group disclosure thresholds are present",()=>{
 const sql=read("supabase/migrations/20261008_meta_community_automatic.sql");
 assert.ok(sql.includes("users>=3 and games>=6"));
 assert.ok(sql.includes("fu>=3 and fg>=6"));
 assert.ok(sql.includes("su>=3 and sg>=6"));
});
test("scanner confirmation, minimum zoom and photo frame are implemented",()=>{
 const scanner=read("scanner.js");
 for(const token of ['"#scanPanel .scanDecision{position:absolute;z-index:10','$("#scanAddOne").onclick=()=>save(1);','$("#scanDiscard").onclick=resume;','{zoom:cap.zoom.min}','object-fit:contain'])assert.ok(scanner.includes(token),token);
});
test("proxy layout is fixed to A4 with nine prints",()=>{
 const code=read("proxy-generator.js");
 assert.ok(code.includes("PER_PAGE=9")||code.includes("PER_PAGE = 9"));
 assert.ok(code.includes("PAPER_MM")&&code.includes("63")&&code.includes("88"));
});
