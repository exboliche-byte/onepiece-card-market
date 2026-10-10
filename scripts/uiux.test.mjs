import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("..",import.meta.url));
const load=p=>readFileSync(path.join(root,p),"utf8");
const html=load("index.html"),css=load("uiux.css"),sw=load("sw.js"),build=load("scripts/vercel-build.sh");
function section(from,to){
  const a=html.indexOf(from),b=html.indexOf(to,a+from.length);
  assert.ok(a>=0&&b>a,"Missing UI section: "+from);
  return html.slice(a,b);
}
test("Mobile navigation has exactly Inicio, Colección, Catálogo, Torneos and Más",()=>{
 const nav=section("function nav(){","function deckCompletionView(){");
 assert.match(nav,/const mobileMain=\["home","collection","catalog","tournaments"\]/);
 assert.ok(!nav.includes("mobileScanButton"),"Scanner must not occupy a visible tab");
 const more=nav.match(/const moreGroups=([^;]+);/)?.[1]||"";
 assert.ok(more.includes('["JUGAR",["decks"]]'),"Mazos must be in More");
 assert.ok(more.includes('["HERRAMIENTAS",["scanner","proxies"]]'),"Scanner must be in More");
 assert.ok(!more.includes('["INICIO",["home"]]'),"Home should only occupy the first tab");
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});
test("Home is reachable from brand and navigation and has guest and private dashboard",()=>{
 const nav=section("function nav(){","function deckCompletionView(){");
 assert.ok(nav.includes('["home","Inicio"]'));
 assert.ok(html.includes('tab:"home",set:"",query:""'),"A new visit must open Inicio");
 assert.ok(html.includes('data-tab="home" aria-label="Ir a Inicio"'));
 const home=section("function homeView(){","function deckActiveFilterCount(){");
 for(const value of ["ui-home-actions","Escanear carta","Mazos recientes","Progreso por expansión","Abrir →"])assert.ok(home.includes(value),value);
 assert.match(html,/data-home-deck/);
});
test("Discover is on the same row and width as Create and Search, including mobile",()=>{
 const decks=section("function deckLibraryView(){","function decksView(){");
 assert.ok(decks.includes('class="deck-actions"'),"Deck actions missing");
 for(const id of ["newDeck","findCompetitiveDecks","openDeckCompletion"])assert.ok(decks.includes('id="'+id+'"'),id);
 assert.match(css,/\.deck-actions\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);align-items:stretch/);
 assert.ok(!css.includes("grid-column:1/-1;min-height:65px"),"Discover must not span entire row");
 assert.ok(css.includes(".deck-actions .deck-action:nth-child(3){grid-column:auto"),"Third action must be normal column");
});
test("Grouped cards do not silently modify cheapest print",()=>{
 const tile=section("function groupedTile(g){","function pagination(");
 assert.ok(!tile.includes('data-qty='),"Grouped tile must use detail to pick exact print");
 assert.ok(tile.includes("qty(c.id)"));
 assert.ok(tile.includes("Gestionar versiones"));
 const detail=section("function detailView(c){","const openAccountPanels=");
 assert.ok(detail.includes("print-quantity-panel"));
 assert.ok(detail.includes("Total entre versiones"));
 assert.ok(detail.includes("data-qty="));
});
test("Buttons are mobile-friendly and detail inputs explicit",()=>{
 assert.match(css,/--tap-min:44px/);
 assert.match(css,/\.card \.quick button\{min-width:42px;min-height:44px;height:44px\}/);
 assert.match(css,/\.print-quantity-panel \.quick button\{height:46px\}/);
 for(const id of ["authLogin","authPassword","registerUser","registerEmail","registerPassword"])assert.ok(html.includes('class="ui-auth-label" for="'+id+'"'),id);
});
test("Additional filters use progressive disclosure without losing existing controls",()=>{
 const catalog=section("function catalogFilterPanel(){","function catalogToolbar(){");
 const coll=section("function collectionFilterPanel(){","function collectionToolbar(){");
 for(const [group,keys] of [[catalog,["catSet","catColor","catMinCost","catMinPrice"]],[coll,["colSet","colRarity","colType","colPlayset"]]]){
   assert.ok(group.includes("ui-advanced-filters"));
   assert.ok(group.includes("<summary>Más filtros"));
   for(const k of keys)assert.ok(group.includes(k),k);
 }
});
test("Catalog and collection support incremental browsing and empty state",()=>{
 const pager=section("function pagination(","function catalogActiveFilterCount(){");
 assert.ok(pager.includes("data-load-more"));
 const catalog=section("async function renderCatalogResults(){","function catalogView(){");
 assert.ok(catalog.includes("data.slice(0,state.catalog.page*PAGE)"));
 assert.ok(catalog.includes("Sin resultados"));
 assert.ok(catalog.includes("resetCatalogResults"));
 const coll=section("async function renderCollectionResults(){","function collectionViewNav(");
 assert.ok(coll.includes("list.slice(0,state.collection.page*PAGE)"));
 const album=section("function renderAlbumResults(){","function expansionStats(){");
 assert.ok(album.includes("groups.slice(0,state.album.page*PAGE)"));
});
test("Feedback visible long enough and announced to assistive tech",()=>{
 assert.ok(html.includes("warning?5500:3600"));
 assert.ok(html.includes('state.toast.warning?"alert":"status"'));
 assert.ok(html.includes('state.toast.warning?"assertive":"polite"'));
});
test("UI is shipped and refreshed in PWA build",()=>{
 assert.ok(html.includes('<link rel="stylesheet" href="/uiux.css">'));
 assert.ok(build.includes("uiux.css"));
 assert.ok(sw.includes('"/uiux.css"'));
 assert.ok(sw.includes("mialbumonepiece-v29"));
});
