import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
function runtime(){
 let observer;
 class Node{
  constructor(tag,attrs={}){this.tag=tag;this.attrs=attrs;this.nodeType=1;this.parentNode=null;this.children=[];this.events={};this.value=attrs.value||"";this.hidden=false}
  get id(){return this.attrs.id||""}
  get name(){return this.attrs.name||""}
  getAttribute(x){return this.attrs[x]??null}
  setAttribute(x,v){this.attrs[x]=v}
  matches(s){return this.tag==="input"&&s.startsWith("input:")}
  closest(s){let p=this.parentNode;while(p){if(s===".search-clear-wrap"&&p.className==="search-clear-wrap")return p;p=p.parentNode}return null}
  querySelectorAll(s){const a=[];for(const c of this.children){if(c.matches(s))a.push(c);a.push(...c.querySelectorAll(s))}return a}
  appendChild(n){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);this.children.push(n);n.parentNode=this;return n}
  insertBefore(n,ref){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);let i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,n);n.parentNode=this}
  addEventListener(x,fn){(this.events[x]||=[]).push(fn)}
  dispatchEvent(ev){for(const fn of this.events[ev.type]||[])fn(ev);return true}
  focus(){this.focused=true}
  click(){this.dispatchEvent({type:"click"})}
 }
 const body=new Node("body"),document={readyState:"complete",nodeType:9,body,createElement:t=>new Node(t),querySelectorAll:s=>body.querySelectorAll(s),addEventListener(){}};
 const window={};
 class MutationObserver{constructor(fn){this.fn=fn;observer=this}observe(){}}
 vm.runInNewContext(read("search-clear.js"),{document,window,MutationObserver,Event:class{constructor(type){this.type=type}}},{timeout:2500});
 const input=attrs=>{const el=new Node("input",attrs),host=new Node("div");host.appendChild(el);body.appendChild(host);return {el,host}};
 return {input,refresh:window.MiAlbumSearchClear.refresh,added:node=>observer.fn([{addedNodes:[node]}])};
}
test("Overview expansion search removed, set card search remains",()=>{
 const html=read("index.html");
 assert.doesNotMatch(html,/id="expansionSearch"|expansions\.query/);
 assert.match(html,/id="expansionType"/);
 assert.match(html,/id="expansionSort"/);
 assert.match(html,/id="albumSearch"/);
});
test("Clear button is inside search box, dispatches input and never duplicates",()=>{
 const x=runtime(),{el,host}=x.input({id:"catalogSearch",value:"Shanks",placeholder:"Buscar carta"});let updated="unset";
 el.addEventListener("input",()=>{updated=el.value});
 x.refresh();
 const wrapper=host.children[0],clear=wrapper.children[1];
 assert.equal(wrapper.className,"search-clear-wrap");
 assert.equal(wrapper.children[0],el);
 assert.equal(clear.tag,"button");
 assert.equal(clear.hidden,false);
 clear.click();
 assert.equal(el.value,"");
 assert.equal(updated,"");
 assert.equal(clear.hidden,true);
 assert.equal(el.focused,true);
 x.refresh();assert.equal(host.children.length,1);
});
test("New scanner and trade-user searches are decorated, ordinary text remains unchanged",()=>{
 const x=runtime(),{host:a}=x.input({type:"search",id:"scanSearch",value:"OP01"});
 x.added(a);assert.equal(a.children[0].children[1].hidden,false);
 const {el:peer,host:b}=x.input({id:"tradePeer",value:"nami",placeholder:"Escribe el usuario"});
 x.added(b);assert.equal(b.children[0].className,"search-clear-wrap");
 b.children[0].children[1].click();assert.equal(peer.value,"");
 const {host:c}=x.input({id:"newDeckName",value:"Mi mazo",placeholder:"Nombre del mazo"});
 x.added(c);assert.equal(c.children[0].tag,"input");
});
test("PWA and build contain both shared assets and all principal search screens",()=>{
 const html=read("index.html"),build=read("scripts/vercel-build.sh"),sw=read("sw.js");
 assert.match(html,/src="\/search-clear\.js"/);
 assert.match(html,/href="\/search-clear\.css"/);
 for(const id of ["catalogSearch","collectionSearch","albumSearch","deckSearch","proxySearch","competitiveLeaderSearch","publicCollectionSearch"])
   assert.match(html,new RegExp('id="'+id+'"'));
 for(const path of ["tools-hub.js","wants.js","collection-boxes.js","tournaments.js","tournament-prep.js"])
   assert.match(read(path),/type="search"|id="tourneyOpponentSearch"/);
 for(const item of ["search-clear.test.mjs","search-clear.css","search-clear.js"])assert.ok(build.includes(item));
 assert.match(sw,/\/search-clear\.css/);assert.match(sw,/\/search-clear\.js/);
});
