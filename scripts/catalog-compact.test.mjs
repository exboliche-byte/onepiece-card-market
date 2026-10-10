import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=html.indexOf("function compactCatalogTile(c,");
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
 assert.match(html,/if\(state\.tab==="catalog"\)return compactCatalogTile\(catalogCoverCard\(g\),g\)/);
});
test("guests see + and - disabled but can navigate to full details and wants login prompt",()=>{
 const context={state:{user:null,collectionReady:false},qty:()=>0,priceOf:()=>null,cardExpansionCode:()=>"EB04",esc:String,money:String,cardImg:(c,cls)=>'<img class="'+cls+'" data-print="'+c.id+'">'};
 const render=vm.runInNewContext(fragment+";compactCatalogTile",context);
 const markup=render({id:"EB04-002",name:"Sanji"});
 assert.match(markup,/Precio —/);assert.match(markup,/data-detail/);
 assert.match(markup,/data-want/);assert.equal((markup.match(/\sdisabled/g)||[]).length,2);
});

test("grouped catalog shows up to three real printing images and opens each exact card",()=>{
 const c={id:"OP17-099",name:"Luffy",set:"OP17"};
 const variants=[c,{id:"OP17-099_p1",name:"Luffy",set:"OP17"},{id:"OP17-099_p2",name:"Luffy",set:"OP17"},{id:"OP17-099_r1",name:"Luffy",set:"PRB03"}];
 const context={state:{user:{id:"u"},collectionReady:true},qty:()=>2,priceOf:v=>({"OP17-099":3,"OP17-099_p1":9,"OP17-099_p2":13,"OP17-099_r1":11})[v.id],
  cardExpansionCode:v=>v.set,esc:String,money:v=>v+" €",cardImg:(v,cls)=>'<img class="'+cls+'" data-print="'+v.id+'">'};
 const render=vm.runInNewContext(fragment+";compactCatalogTile",context);
 const markup=render(c,{versions:variants});
 assert.equal((markup.match(/class="catalog-compact-art"/g)||[]).length,3);
 assert.match(markup,/data-detail="OP17-099_p1"/);
 assert.match(markup,/data-detail="OP17-099_r1"/);
 assert.match(markup,/\+1 versiones/);
 assert.match(markup,/data-want="OP17-099"/);
 assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
