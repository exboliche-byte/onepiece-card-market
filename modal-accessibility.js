/* Lightweight modal accessibility: trap keyboard focus and restore it when closed. */
(()=>{
 "use strict";
 let active=null,trigger=null,scheduled=false;
 const focusable='button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
 const visible=element=>element.getClientRects().length>0&&getComputedStyle(element).visibility!=="hidden";
 function selectedOverlay(){
  return [...document.querySelectorAll(".modalback")].reverse().find(visible)||null;
 }
 function refresh(){
  scheduled=false;
  const overlay=selectedOverlay();
  if(overlay===active)return;
  if(!overlay){
   active=null;
   const restore=trigger;trigger=null;
   if(restore?.isConnected)restore.focus({preventScroll:true});
   return;
  }
  if(!active)trigger=document.activeElement;
  active=overlay;
  const dialog=overlay.querySelector(".modal")||overlay;
  dialog.setAttribute("role","dialog");
  dialog.setAttribute("aria-modal","true");
  if(!dialog.hasAttribute("tabindex"))dialog.setAttribute("tabindex","-1");
  const first=[...dialog.querySelectorAll(focusable)].find(visible);
  (first||dialog).focus({preventScroll:true});
 }
 const request=()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(refresh);
 };
 document.addEventListener("keydown",event=>{
  if(document.querySelector("#scanPanel"))return;
  const overlay=selectedOverlay();
  if(!overlay)return;
  if(event.key==="Escape"){
   const close=overlay.querySelector("[data-close-auth],[data-close],[data-wants-close],[data-list-close],[data-shareclose],[data-close-share],.close");
   if(close){event.preventDefault();close.click()}
  }else if(event.key==="Tab"){
   const dialog=overlay.querySelector(".modal")||overlay;
   const elements=[...dialog.querySelectorAll(focusable)].filter(visible);
   if(!elements.length){event.preventDefault();dialog.focus({preventScroll:true});return}
   const first=elements[0],last=elements[elements.length-1];
   if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){
    event.preventDefault();first.focus();
   }
  }
 },true);
 const start=()=>{
  const observer=new MutationObserver(request);
  observer.observe(document.body,{childList:true,subtree:true});
  request();
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
