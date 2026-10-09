import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html"),hub=read("tools-hub.js"),offers=read("trade-offers.js");
const sql=read("supabase/migrations/20261009_unilateral_trade_offers.sql");
test("Discover mazos stays in same app and mobile highlights Mazos",()=>{
 assert.match(html,/id="openDeckCompletion" type="button"/);
 assert.match(html,/state.tab="deck-completion"/);
 assert.match(html,/id==="decks"&&state.tab==="deck-completion"/);
 assert.doesNotMatch(html,/target="_blank"[^>]*aria-label="Abrir Descubrir mazos"/);
});
test("Catalog scanner and grouped Tools exist",()=>{
 assert.match(html,/class="catalog-search-inline"/);
 assert.match(html,/id="catalogSearch"/);
 assert.match(html,/data-scan-open title="Escanear una carta"/);
 assert.match(html,/\["HERRAMIENTAS",\["proxies","scanner"\]\]/);
 assert.match(html,/moreGroups\.map/);
});
test("All catalog trade search and unilateral drafts",()=>{
 assert.match(hub,/source\.filter\(c=>c\?\.id&&!isJapaneseCatalogCard\(c\)\)/);
 assert.match(hub,/Busca en todo el cat[aá]logo/);
 assert.match(offers,/if\(!items\|\|\(!items\[0\]\?\.length&&!items\[1\]\?\.length\)\)/);
 assert.match(offers,/if\(!required\.length\)return \{ok:true\}/);
 assert.match(hub,/view\?\.\("compose"\)/);
 assert.match(hub,/view\?\.\("list"\)/);
});
test("Server migration allows one empty side but rejects two",()=>{
 assert.match(sql,/jsonb_array_length\(p_items\) not between 0 and 70/);
 assert.match(sql,/jsonb_array_length\(p_offered\)=0 and jsonb_array_length\(p_requested\)=0/);
 assert.match(sql,/quantity from public\.collection_items/);
 assert.match(sql,/grant execute on function public\.trade_offer_create/);
});
