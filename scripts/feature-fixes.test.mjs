import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
function between(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,"Missing expected implementation block "+start);
  return source.slice(a,b);
}

const jpg=read("deck-image-share.js");
const colorsBlock=between(jpg,"const LEADER_PALETTE=","function darkTint(");
const cards={
  mono:{colors:["Red"]},
  multi:{colors:["Red","Purple"]},
  spanish:{colors:["Azul","Amarillo"]},
  image:{colors:["Green"]}
};
const getColors=new Function("card",colorsBlock+"\nreturn deckLeaderColors;")(id=>cards[id]);

test("deck JPG uses leader identity, including multicolor leaders",()=>{
  assert.deepEqual(getColors({leader:"mono"}),[[220,52,65]]);
  assert.deepEqual(getColors({leader:"multi"}),[[220,52,65],[131,81,186]]);
  assert.deepEqual(getColors({leader:"spanish"}),[[40,111,191],[221,169,35]]);
  assert.deepEqual(getColors({leader:"image",colors:["Black"]}),[[33,147,101]]);
  assert.deepEqual(getColors({colors:["Black","Black"]}),[[58,66,82]]);
  assert.ok(!jpg.includes("leaderArtworkColor"),"Artwork colors must never decide the JPG background");
  assert.match(jpg,/background\.addColorStop\(i\/\(palette\.length-1\)/);
});

const scanner=read("scanner.js");
const lensBlock=between(scanner,"const frontLabel=","async function startCamera(turn){");
const lenses=new Function("facing",lensBlock+"\nreturn {cameraPriority,camerasForFacing};");
const candidates=[
  {kind:"videoinput",deviceId:"front",label:"Front Camera"},
  {kind:"videoinput",deviceId:"macro",label:"Back Macro Camera"},
  {kind:"videoinput",deviceId:"ultra",label:"Back Ultra Wide Camera"},
  {kind:"videoinput",deviceId:"normal",label:"Back Camera"}
];

test("scanner prefers wide angle and keeps macro/front separate",()=>{
  const rear=lenses("environment");
  assert.deepEqual(rear.camerasForFacing(candidates).map(d=>d.deviceId),["macro","ultra","normal"]);
  assert.ok(rear.cameraPriority(candidates[2])>rear.cameraPriority(candidates[3]));
  assert.ok(rear.cameraPriority(candidates[3])>rear.cameraPriority(candidates[1]));
  assert.deepEqual(lenses("user").camerasForFacing(candidates).map(d=>d.deviceId),["front"]);
  assert.match(scanner,/deviceId:\{exact:targetId\}/);
  assert.match(scanner,/id="scanCameraSelect"/);
  assert.match(scanner,/selectCamera\(e\.target\.value\)/);
});

test("collection sharing is wired with explicit public opt-in, retry, copy and revocation",()=>{
  const html=read("index.html");
  const sql=read("supabase/migrations/20261009_public_collection_share_links.sql");
  assert.match(html,/id="openCollectionShare"/);
  assert.match(html,/\$\("#openCollectionShare"\)\?\.addEventListener\("click",openCollectionShare\)/);
  for(const name of ["enableCollectionSharing","copyCollectionUrl","sendCollectionUrl","revokeCollectionUrl","retryCollectionShare"]){
    assert.ok(html.includes(name),"Missing collection share action "+name);
  }
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/public_collection_snapshot/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.public_collection_snapshot\(text\) TO anon,authenticated/);
});

test("automatic scanner add is opt-in, waits five seconds, and has a prominent stop",()=>{
  assert.match(scanner,/let autoAddEnabled=false/);
  assert.match(scanner,/id="scanAutoToggle"/);
  assert.match(scanner,/id="scanAutoStop" hidden/);
  assert.match(scanner,/PARAR AÑADIDO AUTOMÁTICO/);
  assert.match(scanner,/Date\.now\(\)\+5000/);
  assert.match(scanner,/\},5000\)/);
  assert.match(scanner,/autoAddCandidate!==candidate/);
  assert.match(scanner,/\$\("#scanVariant"\)\?\.value!==candidate\.printId/);
  assert.match(scanner,/if\(hit\.confidence==="visual"/);
  assert.match(scanner,/autoWaitForChange/);
  assert.match(scanner,/cancelAutoCountdown\(\)/);
  assert.match(scanner,/ok=await setQty/);
});

