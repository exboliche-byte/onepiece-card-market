import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const root=new URL("../",import.meta.url);
const share=fs.readFileSync(new URL("deck-image-share.js",root),"utf8");
const html=fs.readFileSync(new URL("index.html",root),"utf8");
test("competitive deck drafts offer JPG sharing before saving",()=>{
 const a=html.indexOf("const deckActions=draft"),b=html.indexOf("const hero=",a);
 assert.ok(a>=0&&b>a);
 assert.match(html.slice(a,b),/deckActions=draft[\s\S]+?id="shareDeck"/);
 assert.match(html,/\$\("#shareDeck"\)\?\.addEventListener\("click",\(\)=>shareDeck\(\)\)/);
 assert.match(html,/Puedes compartirlo como JPG desde Acciones sin guardarlo/);
});
test("unsaved deck renders without a public URL or QR",()=>{
 assert.match(share,/const draft=!!current\.draftCompetitive/);
 assert.match(share,/showPreview\(current,\{hasPublicLink:!draft\}\)/);
 assert.match(share,/if\(!draft\)\{\s*if\(typeof window\.preparePublicDeckShare/);
 assert.match(share,/let publicUrl=null/);
 assert.match(share,/if\(publicUrl\)\{\s*drawDeckQRCode\(ctx,publicUrl\)/);
 assert.match(share,/MAZO SIN GUARDAR · VISTA PREVIA/);
 assert.match(share,/hasPublicLink\?'<button id="copyDeckPublicLink"/);
});
test("opening unsaved preview does not call persistence; saved decks retain the URL",async()=>{
 const pattern=/async function makeJpg\(deck,entries,onProgress,publicUrl\)\{[\s\S]*?\n\}\n\nfunction saveFile\(/;
 const stub='async function makeJpg(deck,entries,onProgress,publicUrl){window.__rendered={deck,entries,publicUrl};return {file:{size:1024,name:"draft.jpg"},missing:[]}}\n\nfunction saveFile(';
 const modified=share.replace(pattern,stub);
 assert.notEqual(modified,share);
 let publicCalls=0;
 const makeNode=()=>({
  disabled:true,hidden:true,textContent:"",src:"",innerHTML:"",onclick:null,remove(){},addEventListener(){},
  querySelector(selector){
   if(selector==="#copyDeckPublicLink"&&!this.innerHTML.includes('id="copyDeckPublicLink"'))return null;
   return makeNode();
  }
 });
 const ctx={
  window:{preparePublicDeckShare:async()=>{publicCalls++;return "https://example.test/deck/123"}},
  document:{createElement:makeNode,body:{appendChild(){}}},
  URL:{createObjectURL:()=>"blob:preview",revokeObjectURL(){}},
  card:id=>({id,name:id,cost:1,colors:["Red"]}),
  notify(){},navigator:{},console
 };
 vm.runInNewContext(modified,ctx,{timeout:1000});
 const d={id:"competitive-draft-test",draftCompetitive:true,name:"Prueba",leader:"OP05-060",cards:{"OP05-001":4},colors:["Red"]};
 await ctx.window.DeckImageShare.open(d);
 assert.equal(publicCalls,0);
 assert.equal(ctx.window.__rendered.publicUrl,null);
 assert.equal(ctx.window.__rendered.deck.cards["OP05-001"],4);
 await ctx.window.DeckImageShare.open({...d,id:"saved-deck",draftCompetitive:false});
 assert.equal(publicCalls,1);
 assert.equal(ctx.window.__rendered.publicUrl,"https://example.test/deck/123");
});
