/* Network-first for live catalogue, with a small offline fallback.
   Never cache private/API responses or precache the 25 MB data feed. */
const CACHE="mialbumonepiece-v13";
const SHELL=["/","/index.html","/manifest.json","/icon.svg"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("mialbumonepiece-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("message",event=>{
  if(event.data==="SKIP_WAITING")self.skipWaiting();
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  // API and account/session data must never be intercepted or cached.
  if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/auth/")||
     url.pathname.startsWith("/orb-image/")||url.pathname.startsWith("/orb-official/"))return;
  if(url.pathname==="/sw.js"){
    event.respondWith(fetch(event.request,{cache:"no-store"}));return;
  }
  const isData=url.pathname.startsWith("/data/");
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:isData||event.request.mode==="navigate"?"no-store":"default"});
      if(response.ok){
        // The full card and price feeds are large; do not duplicate them in browser CacheStorage.
        if(!isData||url.pathname==="/data/packs.json"||url.pathname==="/data/catalog-meta.json"){
          const copy=response.clone();
          event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
        }
        return response;
      }
      if(!isData)return response;
      const fallback=await caches.match(event.request);
      return fallback||response;
    }catch{
      const fallback=await caches.match(event.request);
      if(fallback)return fallback;
      if(event.request.mode==="navigate"){
        return await caches.match("/index.html")||Response.error();
      }
      return isData?new Response("",{status:504,statusText:"Offline and uncached"}):Response.error();
    }
  })());
});
