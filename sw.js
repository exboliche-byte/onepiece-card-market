/* App shell only: private Supabase state and heavy card/price feeds stay on the network. */
const CACHE="mialbumonepiece-v24";
const SHELL=["/","/index.html","/offline.html","/manifest.json","/icon.svg","/icon-192.png","/icon-512.png","/deck-lab.css","/deck-physical.css","/search-clear.css",
 "/pwa.js","/deck-lab.js","/deck-physical.js","/search-clear.js","/collection-legality.js","/modal-accessibility.js","/image-visibility.js","/scanner.js",
 "/scanner-ocr.js","/scanner-vision.js","/proxy-generator.js","/qrcode-generator.js",
 "/deck-image-share.js","/tournaments.js","/meta.js","/meta-report.js","/collection-history.js",
 "/wants.js","/collection-boxes.js","/tools-hub.js","/trade-offers.js","/tournament-prep.js"];
const ASSETS=new Set(SHELL);
const SMALL_DATA=new Set(["/data/packs.json","/data/catalog-meta.json"]);
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(async cache=>{
   await Promise.all(SHELL.map(url=>cache.add(url).catch(()=>{})));
 }));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
   keys.filter(k=>k.startsWith("mialbumonepiece-")&&k!==CACHE).map(k=>caches.delete(k))
 )).then(()=>self.clients.claim()));
});
self.addEventListener("message",event=>{
 if(event.data==="SKIP_WAITING")self.skipWaiting();
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET")return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/auth/")||
    url.pathname.startsWith("/orb-image/")||url.pathname.startsWith("/orb-official/"))return;
 if(url.pathname==="/sw.js"){event.respondWith(fetch(req,{cache:"no-store"}));return}
 const nav=req.mode==="navigate",asset=ASSETS.has(url.pathname),small=SMALL_DATA.has(url.pathname);
 // Never intercept private responses, arbitrary URLs or the multi-megabyte feeds.
 if(!nav&&!asset&&!small)return;
 event.respondWith((async()=>{
   try{
     const response=await fetch(req,{cache:"no-store"});
     if(response.ok&&(asset||small||nav&&url.pathname==="/")){
       const cache=await caches.open(CACHE);
       const key=nav?"/index.html":req;
       event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
     }
     return response;
   }catch{
     const cache=await caches.open(CACHE);
     return await cache.match(nav?"/offline.html":req)||
       (nav?new Response("Sin conexión. Conecta a Internet para cargar los datos.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}):
       Response.error());
   }
 })());
});
