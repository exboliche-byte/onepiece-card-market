(function(){
"use strict";
let pending=null,installed=false,registration=null,updating=false,lastChecked=0;
const standalone=()=>window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
const isOffline=()=>navigator.onLine===false;
function status(){
 if(isOffline())return "Sin conexión: no se pueden sincronizar colecciones, precios, mazos ni intercambios.";
 if(installed||standalone())return "La aplicación ya está instalada o se está utilizando en modo aplicación.";
 if(pending)return "Puedes instalarla en este dispositivo sin pasar por una tienda de aplicaciones.";
 return /iPad|iPhone|iPod/i.test(navigator.userAgent)?
   "En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».":
   "Abre el menú de tu navegador y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio».";
}
function updateReady(){return !!registration?.waiting&&!!navigator.serviceWorker?.controller}
function banner(){
 let node=document.getElementById("pwaOfflineBanner");
 if(isOffline()){
  if(!node){node=document.createElement("div");node.id="pwaOfflineBanner";node.setAttribute("role","status");node.style.cssText="position:fixed;top:0;left:0;right:0;z-index:999;padding:8px 14px;background:#412e15;color:#fff;text-align:center;font:600 12px system-ui,sans-serif";document.body.appendChild(node)}
  node.textContent="Sin conexión · Los datos privados y las modificaciones requieren Internet.";
 }else node?.remove();
}
function refresh(){
 const btn=document.getElementById("installAppBtn"),hint=document.getElementById("installAppStatus");
 const update=document.getElementById("pwaUpdateBtn"),network=document.getElementById("pwaNetworkStatus");
 if(btn){btn.disabled=!!(installed||standalone());btn.textContent=(installed||standalone())?"Aplicación instalada":"Instalar aplicación"}
 if(hint)hint.textContent=status();
 if(update){update.hidden=!updateReady();update.disabled=updating;update.textContent=updating?"Aplicando actualización…":"Actualizar aplicación"}
 if(network)network.textContent=isOffline()?"Modo sin conexión: no se permite modificar datos.":updateReady()?"Nueva versión disponible para instalar.":"";
 banner();
}
async function install(){
 if(installed||standalone()){refresh();return}
 if(pending){
  const event=pending;pending=null;
  try{await event.prompt();await event.userChoice}catch(err){console.warn("PWA install",err)}
  refresh();return;
 }
 window.alert(status());
}
function applyUpdate(){
 if(!updateReady())return;
 updating=true;refresh();
 registration.waiting.postMessage("SKIP_WAITING");
}
function watch(worker){
 worker?.addEventListener("statechange",()=>{
  if(worker.state==="installed"&&navigator.serviceWorker.controller)refresh();
 });
}
function checkUpdate(){
 if(!registration||isOffline()||Date.now()-lastChecked<3600000)return;
 lastChecked=Date.now();
 void registration.update().catch(err=>console.warn("PWA update check",err));
}
function bind(){
 document.getElementById("installAppBtn")?.addEventListener("click",install);
 document.getElementById("pwaUpdateBtn")?.addEventListener("click",applyUpdate);
 refresh();
}
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();pending=event;refresh()});
window.addEventListener("appinstalled",()=>{pending=null;installed=true;refresh()});
window.addEventListener("online",()=>{refresh();checkUpdate()});
window.addEventListener("offline",refresh);
window.addEventListener("focus",checkUpdate);
if("serviceWorker" in navigator&&location.protocol==="https:"){
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
  if(updating){updating=false;location.reload()}else refresh();
 });
 window.addEventListener("load",async()=>{
  try{
   registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   watch(registration.installing);
   registration.addEventListener("updatefound",()=>watch(registration.installing));
   refresh();checkUpdate();
  }catch(err){console.warn("Service worker",err)}
 },{once:true});
}
window.MiAlbumPWA={bind,install,status,applyUpdate,checkUpdate};
})();
