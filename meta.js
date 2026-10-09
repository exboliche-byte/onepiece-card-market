/* Meta competitivo: Limitless y estadísticas agregadas automáticas de torneos de la comunidad. */
(function(){
"use strict";
const m={scope:"global",section:"report",days:90,format:"auto",leader:"",expanded:false,
 global:null,community:null,loading:false,communityLoading:false,error:"",communityError:"",
 lastGlobalAttempt:"",lastCommunityAttempt:"",globalRetryAfter:0,communityRetryAfter:0,
 independent:null,independentBusy:false,independentAt:0};
const css=".meta-page{max-width:1320px;padding-bottom:105px}.meta-tabs{display:flex;gap:7px;overflow-x:auto;padding:9px 0}.meta-tabs button{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:10px;padding:10px 12px;font-weight:800;white-space:nowrap}.meta-tabs button.active{border-color:var(--accent);color:var(--accent);background:#332d19}.meta-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:12px 0}.meta-controls label{display:grid;gap:5px;flex:1;min-width:115px;color:var(--muted);font-size:12px}.meta-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.meta-stat{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:11px}.meta-stat b{font-size:clamp(18px,3vw,25px);display:block}.meta-stat small{font-size:11px;color:var(--muted)}.meta-tier{display:flex;border:1px solid var(--line);background:var(--panel);border-radius:14px;overflow:hidden;margin-bottom:9px}.meta-tier-grade{width:51px;flex:none;display:grid;place-items:center;color:#16191e;font-size:26px;font-weight:950}.meta-tier-grade.s{background:#e9898e}.meta-tier-grade.a{background:#efbb79}.meta-tier-grade.b{background:#e9d68d}.meta-tier-grade.c{background:#a5c6a6}.meta-tier-grade.d{background:#8fb2cb}.meta-tier-grade.unknown{background:#8993a5}.meta-tier-items{display:flex;flex-wrap:wrap;gap:7px;min-width:0;padding:9px}.meta-leader-card{width:88px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;text-align:center;padding:5px}.meta-leader-card img{width:100%;aspect-ratio:.716;object-fit:cover;display:block;border-radius:5px}.meta-leader-card b{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;margin-top:5px}.meta-leader-card small{display:block;color:var(--muted);font-size:10px}.meta-scroller{width:100%;max-height:70vh;overflow:auto;border:1px solid var(--line);border-radius:12px}.meta-table{width:100%;min-width:650px;border-collapse:separate;border-spacing:0;font-size:12px}.meta-table th,.meta-table td{padding:9px 8px;text-align:center;white-space:nowrap;border-right:1px solid #334052;border-bottom:1px solid #334052}.meta-table th{position:sticky;top:0;z-index:2;background:#283246}.meta-table th:first-child{left:0;z-index:4}.meta-table td:first-child{position:sticky;left:0;z-index:1;background:#192333;text-align:left}.meta-table small{display:block;color:#a0adbf;font-size:10px}.meta-win{background:#15513d;color:#bcf7db}.meta-mid{background:#554921;color:#fff4c7}.meta-loss{background:#592933;color:#ffcad4}.meta-no{background:#252b37;color:#929cac}.meta-source{color:var(--muted);font-size:12px;line-height:1.5}.meta-source a{color:var(--accent)}@media(max-width:650px){.meta-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.meta-tier-grade{width:40px;font-size:21px}.meta-leader-card{width:73px}.meta-tier-items{padding:6px;gap:5px}}";
const s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
const $=x=>document.querySelector(x);
const GLOBAL_META_CACHE="mialbumonepiece_meta_public_";
function savedGlobalMeta(key){
  try{
    const entry=JSON.parse(localStorage.getItem(GLOBAL_META_CACHE+key)||"null");
    if(entry&&Date.now()-Number(entry.savedAt||0)<7*86400000&&
       Array.isArray(entry.data?.leaders)&&Array.isArray(entry.data?.matchups))return entry.data;
  }catch(error){console.warn("Meta: caché local no disponible",error)}
  return null;
}
function persistGlobalMeta(key,data){
  try{localStorage.setItem(GLOBAL_META_CACHE+key,JSON.stringify({savedAt:Date.now(),data}))}
  catch(error){console.warn("Meta: no se pudo guardar respaldo local",error)}
}
const integer=x=>Number(x||0).toLocaleString("es-ES");
const rate=(w,l)=>w+l?(100*w/(w+l)).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" %":"—";
function picture(id){
  const key=String(id||"").toUpperCase().split("_")[0];
  return state.cards.find(c=>baseId(c.id)===key&&c.id===baseId(c.id)&&(c.category==="Leader"||c.rarity==="Leader"||c.rarity==="L"))||
    state.cards.find(c=>baseId(c.id)===key&&(c.category==="Leader"||c.rarity==="Leader"||c.rarity==="L"));
}
const name=id=>picture(id)?.name||id;
const art=id=>{const c=picture(id);return c?cardImg(c,"meta-leader-img"):'<div style="height:100px;display:grid;place-items:center">'+esc(id)+'</div>'};
function tier(x){
  if(x.tier)return x.tier;
  if(x.games<20)return "—";
  const v=(Number(x.wins)+12)/(Number(x.games)+24);
  return v>=.555?"S":v>=.52?"A":v>=.48?"B":v>=.445?"C":"D";
}
function active(){
  const v=m.scope==="global"?m.global:m.community;
  return v?{...v,leaders:(v.leaders||[]).map(x=>({...x,tier:tier(x)})),matchups:v.matchups||[]}:null;
}
function statCards(d){
  const isLocal=m.scope==="community";
  const values=[
    [integer(isLocal?d.recordedGames:d.games),isLocal?"Resultados registrados":"Partidas analizadas"],
    [integer(d.leaders.length),"Líderes con estadísticas"],
    [integer(isLocal?d.contributingUsers:d.includedEvents),isLocal?"Jugadores participantes":"Torneos incluidos"],
    [integer(isLocal?d.eligibleTournaments:d.scannedEvents),isLocal?"Torneos finalizados":"Torneos consultados"]
  ];
  return '<div class="meta-stats">'+values.map(([val,title])=>'<div class="meta-stat"><b>'+val+'</b><small>'+title+'</small></div>').join("")+'</div>';
}
function tiers(d){
  if(!d.leaders.length)return '<div class="notice">No hay líderes con suficientes datos públicos.</div>';
  const groups={S:[],A:[],B:[],C:[],D:[],"—":[]};
  for(const l of d.leaders)(groups[l.tier]||groups["—"]).push(l);
  return '<p class="small">Clasificación orientativa según el W/R estabilizado; se necesitan 20 resultados por líder para recibir una letra. No es una predicción.</p>'+
    Object.entries(groups).filter(([,list])=>list.length).map(([grade,list])=>
      '<div class="meta-tier"><div class="meta-tier-grade '+(grade==="—"?"unknown":grade.toLowerCase())+'">'+grade+'</div><div class="meta-tier-items">'+
      list.slice(0,m.expanded?150:20).map(x=>'<button class="meta-leader-card" data-meta-leader="'+esc(x.id)+'">'+art(x.id)+'<b>'+esc(name(x.id))+'</b><small>'+esc(x.id)+'</small><small>'+rate(x.wins,x.losses)+' · '+integer(x.games)+'</small></button>').join("")+
      '</div></div>').join("")+
    '<button class="secondary btn" id="metaExpand">'+(m.expanded?"Mostrar menos":"Mostrar todos los líderes")+'</button>';
}
const pairIndex=d=>new Map(d.matchups.map(x=>[x.leader+"|"+x.opponent,x]));
function coloredCell(x){
  if(!x||x.games<6)return '<td class="meta-no" title="Muestra insuficiente">—</td>';
  const v=100*x.wins/x.games;
  return '<td class="'+(v>=55?"meta-win":v<=45?"meta-loss":"meta-mid")+'" title="'+integer(x.games)+' partidas">'+rate(x.wins,x.losses)+'<small>n='+integer(x.games)+'</small></td>';
}
function matrix(d){
  const leaders=d.leaders.slice(0,m.expanded?26:12),index=pairIndex(d);
  if(!d.matchups.length)return '<div class="notice">No hay enfrentamientos públicos con muestra suficiente.</div>';
  return '<p class="small">Filas: tu líder. Columnas: rival. Verde: favorable. Rojo: desfavorable. Amarillo: equilibrado. —: menos de 6 resultados.</p>'+
    '<div class="meta-scroller"><table class="meta-table"><thead><tr><th>Tu líder / Rival</th>'+
    leaders.map(x=>'<th>'+esc(name(x.id))+'<small>'+esc(x.id)+'</small></th>').join("")+'</tr></thead><tbody>'+
    leaders.map(a=>'<tr><td>'+esc(name(a.id))+'<small>'+esc(a.id)+'</small></td>'+leaders.map(b=>coloredCell(index.get(a.id+"|"+b.id))).join("")+'</tr>').join("")+
    '</tbody></table></div><button class="secondary btn" id="metaExpand" style="margin-top:10px">'+(m.expanded?"Mostrar principales":"Más líderes en la matriz")+'</button>';
}
function matchupTable(d){
  const selected=d.leaders.some(x=>x.id===m.leader)?m.leader:d.leaders[0]?.id||"";
  if(!selected)return '<div class="notice">No hay partidas suficientes para comparar líderes.</div>';
  const rows=d.matchups.filter(x=>x.leader===selected).sort((a,b)=>b.games-a.games);
  return '<label class="control-label" style="margin:10px 0">Tu líder<select class="field" id="metaLeaderSelect">'+
    d.leaders.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===selected?" selected":"")+'>'+esc(name(x.id)+" · "+x.id)+'</option>').join("")+'</select></label>'+
    '<div class="notice">'+(m.scope==="global"?
      'Limitless no registra quién sale primero. Por eso el W/R público por orden de salida se muestra como —, nunca como un dato inventado.':
      'Los datos de primero/segundo solo son visibles cuando cada grupo incluye al menos 6 resultados de 3 usuarios distintos. El total incluye los resultados sin orden registrado.')+'</div>'+
    (rows.length?'<div class="meta-scroller"><table class="meta-table"><thead><tr><th>Rival</th><th>W/R</th><th>V-D</th><th>Primero</th><th>n 1.º</th><th>Segundo</th><th>n 2.º</th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td>'+esc(name(x.opponent))+'<small>'+esc(x.opponent)+'</small></td><td>'+rate(x.wins,x.losses)+'</td><td>'+integer(x.wins)+'-'+integer(x.losses)+'</td>'+
        '<td>'+(x.first?rate(x.first.wins,x.first.losses):"—")+'</td><td>'+(x.first?integer(x.first.games):"—")+'</td>'+
        '<td>'+(x.second?rate(x.second.wins,x.second.losses):"—")+'</td><td>'+(x.second?integer(x.second.games):"—")+'</td></tr>').join("")+
      '</tbody></table></div>':'<div class="notice">Sin emparejamientos de este líder con muestra suficiente.</div>');
}
function ranking(d){
  return '<div class="meta-scroller"><table class="meta-table"><thead><tr><th>Líder</th><th>Resultados</th><th>Victorias</th><th>Derrotas</th><th>W/R</th><th>Tier</th></tr></thead><tbody>'+
    d.leaders.map(x=>'<tr><td><button class="linkbtn" data-meta-leader="'+esc(x.id)+'">'+esc(name(x.id))+'</button><small>'+esc(x.id)+'</small></td><td>'+integer(x.games)+'</td><td>'+integer(x.wins)+'</td><td>'+integer(x.losses)+'</td><td>'+rate(x.wins,x.losses)+'</td><td>'+esc(x.tier)+'</td></tr>').join("")+
    '</tbody></table></div>';
}
const nav=(value,label)=>'<button data-meta-section="'+value+'" class="'+(m.section===value?"active":"")+'">'+label+'</button>';
function view(){
  const community=m.scope==="community",d=active(),loading=community?m.communityLoading:m.loading,error=community?m.communityError:m.error;
  const formats=[["auto","Formato más reciente"],["all","Todos los formatos"],...(m.global?.formats||[]).map(x=>[x,x])];
  return '<div class="wrap meta-page"><div class="hero"><div><h1>⚔️ Meta</h1><p>Tier list, emparejamientos y W/R del One Piece Card Game.</p></div></div>'+
    '<div class="meta-tabs"><button data-meta-scope="global" class="'+(!community?"active":"")+'">🌍 Global</button><button data-meta-scope="community" class="'+(community?"active":"")+'">👥 Comunidad MiAlbumOnePiece</button></div>'+
    '<div class="meta-controls"><label>Período<select class="field" id="metaDays">'+[30,90,180,365].map(x=>'<option value="'+x+'"'+(m.days===x?" selected":"")+'>'+x+' días</option>').join("")+'</select></label>'+
    (!community?'<label>Formato<select class="field" id="metaFormat">'+formats.map(([id,label])=>'<option value="'+esc(id)+'"'+(m.format===id?" selected":"")+'>'+esc(label)+'</option>').join("")+'</select></label>':"")+
    '<button class="secondary btn" id="metaRefresh">↻ Actualizar</button></div>'+
    (community?'<p class="meta-source">Los resultados de los torneos finalizados se incorporan automáticamente al meta de la comunidad. Solo publicamos estadísticas agregadas cuando hay suficiente muestra; nunca mostramos nombres, listas ni comentarios individuales.</p>':'<p class="meta-source">Fuente de torneos: <a href="https://play.limitlesstcg.com" target="_blank" rel="noopener">Limitless</a>. Puedes consultar también el meta independiente del simulador en <a href="https://oplaytcg.com/es/meta-stats" target="_blank" rel="noopener">OPlayTCG</a>; no se mezclan las muestras.</p>')+
    (loading?'<div class="notice">Procesando resultados…</div>':"")+(error?'<div class="notice">'+esc(error)+'</div>':"")+
    (d?'<p class="small">Actualizado '+esc(new Date(d.updatedAt||Date.now()).toLocaleString("es-ES"))+
       (community?" · Datos de todos los torneos finalizados; las muestras pequeñas quedan ocultas":" · Formato: "+esc(d.formatUsed||"—")+(d.formatUsed==="all"?" · Formatos combinados":"")+(d.partial?" · Consulta parcial":"")+(d.stale?" · Última copia disponible":""))+'</p>'+
      statCards(d)+'<div class="meta-tabs">'+nav("report","Informe contrastado")+nav("tiers","Tier list")+nav("matrix","Matriz W/R")+nav("matchups","Matchups · 1.º / 2.º")+nav("leaders","Ranking")+'</div>'+
      (m.section==="report"?(window.renderMetaComparisonReport?.(d,m.independent,m.independentBusy)||"Informe no disponible"):
  m.section==="tiers"?tiers(d):m.section==="matrix"?matrix(d):m.section==="matchups"?matchupTable(d):ranking(d))+
      '<p class="meta-source">Solo se computan resultados identificados, sin inventar datos. Los tiers son orientativos, no predicciones oficiales.</p>':
      (!loading?'<div class="notice">'+(community?"Todavía no hay estadísticas comunitarias con suficiente muestra para mostrarlas. Todos los torneos finalizados ya cuentan automáticamente.":"No hay datos disponibles por el momento.")+'</div>':""))+'</div>';
}
async function loadGlobal(force=false){
  const days=m.days,format=m.format,key=days+":"+format;
  if(m.loading||(!force&&m.lastGlobalAttempt===key&&
    (m.global&&!m.global.stale||Date.now()<m.globalRetryAfter)))return;
  m.lastGlobalAttempt=key;
  m.globalRetryAfter=Date.now()+30000;
  if(!m.global){
    const cached=savedGlobalMeta(key);
    if(cached)m.global={...cached,stale:true};
  }
  m.loading=true;m.error="";if(state.tab==="meta")renderShell();
  try{
    const query=new URLSearchParams({days:String(days),format});
    if(force)query.set("refresh","1");
    const r=await fetch("/api/meta?"+query,{headers:{accept:"application/json"},
      signal:AbortSignal.timeout(40000)});
    const raw=await r.text();let json;
    try{json=JSON.parse(raw)}catch{throw Error("El Meta devolvió una respuesta no válida (HTTP "+r.status+").")}
    if(!r.ok)throw Error(json.error||"No se pudo consultar Limitless (HTTP "+r.status+").");
    if(!Array.isArray(json.leaders)||!Array.isArray(json.matchups))
      throw Error("La respuesta del Meta no contiene estadísticas válidas.");
    persistGlobalMeta(key,json);
    if(days===m.days&&format===m.format){
      m.global=json;
      m.globalRetryAfter=Date.now()+15*60000;
      if(json.partial)m.error="Algunos torneos no pudieron consultarse. La muestra mostrada es parcial.";
    }
  }catch(e){
    if(days===m.days&&format===m.format){
      const cached=m.global||savedGlobalMeta(key);
      if(cached)m.global={...cached,stale:true};
      m.globalRetryAfter=Date.now()+30000;
      m.error=(cached?"Mostrando los últimos datos disponibles. ":"")+
        "La consulta temporalmente no ha respondido: "+String(e.message||e)+". Pulsa Actualizar para reintentar.";
    }
  }finally{m.loading=false;if(state.tab==="meta")renderShell()}
}
async function loadIndependent(force=false){
 if(m.independentBusy||(!force&&m.independent&&Date.now()-m.independentAt<45*60000))return;
 m.independentBusy=true;
 try{
  const r=await fetch("/api/meta-comparison"+(force?"?refresh=1":""),{signal:AbortSignal.timeout(26000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  const data=await r.json();
  if(!Array.isArray(data?.sources))throw Error("Fuentes inválidas");
  m.independent=data;m.independentAt=Date.now();
 }catch(error){console.warn("Fuentes externas del Meta",error);m.independentAt=Date.now()}
 finally{m.independentBusy=false;if(state.tab==="meta"&&m.scope==="global")renderShell()}
}
async function loadCommunity(force=false){
  const days=m.days,key=String(days);
  if(m.communityLoading||(!force&&m.lastCommunityAttempt===key&&
    (m.community||Date.now()<m.communityRetryAfter)))return;
  m.lastCommunityAttempt=key;
  m.communityRetryAfter=Date.now()+30000;
  m.communityLoading=true;m.communityError="";if(state.tab==="meta")renderShell();
  try{
    if(!state.sb)throw Error("Supabase no disponible.");
    const r=await state.sb.rpc("get_community_meta",{p_days:days});
    if(r.error)throw r.error;
    if(days===m.days)m.community=r.data||{leaders:[],matchups:[]};
  }catch(e){m.communityRetryAfter=Date.now()+30000;m.communityError=/get_community_meta|schema cache|404/i.test(String(e.message))?
    "Falta aplicar la migración SQL del meta comunitario.":String(e.message||e)}
  finally{m.communityLoading=false;if(state.tab==="meta")renderShell()}
}
function bind(){
  document.querySelectorAll("[data-meta-scope]").forEach(b=>b.onclick=()=>{m.scope=b.dataset.metaScope;m.leader="";renderShell()});
  document.querySelectorAll("[data-meta-section]").forEach(b=>b.onclick=()=>{m.section=b.dataset.metaSection;renderShell()});
  document.querySelectorAll("[data-meta-leader]").forEach(b=>b.onclick=()=>{m.leader=b.dataset.metaLeader;m.section="matchups";renderShell()});
  $("#metaDays")?.addEventListener("change",e=>{m.days=Number(e.target.value);m.global=null;m.community=null;renderShell()});
  $("#metaFormat")?.addEventListener("change",e=>{m.format=e.target.value;m.global=null;renderShell()});
  $("#metaLeaderSelect")?.addEventListener("change",e=>{m.leader=e.target.value;renderShell()});
  $("#metaExpand")?.addEventListener("click",()=>{m.expanded=!m.expanded;renderShell()});
  $("#metaRefresh")?.addEventListener("click",()=>{
  if(m.scope==="global"){void loadGlobal(true);void loadIndependent(true)}
  else void loadCommunity(true);
});
  if(m.scope==="global"){void loadGlobal();void loadIndependent()}else void loadCommunity()
}
window.metaView=view;window.metaBind=bind;
})();