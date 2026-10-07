const CACHE="mialbumonepiece-v7";
const SHELL=["/","/index.html","/manifest.json","/icon.svg","/data/cards.json","/data/packs.json","/data/cardmarket-prices.json"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("message",event=>{
  if(event.data==="SKIP_WAITING")self.skipWaiting();
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname==="/sw.js"){
    event.respondWith(fetch(event.request,{cache:"no-store"}));
    return;
  }
  const isData=url.pathname.startsWith("/data/");
  if(isData){
    event.respondWith(
      caches.match(event.request).then(cached=>{
        const refresh=fetch(event.request,{cache:"no-store"}).then(response=>{
          if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});
          return response;
        }).catch(()=>null);
        return cached||refresh.then(response=>response||new Response("",{status:504}));
      })
    );
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:"default"}).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});
      return response;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("/index.html")))
  );
});