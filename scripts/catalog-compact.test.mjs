import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=html.indexOf("function compactCatalogTile(c){");
const stop=html.indexOf("function cardTile(c,extra",start);
const fragment=html.slice(start,stop);
test("catalog tiles only show name, expansion, price, wants and quantity controls",()=>{
 assert.ok(start>=0&&stop>start);
 const context={state:{user:{id:"u"},collectionReady:true},
 qty:()=>3,priceOf:()=>2.25,cardExpansionCode:()=>"OP17",esc:String,money:()=> "2,25 €",cardImg:(c,cls)=>'<img class="'+cls+'" data-print="'+c.id+'">'};
 const render=vm.runInNewContext(fragment+";compactCatalogTile",context);
 const markup=render({id:"OP17-099",name:"Luffy",rarity:"Secret",colors:["Purple"],category:"Leader"});
 assert.match(markup,/Luffy/);
 assert.match(markup,/OP17/);assert.match(markup,/2,25 €/);
 assert.match(markup,/data-want="OP17-099"/);
 assert.match(markup,/data-qty="OP17-099" data-d="-1"/);
 assert.match(markup,/data-qty="OP17-099" data-d="1"/);
 assert.match(markup,/data-detail="OP17-099"/);
 assert.match(markup,/<img class="catalog-compact-art"/);
 assert.doesNotMatch(markup,/Secret|Purple|cardimg|catalogthumb|Ver carta|Gestionar versiones|total/);
 assert.match(html,/catalog-compact-grid/);
 assert.match(html,/if\(state\.tab==="catalog"\)return compactCatalogTile/);
 assert.match(html,/if\(state\.tab==="catalog"\)return compactCatalogTile\(catalogCoverCard\(g\)\)/);
});
test("guests see + and - disabled but can navigate to full details and wants login prompt",()=>{
 const context={state:{user:null,collectionReady:false},qty:()=>0,priceOf:()=>null,cardExpansionCode:()=>"EB04",esc:String,money:String,cardImg:(c,cls)=>'<img class="'+cls+'" data-print="'+c.id+'">'};
 const render=vm.runInNewContext(fragment+";compactCatalogTile",context);
 const markup=render({id:"EB04-002",name:"Sanji"});
 assert.match(markup,/Precio —/);assert.match(markup,/data-detail/);
 assert.match(markup,/data-want/);assert.equal((markup.match(/\sdisabled/g)||[]).length,2);
});

test("grouped catalog shows exactly one image of the selected cover, never variant thumbnails",()=>{
 const c={id:"OP17-099",name:"Luffy",set:"OP17"};
 const context={state:{user:{id:"u"},collectionReady:true},qty:()=>2,priceOf:()=>3,
  cardExpansionCode:v=>v.set,esc:String,money:v=>v+" €",cardImg:(v,cls)=>'<img class="'+cls+'" data-print="'+v.id+'">'};
 const render=vm.runInNewContext(fragment+";compactCatalogTile",context);
 const markup=render(c);
 assert.equal((markup.match(/<img /g)||[]).length,1);
 assert.match(markup,/data-print="OP17-099"/);
 assert.match(markup,/data-detail="OP17-099"/);
 assert.doesNotMatch(markup,/catalog-compact-image-alt|catalog-compact-more|OP17-099_p1/);
 assert.match(markup,/data-want="OP17-099"/);
 assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/aspect-ratio:\.716/);
});
const cStart=html.indexOf("function catalogCoverCard(g){");
const cEnd=html.indexOf("// An expansion cover uses only printings",cStart);
const coverSnippet=html.slice(cStart,cEnd);
test("cover uses cheapest ordinary print from original expansion, not cheaper parallel or reprint",()=>{
 const base={id:"OP17-099",set:"OP17",name:"Luffy",variantKind:"base"};
 const originalReprint={id:"OP17-099_r1",set:"OP17",name:"Luffy",variantKind:"reprint"};
 const originalParallel={id:"OP17-099_p1",set:"OP17",name:"Luffy",variantKind:"parallel"};
 const reprintSet={id:"OP17-099_r2",set:"PRB03",name:"Luffy",variantKind:"reprint"};
 const originalGroup={key:"op17-099",card:reprintSet,versions:[reprintSet]};
 const prices={"OP17-099":7,"OP17-099_r1":3,"OP17-099_p1":1,"OP17-099_r2":0.5};
 const all=[base,originalReprint,originalParallel,reprintSet];
 const ctx={state:{groupByKey:new Map([["op17-099",{versions:all}]])},
  baseId:id=>id.replace(/_(?:r|p|c)\d+$/,""),cardExpansionCode:c=>c.set,
  normalizePrintSet:v=>String(v).replace(/-/g,"").toUpperCase(),variantKindOf:c=>c.variantKind,
  priceOf:c=>prices[c.id]};
 const pick=vm.runInNewContext(coverSnippet+";catalogCoverCard",ctx);
 const selected=pick(originalGroup);
 assert.equal(selected.id,"OP17-099_r1");
});
test("ordinary base printing wins price ties and unknown sibling price never becomes zero",()=>{
 const base={id:"OP17-099",set:"OP17",kind:"base"};
 const other={id:"OP17-099_r1",set:"OP17",kind:"reprint"};
 const ctx={state:{groupByKey:new Map()},baseId:id=>id.replace(/_r\d+$/,""),
  cardExpansionCode:c=>c.set,normalizePrintSet:v=>v.toUpperCase(),
  variantKindOf:c=>c.kind,priceOf:c=>c.id===base.id?null:2};
 const pick=vm.runInNewContext(coverSnippet+";catalogCoverCard",ctx);
 assert.equal(pick({card:base,versions:[base,other]}).id,other.id);
 ctx.priceOf=()=>2;
 assert.equal(pick({card:base,versions:[other,base]}).id,base.id);
});
