(function(){
"use strict";
/* This module never changes collection quantities or deck records. */
const h={tab:"trade",tradeSection:"prepare",owner:null,trade:[[],[]],q:"",list:[],meta:{},loaded:false,busy:false,error:"",
  sort:"missing",maxMissing:"12",maxCost:"",cloudReady:false,cloudLoading:false,cloudError:"",cloudConflict:false,
  revision:null,pending:false,localRevision:null,hasCache:false,serial:0,saveTimer:null,writing:false,lastCloudAt:0};
const key=id=>"mialbumonepiece_tools_"+id;
const text=s=>esc(s);
const price=c=>c?priceOf(c):null;
const num=x=>Math.max(1,Math.min(100,Math.floor(Number(x)||1)));
const positive=x=>Number(x)>0&&Number.isFinite(Number(x))?Number(x):null;
const printed=id=>deckPrintedCode(id);
function account(){
  const id=state.user?.id||null;
  if(h.owner===id)return;
  if(h.saveTimer){clearTimeout(h.saveTimer);h.saveTimer=null}
  h.owner=id;h.trade=[[],[]];
  h.cloudReady=false;h.cloudLoading=false;h.cloudError="";h.cloudConflict=false;
  h.revision=null;h.pending=false;h.localRevision=null;h.hasCache=false;h.serial=0;h.writing=false;h.lastCloudAt=0;
  if(!id)return;
  try{
    const raw=localStorage.getItem(key(id));
    h.hasCache=!!raw;
    const v=JSON.parse(raw||"{}");
    h.pending=v.pending===true;h.localRevision=Number.isSafeInteger(v.revision)?v.revision:null;
    for(let i=0;i<2;i++)h.trade[i]=(Array.isArray(v.trade?.[i])?v.trade[i]:[]).slice(0,100)
      .filter(x=>typeof x.id==="string").map(x=>({id:x.id,q:num(x.q),manual:positive(x.manual)}));
  }catch(err){console.warn("Herramientas locales",err)}
}
function sanitizeTrade(raw){
  return [0,1].map(i=>(Array.isArray(raw?.[i])?raw[i]:[]).slice(0,100)
    .filter(x=>typeof x?.id==="string"&&x.id.length<=140)
    .map(x=>({id:x.id,q:num(x.q),manual:positive(x.manual)})));
}
function cache(){
  if(!h.owner)return;
  try{localStorage.setItem(key(h.owner),JSON.stringify({
    trade:h.trade,pending:h.pending,revision:h.revision
  }))}catch(err){console.warn("Herramientas: error de caché local",err)}
}
function save(){
  if(!h.owner){notify("Inicia sesión para guardar estas herramientas");return}
  h.pending=true;h.serial++;cache();scheduleSave();
}
function scheduleSave(){
  if(!h.owner||!state.sb||!h.cloudReady||h.cloudConflict)return;
  if(h.saveTimer)clearTimeout(h.saveTimer);
  h.saveTimer=setTimeout(()=>{h.saveTimer=null;void flushCloud()},300);
}
async function flushCloud(){
  if(h.writing||h.cloudConflict||!h.pending||!h.cloudReady||!h.owner||!state.sb)return false;
  const userId=h.owner,client=state.sb,rev=h.revision,snapshot=h.serial;
  const trade=sanitizeTrade(h.trade);
  h.writing=true;
  try{
    const result=await client.from("user_tools").update({
      trade,revision:rev+1,updated_at:new Date().toISOString()
    }).eq("user_id",userId).eq("revision",rev).select("revision").maybeSingle();
    if(result.error)throw result.error;
    if(h.owner!==userId)return false;
    if(!result.data){
      h.cloudConflict=true;
      h.cloudError="Otro dispositivo ha modificado estas herramientas. Tus cambios se conservan aquí, sin sobrescribir los de la nube.";
      cache();if(state.tab==="trades")renderShell();
      return false;
    }
    h.revision=Number(result.data.revision)||rev+1;
    h.pending=h.serial!==snapshot;
    h.cloudError="";
    cache();
    return true;
  }catch(err){
    if(h.owner===userId){
      h.cloudError="No se pudieron guardar las herramientas en Supabase: "+(err.message||err);
      cache();
    }
    console.warn("Herramientas Supabase: guardado",err);
    return false;
  }finally{
    if(h.owner===userId){
      h.writing=false;
      if(h.pending&&!h.cloudError&&!h.cloudConflict)scheduleSave();
      if(state.tab==="trades")renderShell();
    }
  }
}
async function loadCloud(force=false){
  account();
  if(!h.owner||!state.sb)return false;
  if(h.cloudLoading||(!force&&h.cloudReady))return h.cloudReady;
  // Never overwrite unsaved local changes with a background refresh.
  if(force&&(h.pending||h.writing||h.cloudConflict))return false;
  const id=h.owner,client=state.sb,at=h.serial;
  h.cloudLoading=true;h.cloudError="";
  try{
    const r=await client.from("user_tools").select("trade,revision").eq("user_id",id).maybeSingle();
    if(r.error)throw r.error;
    if(h.owner!==id)return false;
    if(r.data){
      const revision=Number(r.data.revision)||1;
      const legacy=h.hasCache&&h.localRevision===null&&
        h.trade.some(side=>side.length)&&
        JSON.stringify(sanitizeTrade(h.trade))!==JSON.stringify(sanitizeTrade(r.data.trade));
      if(legacy&&!force){
        h.revision=revision;h.cloudReady=true;h.pending=true;h.cloudConflict=true;
        h.cloudError="Este navegador tiene datos guardados antes de la sincronización y Supabase ya contiene otros. Elige cuál conservar.";
        cache();
      }else if(h.pending&&h.localRevision===revision&&!force){
        h.revision=revision;h.cloudReady=true;h.cloudConflict=false;scheduleSave();
      }else if(h.pending&&h.localRevision!==revision&&!force){
        // Offline edits cannot silently supersede newer writes from another device.
        h.revision=revision;h.cloudReady=true;h.cloudConflict=true;
        h.cloudError="Hay cambios pendientes en este navegador y una versión distinta en Supabase. Decide cuál conservar.";
      }else if(at===h.serial){
        h.trade=sanitizeTrade(r.data.trade);
        h.revision=revision;h.pending=false;h.cloudReady=true;h.cloudConflict=false;cache();
      }
    }else{
      // First visit to the cloud feature: migrate the account's existing local data.
      // There was no remote row to overwrite.
      const trade=sanitizeTrade(h.trade);
      const write=await client.from("user_tools").insert({
        user_id:id,trade,revision:1
      }).select("revision").single();
      if(write.error){
        if(write.error.code==="23505"){h.cloudLoading=false;return loadCloud(true)}
        throw write.error;
      }
      if(h.owner!==id)return false;
      h.revision=Number(write.data.revision)||1;
      h.cloudReady=true;h.cloudConflict=false;
      h.pending=h.serial!==at;cache();
      if(h.pending)scheduleSave();
    }
    h.lastCloudAt=Date.now();
    return h.cloudReady;
  }catch(err){
    if(h.owner===id){
      h.cloudError="No se pudo leer Supabase: "+(err.message||err);
      console.warn("Herramientas Supabase: carga",err);
    }
    return false;
  }finally{
    if(h.owner===id){h.cloudLoading=false;if(state.tab==="trades")renderShell()}
  }
}
async function resolveConflict(useLocal){
  if(!h.owner||!state.sb)return;
  if(!useLocal){
    if(h.pending&&!confirm("¿Descartar los cambios locales pendientes y recuperar los datos de Supabase?"))return;
    h.pending=false;h.cloudConflict=false;h.revision=null;
    cache();await loadCloud(true);return;
  }
  if(!confirm("¿Reemplazar los datos de la nube con los de este navegador? Los cambios de otros dispositivos podrían perderse."))return;
  const id=h.owner;
  try{
    const r=await state.sb.from("user_tools").select("revision").eq("user_id",id).single();
    if(r.error)throw r.error;
    if(h.owner!==id)return;
    h.revision=Number(r.data.revision);
    h.cloudConflict=false;h.cloudError="";h.cloudReady=true;
    h.pending=true;cache();await flushCloud();
  }catch(err){if(h.owner===id)h.cloudError=String(err.message||err);renderShell()}
}
function cloudMessage(){
  if(!h.owner)return '<div class="notice">Inicia sesión para guardar y sincronizar intercambios.</div>';
  if(!state.sb)return '<div class="notice">Esperando conexión a Supabase. Los cambios no están disponibles hasta conectar.</div>';
  if(h.cloudLoading||!h.cloudReady){
    return '<div class="notice">Sincronizando herramientas con Supabase… '+
      (h.cloudError?text(h.cloudError):"")+
      '<button class="secondary btn" id="toolsCloudRetry">Reintentar</button></div>';
  }
  return '<div class="tools-cloud-status">'+
    (h.cloudError?'<div class="notice">'+text(h.cloudError)+'</div>':
      '<div class="small">'+(h.pending?"Guardado pendiente · ":"✓ Guardado en Supabase · ")+
        'Intercambios disponibles en tus dispositivos</div>')+
    (h.pending?'<button class="secondary btn" id="toolsCloudRetry">Reintentar guardado</button>':"")+
    (h.cloudConflict?'<div class="tools-controls"><button class="secondary btn" id="toolsCloudKeepRemote">Usar datos de Supabase</button>'+
      '<button class="danger btn" id="toolsCloudKeepLocal">Reemplazar datos de Supabase</button></div>':"")+
    '</div>';
}
function readyToEdit(){
  if(!h.owner){notify("Inicia sesión");return false}
  if(!h.cloudReady){notify("Espera a que termine la sincronización con Supabase");return false}
  if(h.cloudConflict){notify("Resuelve primero el conflicto entre dispositivos");return false}
  return true;
}
// Index the currently loaded catalog once, not on every keystroke.
let searchCardsSource=null,searchCardsCount=0,searchIndex=[];
function matches(query){
 const needle=norm(String(query||"").trim()).replace(/\s+/g," ");
 if(needle.length<2)return [];
 const source=Array.isArray(state.cards)?state.cards:[];
 if(searchCardsSource!==source||searchCardsCount!==source.length){
  searchCardsSource=source;searchCardsCount=source.length;
  searchIndex=source.filter(c=>c?.id&&!isJapaneseCatalogCard(c)).map(c=>({
   c,keywords:norm([c.id,c.name,c.set,c.set_name,baseId(c.id)].join(" "))
  }));
 }
 const terms=needle.split(" ").filter(Boolean);
 return searchIndex.filter(x=>terms.every(t=>x.keywords.includes(t))).map(x=>x.c)
  .sort((a,b)=>qty(b.id)-qty(a.id)||String(a.id).localeCompare(String(b.id),"es",{numeric:true})).slice(0,36);
}
// Each hit is one fully closed article: never nest a result inside another.
function searchResults(query){
  const input=String(query||"").trim();
  if(input.length<2)return '<p class="small">Busca por nombre o código (mínimo 2 caracteres).</p>';
  const found=matches(input);
  if(!found.length)return '<p class="notice">No se encuentran cartas para esa búsqueda. Prueba con el nombre o código.</p>';
  return found.map(c=>{
    const id=text(c.id),name=text(c.name||c.id);
    const detail=id+' · '+text(c.set||"")+' · '+money(price(c))+' / copia'+(state.user?' · Tengo '+qty(c.id):"");
    return '<article class="tools-found" data-trade-result="'+id+'">'+
      cardImg(c,"thumb")+
      '<div class="tools-found-content"><strong>'+name+'</strong><span class="small">'+detail+'</span></div>'+
      '<div class="tools-found-actions">'+
      '<button class="secondary btn" type="button" aria-label="Añadir a lo que entrego" data-trade-add="0" data-card="'+id+'">←</button>'+
      '<button class="primary btn" type="button" aria-label="Añadir a lo que recibo" data-trade-add="1" data-card="'+id+'">→</button>'+
      '</div></article>';
  }).join("");
}
function total(i){
  let amount=0,unknown=0,copies=0;
  for(const x of h.trade[i]){
    const p=x.manual||price(card(x.id));copies+=x.q;
    if(p)amount+=x.q*p;else unknown+=x.q;
  }
  return {amount,unknown,copies};
}
function tradeSide(i){
  const sums=total(i),items=h.trade[i];
  let rows="";
  for(let j=0;j<items.length;j++){
    const x=items[j],c=card(x.id),p=x.manual||price(c);
    rows+='<div class="tools-item">'+cardImg(c||{id:x.id,name:x.id},"thumb")+
      '<div class="grow"><b>'+text(c?.name||x.id)+'</b><div class="small">'+text(x.id)+
      ' · '+money(p)+' / copia'+(state.user?' · Tengo '+qty(x.id):"")+'</div>'+
      '<div class="tools-controls"><button class="secondary btn" data-trade-change="'+i+':'+j+':-1">−</button>'+
      '<b>'+x.q+'</b><button class="secondary btn" data-trade-change="'+i+':'+j+':1">+</button>'+
      '<label class="small">€/copia <input class="field tools-price" type="number" min="0" step="0.01" data-trade-price="'+i+':'+j+
      '" value="'+text(x.manual??"")+'" placeholder="'+text(p??"Sin precio")+'"></label>'+
      '<button class="danger btn" data-trade-delete="'+i+':'+j+'">✕</button></div></div>'+
      '<b>'+money(p?p*x.q:null)+'</b></div>';
  }
  return '<section class="section"><div class="sectionhead"><h2>'+(i?"Recibo":"Entrego")+'</h2><b>'+money(sums.amount)+'</b></div>'+
    '<div class="small">'+sums.copies+' copia(s)'+(sums.unknown?" · "+sums.unknown+" sin precio":"")+'</div>'+
    (rows||'<div class="notice">Añade cartas desde el buscador.</div>')+'</section>';
}
function tradeView(){
  const a=total(0),b=total(1),diff=b.amount-a.amount;
  return '<div class="section"><h2>Intercambio manual</h2><p class="small">Suma cartas a cada lado. Puedes modificar su valor por copia. No se restan cartas de tu colección ni se ejecuta ningún intercambio.</p>'+
    '<input class="field" type="search" id="toolsSearch" placeholder="Buscar carta y versión…" value="'+text(h.q)+'">'+
    '<div class="tools-results" id="toolsSearchResults">'+searchResults(h.q,"trade")+'</div></div>'+
    '<div class="tools-cols">'+tradeSide(0)+tradeSide(1)+'</div>'+
    '<div class="section tools-total"><div><b>Diferencia (recibo − entrego)</b><h2>'+money(diff)+'</h2>'+
    '<div class="small">'+(a.unknown||b.unknown?'Hay copias sin precio; la diferencia no es completa.':'Valor orientativo de mercado.')+'</div></div>'+
    '<div class="tools-controls"><button class="secondary btn" id="toolsSwap">⇄ Cambiar lados</button>'+
    '<button class="secondary btn" id="toolsCopy">Copiar trato</button><button class="danger btn" id="toolsClear">Vaciar</button></div></div>'+
    '<p class="small">El borrador está sincronizado con tu cuenta. No se transfiere ninguna carta hasta que ambos usuarios acepten.</p>';
}
function cheapest(){
  const out=new Map();
  for(const c of state.cards){
    if(isJapaneseCatalogCard(c))continue;
    const p=positive(price(c)),id=printed(c);
    if(p&&(!out.has(id)||p<out.get(id)))out.set(id,p);
  }
  return out;
}
function missing(r,prices){
  const alloc=deckAvailableByPrinting(r),leader=resolveDeckImportCard(r.leaderId);
  let owned=0,absent=0,cost=0,unknown=0;
  const add=(id,need)=>{
    if(!need)return;
    absent+=need;const p=prices.get(printed(id));
    if(p)cost+=p*need;else unknown+=need;
  };
  if(leader&&deckOwnedCopies(leader))owned++;else add(r.leaderId,1);
  for(const [id,q] of Object.entries(r.cards||{})){
    const wanted=Math.max(0,Math.floor(Number(q)||0)),got=Math.min(wanted,Number(alloc[id]||0));
    owned+=got;add(id,wanted-got);
  }
  return {owned,absent,cost,unknown,total:owned+absent};
}
function decksView(){
  let body="";
  if(h.loaded&&state.collectionReady){
    const prices=cheapest();
    const maximum=h.maxMissing===""?Infinity:Number(h.maxMissing);
    const ceiling=h.maxCost===""?Infinity:Number(h.maxCost);
    let rows=h.list.map((r,i)=>({r,i,m:missing(r,prices)}));
    rows=rows.filter(x=>x.m.absent<=maximum&&(h.maxCost===""||(!x.m.unknown&&x.m.cost<=ceiling)));
    rows.sort((a,b)=>h.sort==="cost"?
      Number(!!a.m.unknown)-Number(!!b.m.unknown)||a.m.cost-b.m.cost||a.m.absent-b.m.absent:
      a.m.absent-b.m.absent||Number(!!a.m.unknown)-Number(!!b.m.unknown)||a.m.cost-b.m.cost);
    body='<div class="tools-filters"><label class="control-label">Ordenar por<select class="field" id="toolsSort">'+
      '<option value="missing"'+(h.sort==="missing"?" selected":"")+'>Menos cartas faltantes</option>'+
      '<option value="cost"'+(h.sort==="cost"?" selected":"")+'>Menor presupuesto</option></select></label>'+
      '<label class="control-label">Máximo faltantes<select class="field" id="toolsMaxMissing">'+
      [["","Sin límite"],["0","0"],["4","4"],["8","8"],["12","12"],["20","20"]].map(([v,l])=>
      '<option value="'+v+'"'+(h.maxMissing===v?" selected":"")+'>'+l+'</option>').join("")+'</select></label>'+
      '<label class="control-label">Presupuesto máximo (€)<input id="toolsMaxCost" class="field" type="number" min="0" step="1" value="'+text(h.maxCost)+'" placeholder="Sin límite"></label></div>'+
      '<div class="small">'+rows.length+' mazos visibles de '+h.list.length+' listas · '+Number(h.meta.scannedEvents||0)+' torneos consultados'+
      (h.meta.rateLimited?' · Resultados parciales':"")+'</div>';
    if(!rows.length)body+='<div class="notice">Ninguna lista cumple los filtros. Prueba ampliándolos.</div>';
    else body+='<div class="tools-deckgrid">'+rows.slice(0,48).map(({r,i,m})=>{
      const c=resolveDeckImportCard(r.leaderId);
      return '<div class="tools-item">'+(c?cardImg(c,"thumb"):"")+'<div class="grow"><b>'+text(r.leaderName||r.leaderId)+'</b>'+
        '<div class="small">'+text(r.quality||"")+' · '+text(r.tournament||"")+'</div>'+
        '<div class="tools-numbers"><b>'+m.absent+' faltantes</b><b>'+(m.unknown?"Desde ":"")+money(m.cost)+'</b></div>'+
        '<div class="small">'+m.owned+'/'+m.total+' copias disponibles'+(m.unknown?' · '+m.unknown+' sin precio':'')+'</div>'+
        '<button class="primary btn" data-tools-preview="'+i+'">Ver lista y faltantes</button></div></div>';
    }).join("")+'</div>';
  }
  return '<div class="section"><h2>Mazos que casi puedes construir</h2>'+
    '<p class="small">Analizamos listas públicas competitivas de distintos líderes y las comparamos con las cartas que tienes, contando conjuntamente sus impresiones equivalentes para jugar.</p>'+
    (!state.user?'<div class="notice">Inicia sesión para calcular las cartas que te faltan.</div>':
      !state.collectionReady?'<div class="notice">Cargando tu colección desde Supabase…</div>':"")+
    '<button class="primary btn" id="toolsLoadDecks" '+(h.busy||!state.collectionReady||!state.user?"disabled":"")+'>'+
    (h.busy?"Consultando torneos…":h.loaded?"↻ Actualizar listas":"Buscar mazos para mí")+'</button>'+
    (h.error?'<div class="notice">'+text(h.error)+'</div>':"")+body+
    '<p class="small">Los costes usan la impresión disponible más barata con precio para cada número de carta. Los precios desconocidos se indican y no se consideran coste cero. Solo se incluyen las listas públicas accesibles en la muestra.</p></div>';
}
function tradePage(){
 account();
 if(h.owner&&state.sb&&!h.cloudLoading){
  if(!h.cloudReady&&!h.cloudError)void loadCloud();
  else if(h.cloudReady&&!h.pending&&!h.writing&&!h.cloudConflict&&Date.now()-h.lastCloudAt>30000)void loadCloud(true);
 }
 return '<div class="wrap tools-wrap"><div class="hero"><div><h1>⇄ Intercambios</h1></div></div>'+
  '<nav class="trade-mode-tabs" aria-label="Gestión de intercambios">'+
  '<button type="button" class="secondary btn '+(h.tradeSection==="prepare"?"active":"")+'" id="tradeModePrepare" '+(h.tradeSection==="prepare"?'aria-current="page"':'')+'>Preparar intercambio</button>'+
  '<button type="button" class="secondary btn '+(h.tradeSection==="offers"?"active":"")+'" id="tradeModeOffers" '+(h.tradeSection==="offers"?'aria-current="page"':'')+'>Mis propuestas</button></nav>'+
  (h.tradeSection==="prepare"?cloudMessage()+tradeView():(window.TradeOffers?.view?.()||""))+'</div>';
}
function tradeItems(){
 if(!h.cloudReady||!h.owner||h.cloudConflict||h.pending||h.writing)return null;
 return h.trade.map(rows=>rows.map(x=>({id:x.id,q:x.q})));
}
function bindSearch(input,host,mode){
 const el=document.querySelector(input),target=document.querySelector(host);
 if(!el||!target)return;
 const show=()=>{h.q=el.value;target.innerHTML=searchResults(h.q)};
 // Delegate clicks so replacing the results never destroys the add-card handler.
 target.addEventListener("click",event=>{
  const b=event.target?.closest?.("[data-trade-add]");
  if(!b||!target.contains(b)||!readyToEdit())return;
  const side=Number(b.dataset.tradeAdd),id=b.dataset.card;
  if(![0,1].includes(side)||!card(id))return;
  const found=h.trade[side].find(x=>x.id===id);
  if(found)found.q=Math.min(100,found.q+1);
  else h.trade[side].push({id,q:1,manual:null});
  save();renderShell();
 });
 el.addEventListener("input",show);
 el.addEventListener("search",show);
}
function summary(){
  const side=(i,label)=>label+"\n"+h.trade[i].map(x=>x.q+"x "+(card(x.id)?.name||x.id)+" ("+x.id+") a "+
    money(x.manual||price(card(x.id)))+" / ud").join("\n")+"\nTotal "+money(total(i).amount);
  return "MiAlbumOnePiece — Intercambio\n\n"+side(0,"ENTREGO")+"\n\n"+side(1,"RECIBO")+
    "\n\nDiferencia: "+money(total(1).amount-total(0).amount)+"\nValor orientativo; las cartas sin precio no se suman.";
}
async function loadDecks(){
  if(!state.user||!state.collectionReady)return notify("Inicia sesión y carga tu colección");
  h.busy=true;h.error="";renderShell();
  try{
    const res=await fetch("/api/competitive-decks?leader=all&days=90&minPlayers=16&limit=120");
    const data=await res.json();
    if(!res.ok)throw Error(data.error||"No se pudieron cargar las listas");
    h.list=(Array.isArray(data.results)?data.results:[]).filter(x=>x?.cards&&x.leaderId);
    h.meta={scannedEvents:data.scannedEvents,rateLimited:data.rateLimited};h.loaded=true;
  }catch(err){h.error=String(err.message||err)}
  finally{h.busy=false;if(state.tab==="decks"||state.tab==="deck-completion")renderShell()}
}
function bind(){
  document.querySelector("#toolsCloudRetry")?.addEventListener("click",()=>h.cloudReady?void flushCloud():void loadCloud(true));
  document.querySelector("#toolsCloudKeepRemote")?.addEventListener("click",()=>void resolveConflict(false));
  document.querySelector("#toolsCloudKeepLocal")?.addEventListener("click",()=>void resolveConflict(true));

  if(h.tab==="trade"){
    bindSearch("#toolsSearch","#toolsSearchResults","trade");
    document.querySelectorAll("[data-trade-change]").forEach(b=>b.onclick=()=>{
      if(!readyToEdit())return;
      const [i,j,step]=b.dataset.tradeChange.split(":").map(Number),x=h.trade[i]?.[j];
      if(!x)return;x.q+=step;if(x.q<=0)h.trade[i].splice(j,1);else x.q=Math.min(100,x.q);
      save();renderShell();
    });
    document.querySelectorAll("[data-trade-price]").forEach(b=>b.onchange=()=>{
      if(!readyToEdit())return;
      const [i,j]=b.dataset.tradePrice.split(":").map(Number);
      if(!h.trade[i]?.[j])return;
      h.trade[i][j].manual=positive(b.value);save();renderShell();
    });
    document.querySelectorAll("[data-trade-delete]").forEach(b=>b.onclick=()=>{
      if(!readyToEdit())return;
      const [i,j]=b.dataset.tradeDelete.split(":").map(Number);h.trade[i]?.splice(j,1);save();renderShell();
    });
    document.querySelector("#toolsSwap")?.addEventListener("click",()=>{if(!readyToEdit())return;h.trade.reverse();save();renderShell()});
    document.querySelector("#toolsClear")?.addEventListener("click",()=>{
      if(!readyToEdit())return;
      if(confirm("¿Vaciar ambos lados del intercambio?")){h.trade=[[],[]];save();renderShell()}
    });
    document.querySelector("#toolsCopy")?.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(summary());notify("Resumen copiado")}
      catch{window.prompt("Copia el intercambio",summary())}
    });
  }
  if(h.tab==="decks"){
    document.querySelector("#toolsLoadDecks")?.addEventListener("click",loadDecks);
    document.querySelector("#toolsSort")?.addEventListener("change",ev=>{h.sort=ev.target.value;renderShell()});
    document.querySelector("#toolsMaxMissing")?.addEventListener("change",ev=>{h.maxMissing=ev.target.value;renderShell()});
    document.querySelector("#toolsMaxCost")?.addEventListener("change",ev=>{h.maxCost=ev.target.value;renderShell()});
    document.querySelectorAll("[data-tools-preview]").forEach(b=>b.onclick=()=>{
      const r=h.list[Number(b.dataset.toolsPreview)];if(!r)return;
      state.deckDiscoverResults=[r];state.deckDiscover=true;state.deckDiscoverLeader=printed(r.leaderId);
      state.deckPreviewScrollY=window.scrollY||0;
      openCompetitiveDeckPreview(0,"deck-completion");
    });
  }

}
const style=document.createElement("style");
style.textContent=".tools-tabs,.tools-controls,.tools-total{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tools-tabs{margin-bottom:13px}.tools-selected{border-color:var(--accent)!important;color:var(--accent)!important}.tools-item,.tools-match{display:flex;align-items:center;gap:9px;padding:8px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;margin:7px 0;min-width:0}.tools-item .thumb{width:55px;height:77px;flex:none;object-fit:cover;border-radius:5px}.tools-item .grow{min-width:0}.tools-controls{margin:7px 0}.tools-controls .btn{padding:6px 9px}.tools-price{width:92px!important;padding:7px!important}.tools-direction{width:auto!important;padding:7px!important}.tools-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tools-total{justify-content:space-between}.tools-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}.tools-deckgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.tools-numbers{display:flex;gap:8px;flex-wrap:wrap;color:var(--accent);margin:5px 0}.tools-deckgrid .btn{margin-top:7px}.tools-hit{border-color:var(--ok)}.tools-good{color:var(--ok)}.tools-match>div:not(.grow){min-width:70px;text-align:right}.tools-match .small{line-height:1.5}@media(max-width:760px){.tools-cols,.tools-deckgrid{grid-template-columns:1fr}.tools-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.tools-match{flex-wrap:wrap}.tools-match .grow{flex-basis:100%}}@media(max-width:430px){.tools-filters{grid-template-columns:1fr}.tools-tabs button{flex:1 1 42%}.tools-item{flex-wrap:wrap}.tools-match>div:not(.grow){flex:1;text-align:left}}";
style.textContent+=".tools-leader-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(95px,1fr));gap:8px;max-height:410px;overflow:auto;margin:10px 0}.tools-leader{padding:4px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--text);cursor:pointer;overflow:hidden;text-align:left}.tools-leader.selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.tools-leader[hidden]{display:none}.tools-leader img{width:100%;aspect-ratio:.716;object-fit:cover}.tools-leader span{display:block;padding:5px;font-size:10px;line-height:1.3}";
style.textContent+="/* Standalone search result articles. No nested result markup or competing grids. */\n.tools-results{display:flex;flex-direction:column;align-items:stretch;gap:7px;max-height:390px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;margin-top:9px;width:100%;min-width:0;max-width:100%}\n.tools-results>.tools-found{display:flex;flex:0 0 auto;align-items:center;flex-wrap:nowrap;gap:9px;width:100%;min-width:0;height:auto;margin:0;padding:8px;border:1px solid var(--line);border-radius:11px;background:var(--panel2)}\n.tools-found>img.thumb{display:block;flex:0 0 50px;width:50px;height:70px;min-width:50px;object-fit:cover;border-radius:5px}\n.tools-found-content{display:block;flex:1 1 0;min-width:0;max-width:100%;overflow:hidden;overflow-wrap:break-word;word-break:normal}\n.tools-found-content strong{display:block;font-size:13px;line-height:1.3;white-space:normal;overflow-wrap:break-word;word-break:normal}\n.tools-found-content .small{display:block;margin-top:3px;font-size:11px;line-height:1.35;color:var(--muted);white-space:normal;overflow-wrap:break-word;word-break:normal}\n.tools-found-actions{display:flex;align-items:center;justify-content:flex-end;flex:0 0 auto;gap:6px}\n.tools-found-actions .btn{display:grid;place-items:center;flex:0 0 38px;width:38px;min-width:38px;height:39px;min-height:39px;margin:0;padding:0;font-size:19px}\n@media(max-width:600px){\n .tools-results>.tools-found{align-items:flex-start;flex-wrap:wrap;gap:5px 9px;padding:7px}\n .tools-found>img.thumb{flex-basis:44px;width:44px;min-width:44px;height:62px;align-self:center}\n .tools-found-content{flex:1 1 calc(100% - 55px)}\n .tools-found-actions{flex:0 0 auto;margin-left:53px;justify-content:flex-start}\n .tools-found-actions .btn{flex-basis:38px;width:38px;min-width:38px;height:34px;min-height:34px;font-size:18px}\n}\n/* Owned/received items still have a separate layout, independent of search. */\n.tools-cols,.tools-cols>.section{min-width:0}\n.tools-item{display:flex;flex-wrap:wrap;align-items:flex-start;gap:9px;width:100%;max-width:100%;height:auto;min-height:0;min-width:0;overflow:hidden}\n.tools-item>img.thumb{flex:0 0 55px;width:55px;height:77px;object-fit:cover}\n.tools-item>.grow{flex:1 1 calc(100% - 66px);min-width:0;max-width:100%;word-break:normal;overflow-wrap:break-word}\n.tools-item>.grow>b{display:block;line-height:1.35;white-space:normal;overflow-wrap:break-word;word-break:normal}\n.tools-item>.grow .small{line-height:1.4;white-space:normal;overflow-wrap:break-word;word-break:normal}\n.tools-item>.grow .tools-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;max-width:100%}\n.tools-item>.grow .tools-controls label{display:flex;flex-wrap:wrap;align-items:center;gap:5px;max-width:100%}\n.tools-item>b:last-child{flex:0 1 auto;margin-left:64px;max-width:calc(100% - 64px);font-size:12px;overflow-wrap:break-word}\n@media(max-width:600px){\n .tools-item>img.thumb{flex-basis:48px;width:48px;height:68px}\n .tools-item>.grow{flex-basis:calc(100% - 59px)}\n .tools-item>b:last-child{margin-left:57px;max-width:calc(100% - 57px)}\n .tools-item .tools-price{width:95px!important;max-width:100%}\n}\n";
document.head.appendChild(style);
document.addEventListener?.("visibilitychange",()=>{
  if(!document.hidden&&h.owner&&state.user?.id===h.owner&&state.sb){
    if(h.pending&&!h.cloudConflict)void flushCloud();
    else if(!h.pending&&!h.writing&&h.cloudReady&&Date.now()-h.lastCloudAt>10000)void loadCloud(true);
  }
});
window.OnePieceTools={tradePage,tradeItems,decksView,loadCloud,flushCloud,
 bindTrade:()=>{h.tab="trade";bind();
  document.getElementById("tradeModePrepare")?.addEventListener("click",()=>{if(h.tradeSection!=="prepare"){h.tradeSection="prepare";renderShell()}});
  document.getElementById("tradeModeOffers")?.addEventListener("click",()=>{if(h.tradeSection!=="offers"){h.tradeSection="offers";renderShell()}});
  if(h.tradeSection==="offers")window.TradeOffers?.bind?.();
 },
 bindDecks:()=>{h.tab="decks";bind()}
};
})();