(function(){
"use strict";
let pending=null,installed=false;
const standalone=()=>window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
function status(){
 if(installed||standalone())return "La aplicación ya está instalada o se está utilizando en modo aplicación.";
 if(pending)return "Puedes instalarla en este dispositivo sin pasar por una tienda de aplicaciones.";
 return /iPad|iPhone|iPod/i.test(navigator.userAgent)?
   "En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».":
   "En Chrome o tu navegador, abre el menú y elige «Instalar aplicación» o «Añadir a pantalla de inicio» si no aparece el botón de instalación.";
}
function refresh(){
 const btn=document.getElementById("installAppBtn"),hint=document.getElementById("installAppStatus");
 if(btn){btn.disabled=!!(installed||standalone());btn.textContent=(installed||standalone())?"Aplicación instalada":"Instalar aplicación";}
 if(hint)hint.textContent=status();
}
async function install(){
 if(installed||standalone()){refresh();return}
 if(pending){
   const event=pending;pending=null;
   try{await event.prompt();await event.userChoice}catch(e){console.warn("PWA install",e)}
   refresh();return;
 }
 refresh();
 window.alert(status());
}
function bind(){document.getElementById("installAppBtn")?.addEventListener("click",install);refresh()}
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();pending=event;refresh()});
window.addEventListener("appinstalled",()=>{pending=null;installed=true;refresh()});
if("serviceWorker" in navigator&&location.protocol==="https:"){
 window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js",{scope:"/"})
   .catch(err=>console.warn("Service worker",err)),{once:true});
}
window.MiAlbumPWA={bind,install,status};
})();