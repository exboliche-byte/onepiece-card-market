(function(){
"use strict";
/* One accessible clear action for all card, leader and user search fields.
   Uses input events so each page keeps its own query state and result filtering. */
const SELECTOR='input:not([type]),input[type="text"],input[type="search"]';
function isSearch(input){
  if(!input||input.closest(".search-clear-wrap"))return false;
  if(input.disabled||input.readOnly)return false;
  const type=(input.getAttribute("type")||"text").toLowerCase();
  if(type!=="text"&&type!=="search")return false;
  if(type==="search"||input.getAttribute("inputmode")==="search")return true;
  const parts=[input.id,input.name,input.getAttribute("placeholder"),input.getAttribute("aria-label")].join(" ");
  return /buscar|búsqueda|search|filtrar|filtra|tradePeer/i.test(parts);
}
function decorate(input){
  if(!isSearch(input)||!input.parentNode)return;
  const parent=input.parentNode,wrap=document.createElement("span");
  wrap.className="search-clear-wrap";
  parent.insertBefore(wrap,input);
  wrap.appendChild(input);
  const button=document.createElement("button");
  button.type="button";
  button.className="search-clear-button";
  button.textContent="×";
  button.setAttribute("aria-label","Borrar búsqueda"+(input.getAttribute("aria-label")?" de "+input.getAttribute("aria-label"):""));
  button.setAttribute("title","Borrar búsqueda");
  const update=()=>{button.hidden=!input.value.length};
  wrap.appendChild(button);
  input.addEventListener("input",update);
  input.addEventListener("change",update);
  input.addEventListener("search",update);
  button.addEventListener("pointerdown",e=>e.preventDefault());
  button.addEventListener("click",()=>{
    if(!input.value)return;
    input.value="";
    update();
    input.focus({preventScroll:true});
    // Input is the event supported by every in-app live filter.
    input.dispatchEvent(new Event("input",{bubbles:true}));
    // Native search fields can also listen to the search event.
    if((input.getAttribute("type")||"").toLowerCase()==="search")
      input.dispatchEvent(new Event("search",{bubbles:true}));
    update();
  });
  update();
}
function scan(node){
 if(!node||node.nodeType!==1&&node.nodeType!==9)return;
 if(node.matches?.(SELECTOR))decorate(node);
 node.querySelectorAll?.(SELECTOR).forEach(decorate);
}
const observer=new MutationObserver(records=>{
 for(const r of records)for(const node of r.addedNodes)scan(node);
});
function init(){
 if(!document.body)return;
 scan(document);
 observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
window.MiAlbumSearchClear={refresh:()=>scan(document)};
})();