(function(){
"use strict";
/* This module never changes collection quantities or deck records. */
const h={tab:"trade",owner:null,trade:[[],[]],watch:[],q:"",wq:"",list:[],meta:{},loaded:false,busy:false,error:"",
  sort:"missing",maxMissing:"12",maxCost:"",coach:null,coachBusy:false,coachError:"",coachLeader:"",days:90,alertMemo:new Set()};
const key=id=>"mialbumonepiece_tools_"+id;
const text=s=>esc(s);
const price=c=>c?priceOf(c):null;
const num=x=>Math.max(1,Math.min(100,Math.floor(Number(x)||1)));
const positive=x=>Number(x)>0&&Number.isFinite(Number(x))?Number(x):null;
const printed=id=>deckPrintedCode(id);
function account(){
  const id=state.user?.id||null;
  if(h.owner===id)return;
  h.owner=id;h.trade=[[],[]];h.watch=[];h.alertMemo.clear();
  if(!id)return;
  try{
    const v=JSON.parse(localStorage.getItem(key(id))||"{}");
    for(let i=0;i<2;i++)h.trade[i]=(Array.isArray(v.trade?.[i])?v.trade[i]:[]).slice(0,100)
      .filter(x=>typeof x.id==="string").map(x=>({id:x.id,q:num(x.q),manual:positive(x.manual)}));
    h.watch=(Array.isArray(v.watch)?v.watch:[]).slice(0,200).filter(x=>typeof x.id==="string"&&positive(x.target))
      .map(x=>({id:x.id,target:positive(x.target),direction:x.direction==="above"?"above":"below"}));
  }catch(err){console.warn("Herramientas locales",err)}
}
function save(){
  if(!h.owner)return;
  try{localStorage.setItem(key(h.owner),JSON.stringify({trade:h.trade,watch:h.watch}))}
  catch(err){console.warn("Herramientas: almacenamiento lleno",err);notify("No se han podido guardar las herramientas en este navegador")}
}
function matches(q){
  q=norm(String(q||"").trim());if(q.length<2)return [];
  return state.cards.filter(c=>!isJapaneseCatalogCard(c)&&norm([c.id,c.name,c.set,baseId(c.id)].join(" ")).includes(q))
    .sort((a,b)=>qty(b.id)-qty(a.id)||String(a.id).localeCompare(String(b.id),"es",{numeric:true})).slice(0,24);
}
function searchResults(q,mode){
  if(q.trim().length<2)return '<div class="small">Busca por nombre o código (mínimo 2 caracteres).</div>';
  const cards=matches(q);
  if(!cards.length)return '<div class="notice">No se encuentran cartas.</div>';
  return cards.map(c=>'<div class="tools-found">'+cardImg(c,"thumb")+'<div class="grow"><b>'+text(c.name||c.id)+'</b>'+
    '<div class="small">'+text(c.id)+' · '+text(c.set||"")+' · '+money(price(c))+' / copia'+
    (state.user?' · Tengo '+qty(c.id):"")+'</div></div>'+
    (mode==="trade"?'<button class="secondary btn" data-trade-add="0" data-card="'+text(c.id)+'">←</button>'+
      '<button class="primary btn" data-trade-add="1" data-card="'+text(c.id)+'">→</button>':
      '<button class="primary btn" data-watch-add="'+text(c.id)+'">Vigilar</button>')+'</div>').join("");
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
    rows+='<div class="tools-item">'+(c?cardImg(c,"thumb"):"")+
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
    '<p class="small">El intercambio se guarda solo en este navegador, separado por cuenta. Puedes copiar el resumen para enviárselo a otra persona.</p>';
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
function watchState(w){
  const p=positive(price(card(w.id)));
  return {p,hit:!!p&&(w.direction==="above"?p>=w.target:p<=w.target)};
}
function alertsView(){
  const active=h.watch.filter(w=>watchState(w).hit).length;
  return '<section class="section"><h2>Alertas de precios</h2>'+
    '<p class="small">Marca una impresión concreta y un precio objetivo. Los avisos se comprueban al abrir la web con tu sesión. No hay correos ni notificaciones cuando está cerrada.</p>'+
    (state.user?'<input class="field" type="search" id="toolsWatchSearch" placeholder="Buscar impresión…" value="'+text(h.wq)+'">'+
      '<div class="tools-results" id="toolsWatchResults">'+searchResults(h.wq,"watch")+'</div>':
      '<div class="notice">Inicia sesión para crear alertas.</div>')+'</section>'+
    '<section class="section"><div class="sectionhead"><h2>Mis cartas vigiladas</h2><b>'+active+' objetivos alcanzados</b></div>'+
    (h.watch.length?h.watch.map((w,i)=>{
      const c=card(w.id),s=watchState(w);
      return '<div class="tools-item '+(s.hit?"tools-hit":"")+'">'+(c?cardImg(c,"thumb"):"")+
        '<div class="grow"><b>'+text(c?.name||w.id)+'</b><div class="small">'+text(w.id)+' · Actual: '+money(s.p)+'</div>'+
        '<div class="tools-controls"><select class="field tools-direction" data-watch-dir="'+i+'">'+
        '<option value="below"'+(w.direction==="below"?" selected":"")+'>Baje hasta</option>'+
        '<option value="above"'+(w.direction==="above"?" selected":"")+'>Suba hasta</option></select>'+
        '<input class="field tools-price" type="number" min="0.01" step="0.01" value="'+text(w.target)+'" data-watch-target="'+i+'"> €</div></div>'+
        '<div><b class="'+(s.hit?"tools-good":"small")+'">'+(s.hit?"¡Objetivo!":s.p?"En espera":"Sin precio")+'</b>'+
        '<div><button class="danger btn" data-watch-delete="'+i+'">✕</button></div></div></div>';
    }).join(""):'<div class="notice">Todavía no tienes avisos.</div>')+'</section>'+
    '<p class="small">Los avisos se guardan solo en este navegador y se separan por cuenta.</p>';
}
function rate(w,l){
  const n=Number(w||0)+Number(l||0);
  return n?Math.round(1000*Number(w||0)/n)/10+"%":"—";
}
function personal(leader){
  const map=new Map();
  for(const t of state.tournaments||[]){
    const own=t.leaderId||t.deckSnapshot?.leader||state.decks.find(d=>d.id===t.deckId)?.leader||"";
    if(printed(own)!==leader)continue;
    for(const r of t.rounds||[]){
      if(!r.opponentId||!["W","L"].includes(r.result)||["bye","noshow"].includes(r.kind))continue;
      const id=printed(r.opponentId);
      if(!map.has(id))map.set(id,{w:0,l:0,first:{w:0,l:0},second:{w:0,l:0}});
      const rec=map.get(id),f=r.result==="W"?"w":"l";
      rec[f]++;
      if(r.start==="1")rec.first[f]++;
      if(r.start==="2")rec.second[f]++;
    }
  }
  return map;
}
function coachView(){
  const leaders=competitiveLeaderOptions();
  const pick=h.coachLeader||printed(state.decks.find(x=>x.leader)?.leader||"")||leaders[0]?.id||"";
  const own=personal(pick);
  const global=(h.coach?.matchups||[]).filter(x=>printed(x.leader)===pick).sort((a,b)=>b.games-a.games).slice(0,35);
  const ownGames=[...own.values()].reduce((s,v)=>s+v.w+v.l,0);
  let rows="";
  for(const x of global){
    const p=own.get(printed(x.opponent));
    const name=resolveDeckImportCard(x.opponent)?.name||x.opponent;
    rows+='<div class="tools-match"><div class="grow"><b>'+text(name)+'</b><div class="small">'+text(x.opponent)+' · n='+Number(x.games||0)+
      (x.games<10?' (muestra pequeña)':'')+'</div></div><div><b>'+rate(x.wins,x.losses)+'</b><div class="small">Global</div></div>'+
      '<div><b>'+rate(p?.w,p?.l)+'</b><div class="small">Personal · '+Number((p?.w||0)+(p?.l||0))+'</div></div>'+
      '<div class="small">1.º '+rate(p?.first.w,p?.first.l)+'<br>2.º '+rate(p?.second.w,p?.second.l)+'</div></div>';
  }
  return '<section class="section"><h2>Preparar un torneo</h2>'+
    '<p class="small">Consulta los emparejamientos del meta y compáralos con tus propias rondas. Los datos globales son de Limitless y no contienen quién salió primero; esa información solo aparece para tus partidas registradas.</p>'+
    '<div class="tools-filters"><label class="control-label">Mi líder<select class="field" id="toolsCoachLeader">'+
    leaders.map(x=>'<option value="'+text(x.id)+'"'+(pick===x.id?" selected":"")+'>'+text(x.name+" · "+x.id)+'</option>').join("")+'</select></label>'+
    '<label class="control-label">Período<select class="field" id="toolsCoachDays">'+
    [30,90,180,365].map(v=>'<option value="'+v+'"'+(h.days===v?" selected":"")+'>'+v+' días</option>').join("")+
    '</select></label><button class="primary btn" id="toolsCoachLoad" '+(h.coachBusy?"disabled":"")+'>'+
    (h.coachBusy?"Consultando…":"Analizar emparejamientos")+'</button></div>'+
    (h.coachError?'<div class="notice">'+text(h.coachError)+'</div>':"")+
    '<p class="small">'+ownGames+' rondas personales con rival identificado para este líder.</p>'+
    (rows||'<div class="notice">'+(h.coach?"No hay partidas globales suficientes para este líder.":"Elige tu líder y carga el análisis.")+'</div>')+
    '<p class="small">Prioriza practicar contra rivales habituales con mal resultado. Una muestra de pocas partidas no demuestra un emparejamiento favorable o desfavorable.</p></section>';
}
function view(){
  account();
  const links=[["trade","⇄ Intercambio"],["decks","🃏 Mazos accesibles"],["alerts","€ Alertas"],["coach","🏆 Torneos"]];
  return '<div class="wrap tools-wrap"><div class="hero"><div><h1>Herramientas</h1>'+
    '<p>Intercambios, mazos accesibles, alertas y preparación.</p></div></div><div class="tools-tabs">'+
    links.map(([id,label])=>'<button class="secondary btn '+(h.tab===id?"tools-selected":"")+'" data-tools-tab="'+id+'">'+label+'</button>').join("")+'</div>'+
    (h.tab==="trade"?tradeView():h.tab==="decks"?decksView():h.tab==="alerts"?alertsView():coachView())+'</div>';
}
function bindSearch(input,host,mode){
  const el=document.querySelector(input),target=document.querySelector(host);
  if(!el||!target)return;
  const wire=()=>{
    target.querySelectorAll("[data-trade-add]").forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.tradeAdd),id=b.dataset.card;
      if(!card(id))return;
      const found=h.trade[i].find(x=>x.id===id);
      if(found)found.q=Math.min(100,found.q+1);else h.trade[i].push({id,q:1,manual:null});
      save();renderShell();
    });
    target.querySelectorAll("[data-watch-add]").forEach(b=>b.onclick=()=>{
      if(!h.owner)return notify("Inicia sesión para vigilar cartas");
      const id=b.dataset.watchAdd,c=card(id),p=positive(price(c));
      if(!c||h.watch.some(x=>x.id===id))return notify("Esta impresión ya está vigilada");
      h.watch.push({id,target:p?Math.round(p*90)/100:1,direction:"below"});save();renderShell();
      notify("Aviso añadido. Puedes cambiar su objetivo");
    });
  };
  wire();
  el.addEventListener("input",()=>{
    if(mode==="trade")h.q=el.value;else h.wq=el.value;
    target.innerHTML=searchResults(el.value,mode);wire();
  });
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
  finally{h.busy=false;if(state.tab==="tools")renderShell()}
}
async function loadCoach(){
  h.coachBusy=true;h.coachError="";renderShell();
  try{
    const res=await fetch("/api/meta?days="+h.days+"&format=auto");
    const data=await res.json();
    if(!res.ok)throw Error(data.error||"No se pudo cargar el meta");
    h.coach=data;
  }catch(err){h.coachError=String(err.message||err)}
  finally{h.coachBusy=false;if(state.tab==="tools")renderShell()}
}
function checkAlerts(){
  account();if(!state.user||!state.collectionReady||state.loading)return;
  let n=0;
  for(const w of h.watch){
    const x=watchState(w);if(!x.p||!x.hit)continue;
    const id=w.id+":"+w.direction+":"+w.target+":"+x.p;
    if(!h.alertMemo.has(id)){h.alertMemo.add(id);n++}
  }
  if(n)notify(n===1?"Una carta vigilada ha alcanzado su precio objetivo":n+" cartas vigiladas han alcanzado su precio objetivo");
}
function bind(){
  document.querySelectorAll("[data-tools-tab]").forEach(b=>b.onclick=()=>{h.tab=b.dataset.toolsTab;renderShell()});
  if(h.tab==="trade"){
    bindSearch("#toolsSearch","#toolsSearchResults","trade");
    document.querySelectorAll("[data-trade-change]").forEach(b=>b.onclick=()=>{
      const [i,j,step]=b.dataset.tradeChange.split(":").map(Number),x=h.trade[i]?.[j];
      if(!x)return;x.q+=step;if(x.q<=0)h.trade[i].splice(j,1);else x.q=Math.min(100,x.q);
      save();renderShell();
    });
    document.querySelectorAll("[data-trade-price]").forEach(b=>b.onchange=()=>{
      const [i,j]=b.dataset.tradePrice.split(":").map(Number);
      if(!h.trade[i]?.[j])return;
      h.trade[i][j].manual=positive(b.value);save();renderShell();
    });
    document.querySelectorAll("[data-trade-delete]").forEach(b=>b.onclick=()=>{
      const [i,j]=b.dataset.tradeDelete.split(":").map(Number);h.trade[i]?.splice(j,1);save();renderShell();
    });
    document.querySelector("#toolsSwap")?.addEventListener("click",()=>{h.trade.reverse();save();renderShell()});
    document.querySelector("#toolsClear")?.addEventListener("click",()=>{
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
      state.tab="decks";openCompetitiveDeckPreview(0);
    });
  }
  if(h.tab==="alerts"){
    bindSearch("#toolsWatchSearch","#toolsWatchResults","watch");
    document.querySelectorAll("[data-watch-dir]").forEach(b=>b.onchange=()=>{
      const w=h.watch[Number(b.dataset.watchDir)];if(w){w.direction=b.value;save();renderShell()}
    });
    document.querySelectorAll("[data-watch-target]").forEach(b=>b.onchange=()=>{
      const w=h.watch[Number(b.dataset.watchTarget)];
      if(!w)return;
      const n=positive(b.value);if(!n)return notify("Introduce un objetivo mayor que cero");
      w.target=n;save();renderShell();
    });
    document.querySelectorAll("[data-watch-delete]").forEach(b=>b.onclick=()=>{
      h.watch.splice(Number(b.dataset.watchDelete),1);save();renderShell();
    });
  }
  if(h.tab==="coach"){
    document.querySelector("#toolsCoachLeader")?.addEventListener("change",ev=>{h.coachLeader=ev.target.value;renderShell()});
    document.querySelector("#toolsCoachDays")?.addEventListener("change",ev=>{h.days=Number(ev.target.value);h.coach=null;renderShell()});
    document.querySelector("#toolsCoachLoad")?.addEventListener("click",loadCoach);
  }
}
const style=document.createElement("style");
style.textContent=".tools-tabs,.tools-controls,.tools-total{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tools-tabs{margin-bottom:13px}.tools-selected{border-color:var(--accent)!important;color:var(--accent)!important}.tools-results{display:grid;gap:5px;max-height:300px;overflow:auto;margin-top:9px}.tools-found,.tools-item,.tools-match{display:flex;align-items:center;gap:9px;padding:8px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;margin:7px 0;min-width:0}.tools-found .thumb,.tools-item .thumb{width:48px;height:67px;flex:none;object-fit:cover}.tools-item .grow,.tools-found .grow{min-width:0}.tools-controls{margin:7px 0}.tools-controls .btn{padding:6px 9px}.tools-price{width:92px!important;padding:7px!important}.tools-direction{width:auto!important;padding:7px!important}.tools-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tools-total{justify-content:space-between}.tools-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}.tools-deckgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.tools-numbers{display:flex;gap:8px;flex-wrap:wrap;color:var(--accent);margin:5px 0}.tools-deckgrid .btn{margin-top:7px}.tools-hit{border-color:var(--ok)}.tools-good{color:var(--ok)}.tools-match>div:not(.grow){min-width:70px;text-align:right}.tools-match .small{line-height:1.5}@media(max-width:760px){.tools-cols,.tools-deckgrid{grid-template-columns:1fr}.tools-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.tools-match{flex-wrap:wrap}.tools-match .grow{flex-basis:100%}}@media(max-width:430px){.tools-filters{grid-template-columns:1fr}.tools-tabs button{flex:1 1 42%}.tools-item{flex-wrap:wrap}.tools-match>div:not(.grow){flex:1;text-align:left}}";
document.head.appendChild(style);
window.OnePieceTools={view,bind,checkAlerts};
})();