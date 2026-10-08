(()=>{"use strict";
const seen=new WeakSet(), active=new WeakSet(), pending=new WeakMap();
const io="IntersectionObserver" in window?new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const img=entry.target;active.add(img);if(img.loading==="lazy")img.loading="eager";check(img);io.unobserve(img)}},{rootMargin:"450px 0px"}):null;
function repaint(img){
 if(!img.isConnected||!img.naturalWidth)return;
 // Force a compositor refresh after decode. Some Chromium builds keep cached
 // images visually blank until hover/click causes a repaint.
 img.style.willChange="opacity";
 img.style.opacity="0.998";
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!img.isConnected)return;img.style.opacity="1";img.style.willChange="auto"}));
}
function check(img){
 if(!img.isConnected)return;
 if(img.complete&&img.naturalWidth){
  Promise.resolve(typeof img.decode==="function"?img.decode().catch(()=>{}):null).then(()=>repaint(img));
  return;
 }
 if(!active.has(img))return;
 if(pending.has(img))clearTimeout(pending.get(img));
 const timer=setTimeout(()=>{
   pending.delete(img);if(!img.isConnected||!active.has(img))return;
   if(img.complete&&img.naturalWidth){repaint(img);return}
   const step=Number(img.dataset.imageRecovery||0);
   if(step>=2)return;
   const next=step===0?img.dataset.imageOfficial:img.dataset.imageFallback;
   if(!next||next===img.src){img.dataset.imageRecovery=String(step+1);check(img);return}
   img.dataset.imageRecovery=String(step+1);
   img.src=next;
   check(img);
 },10000);
 pending.set(img,timer);
}
function bind(img){
 if(!img||seen.has(img)||!img.matches("img[data-image-official]"))return;
 seen.add(img);
 img.addEventListener("load",()=>{const timer=pending.get(img);if(timer)clearTimeout(timer);pending.delete(img);check(img)});
 img.addEventListener("error",()=>{const timer=pending.get(img);if(timer)clearTimeout(timer);pending.delete(img);setTimeout(()=>check(img),0)});
 if(io)io.observe(img);else{active.add(img);check(img)}
 if(img.complete&&img.naturalWidth)check(img);
}
function scan(node){
 if(node.nodeType!==1)return;
 if(node.matches?.("img[data-image-official]"))bind(node);
 node.querySelectorAll?.("img[data-image-official]").forEach(bind);
}
const start=()=>{
 scan(document);
 new MutationObserver(list=>{for(const record of list){for(const node of record.addedNodes)scan(node)}}).observe(document.body,{subtree:true,childList:true});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)document.querySelectorAll("img[data-image-official]").forEach(img=>{if(img.complete&&img.naturalWidth)repaint(img)})});
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();