test("scanner buttons show copies of the exact selected printing",()=>{
  const block=between(scanner,"function ownedCount(id){","function chooseVariant(");
  const buttons={"#scanAddOne":{textContent:""},"#scanAutoStop":{textContent:""}};
  const refresh=new Function("qty","$",block+"\nreturn updateScanCopiesLabel;")(
    id=>({"OP01-001":3,"OP01-001_p1":1})[id]||0,
    selector=>buttons[selector]
  );
  refresh({id:"OP01-001_p1"});
  assert.match(buttons["#scanAddOne"].textContent,/Ya tienes 1$/);
  assert.match(buttons["#scanAutoStop"].textContent,/1 copia\(s\) de OP01-001_p1/);
  refresh({id:"OP01-001"});
  assert.match(buttons["#scanAddOne"].textContent,/Ya tienes 3$/);
  refresh(null);
  assert.equal(buttons["#scanAutoStop"].textContent,"⏹ PARAR AÑADIDO AUTOMÁTICO");
});

test("scanner shows price for the exact selected printing, never a sibling",async()=>{
  const block=between(scanner,"async function updateScannerPrice(card){","function chooseVariant(");
  const priceNode={textContent:""},selection={value:"OP01-001_p1"};
  const current={"OP01-001":0.40,"OP01-001_p1":7.25};
  const update=new Function("priceOf","money","ensurePrices","$","console","running",
    block+"\nreturn updateScannerPrice;")(
    c=>current[c.id]??null,
    n=>n.toFixed(2)+" €",
    async()=>{},
    selector=>selector==="#scanCardPrice"?priceNode:selector==="#scanVariant"?selection:null,
    console,true
  );
  await update({id:"OP01-001_p1"});
  assert.equal(priceNode.textContent,"Precio de esta impresión: 7.25 €");
  selection.value="OP01-001";
  await update({id:"OP01-001"});
  assert.equal(priceNode.textContent,"Precio de esta impresión: 0.40 €");
  let completeLookup;
  const missing=new Function("priceOf","money","ensurePrices","$","console","running",
    block+"\nreturn updateScannerPrice;")(
    c=>current[c.id]??null,
    n=>n.toFixed(2)+" €",
    ()=>new Promise(resolve=>{completeLookup=resolve}),
    selector=>selector==="#scanCardPrice"?priceNode:selector==="#scanVariant"?selection:null,
    console,true
  );
  selection.value="OP01-002";
  const pending=missing({id:"OP01-002"});
  assert.equal(priceNode.textContent,"Consultando precio de esta impresión…");
  selection.value="OP01-001_p1";
  completeLookup();
  await pending;
  assert.equal(priceNode.textContent,"Consultando precio de esta impresión…",
    "A delayed lookup must not overwrite the next selected printing");
  selection.value="OP01-002";
  await update({id:"OP01-002"});
  assert.equal(priceNode.textContent,"Precio de esta impresión: no disponible");
  assert.match(scanner,/void updateScannerPrice\(current\)/);
  assert.match(scanner,/id="scanCardPrice"/);
});

test("scanner updates selected and persistent copy counts after confirmed collection writes",()=>{
  const html=read("index.html");
  assert.match(html,/window\.dispatchEvent\(new CustomEvent\("mialbum:collection-updated"/);
  assert.match(scanner,/window\.addEventListener\("mialbum:collection-updated"/);
  const local=between(scanner,"function ownedCount(id){","async function updateScannerPrice(card){");
  const cards=[{id:"OP01-001",name:"Carta 1"},{id:"OP01-001_p1",name:"Carta 1"}];
  const values={"OP01-001":1,"OP01-001_p1":2};
  const nodes={
    "#scanVariant":{value:"OP01-001_p1"},
    "#scanAddOne":{textContent:""},
    "#scanAutoStop":{textContent:""},
    "#scanExactCount":{textContent:""},
    "#scanGroupCount":{textContent:""},
    "#scanOwnedLive":{hidden:true,textContent:""}
  };
  const refresh=new Function("qty","$","running","panel","state","cardByCode","idBase","playsetTarget","lastScannedPrintId",
    local+"\nreturn refreshScannerCopies;")(
    id=>values[id]||0,selector=>nodes[selector]||null,true,()=>true,{cards},
    ()=>cards,()=> "OP01-001",()=>4,"OP01-001_p1"
  );
  refresh();
  assert.match(nodes["#scanOwnedLive"].textContent,/OP01-001_p1 · Tienes 2 copias/);
  assert.match(nodes["#scanAddOne"].textContent,/Ya tienes 2$/);
  assert.match(nodes["#scanGroupCount"].textContent,/Tienes 3 copias de esta carta/);
  values["OP01-001_p1"]=3;
  refresh("OP01-001_p1");
  assert.match(nodes["#scanOwnedLive"].textContent,/Tienes 3 copias/);
  assert.match(nodes["#scanAddOne"].textContent,/Ya tienes 3$/);
  assert.match(nodes["#scanGroupCount"].textContent,/Tienes 4 copias de esta carta/);
  refresh("OP01-002");
  assert.match(nodes["#scanAddOne"].textContent,/Ya tienes 3$/);
  nodes["#scanVariant"].value="OP01-001";
  refresh();
  assert.match(nodes["#scanOwnedLive"].textContent,/OP01-001 · Tienes 1 copia$/);
});

test("quantity ordering remains stable during edits and resets for explicit sort or filter changes",()=>{
  const html=read("index.html");
  const block=between(html,"const quantityOrderSnapshots=","function filteredCards(mode){");
  const state={
    user:{id:"tester"},cards:[{},{},{}],
    collection:{sort:"quantity",dir:"desc",quantity:"Todas",page:1,filtersOpen:false},
    catalog:{sort:"quantity",dir:"desc",ownership:"Todas",page:1,filtersOpen:false}
  };
  const preserve=new Function("state",block+"\nreturn preserveQuantitySort;")(state);
  const ids=x=>x.id||x.key;
  assert.deepEqual(preserve("collection",[{id:"A"},{id:"B"},{id:"C"}],ids).map(ids),["A","B","C"]);
  state.collection.page=2;
  state.collection.filtersOpen=true;
  assert.deepEqual(preserve("collection",[{id:"C"},{id:"A"},{id:"B"}],ids).map(ids),["A","B","C"],
    "Editing counts or changing page must not reorder cards");
  assert.deepEqual(preserve("catalog",[{key:"A"},{key:"B"}],ids).map(ids),["A","B"]);
  assert.deepEqual(preserve("catalog",[{key:"B"},{key:"A"}],ids).map(ids),["A","B"],
    "Grouped catalog also retains quantity order");
  state.collection.quantity="3";
  assert.deepEqual(preserve("collection",[{id:"C"},{id:"A"}],ids).map(ids),["C","A"],
    "An explicit filter change must trigger a fresh sort");
  state.collection.sort="name";
  assert.deepEqual(preserve("collection",[{id:"A"},{id:"C"}],ids).map(ids),["A","C"]);
  state.collection.sort="quantity";
  assert.deepEqual(preserve("collection",[{id:"C"},{id:"A"}],ids).map(ids),["C","A"],
    "Returning to quantity sort must reflect updated counts");
  assert.match(html,/mode==="collection"\?preserveQuantitySort\("collection"/);
  assert.match(html,/return preserveQuantitySort\("catalog",groups/);
});
