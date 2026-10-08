/* Meta competitivo: datos de Limitless separados de estadísticas voluntarias de la comunidad. */
(function(){
"use strict";
const m={scope:"global",section:"tiers",days:90,format:"auto",leader:"",expanded:false,
 global:null,community:null,loading:false,communityLoading:false,error:"",communityError:"",
 consent:null,consentUser:null,consentLoading:false,consentSaving:false};
const css=".meta-page{max-width:1320px;padding-bottom:105px}.meta-tabs{display:flex;gap:7px;overflow-x:auto;padding:9px 0}.meta-tabs button{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:10px;padding:10px 12px;font-weight:800;white-space:nowrap}.meta-tabs button.active{border-color:var(--accent);color:var(--accent);background:#332d19}.meta-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:12px 0}.meta-controls label{display:grid;gap:5px;flex:1;min-width:115px;color:var(--muted);font-size:12px}.meta-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.meta-stat{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:11px}.meta-stat b{font-size:clamp(18px,3vw,25px);display:block}.meta-stat small{font-size:11px;color:var(--muted)}.meta-tier{display:flex;border:1px solid var(--line);background:var(--panel);border-radius:14px;overflow:hidden;margin-bottom:9px}.meta-tier-grade{width:51px;flex:none;display:grid;place-items:center;color:#16191e;font-size:26px;font-weight:950}.meta-tier-grade.s{background:#e9898e}.meta-tier-grade.a{background:#efbb79}.meta-tier-grade.b{background:#e9d68d}.meta-tier-grade.c{background:#a5c6a6}.meta-tier-grade.d{background:#8fb2cb}.meta-tier-grade.unknown{background:#8993a5}.meta-tier-items{display:flex;flex-wrap:wrap;gap:7px;min-width:0;padding:9px}.meta-leader-card{width:88px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;text-align:center;padding:5px}.meta-leader-card img{width:100%;aspect-ratio:.716;object-fit:cover;display:block;border-radius:5px}.meta-leader-card b{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;margin-top:5px}.meta-leader-card small{display:block;color:var(--muted);font-size:10px}.meta-scroller{width:100%;max-height:70vh;overflow:auto;border:1px solid var(--line);border-radius:12px}.meta-table{width:100%;min-width:650px;border-collapse:separate;border-spacing:0;font-size:12px}.meta-table th,.meta-table td{padding:9px 8px;text-align:center;white-space:nowrap;border-right:1px solid #334052;border-bottom:1px solid #334052}.meta-table th{position:sticky;top:0;z-index:2;background:#283246}.meta-table th:first-child{left:0;z-index:4}.meta-table td:first-child{position:sticky;left:0;z-index:1;background:#192333;text-align:left}.meta-table small{display:block;color:#a0adbf;font-size:10px}.meta-win{background:#15513d;color:#bcf7db}.meta-mid{background:#554921;color:#fff4c7}.meta-loss{background:#592933;color:#ffcad4}.meta-no{background:#252b37;color:#929cac}.meta-consent{border:1px solid #496a5d;background:#192722;padding:14px;border-radius:14px;margin:14px 0}.meta-consent p,.meta-source{color:var(--muted);font-size:12px;line-height:1.5}.meta-source a{color:var(--accent)}@media(max-width:650px){.meta-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.meta-tier-grade{width:40px;font-size:21px}.meta-leader-card{width:73px}.meta-tier-items{padding:6px;gap:5px}}";
const s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
const $=x=>document.querySelector(x);
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
    [integer(isLocal?d.consentingUsers:d.scannedEvents),isLocal?"Cuentas inscritas":"Torneos consultados"]
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
function consentView(){
  if(!state.user)return '<div class="meta-consent"><b>Participa en el meta de MiAlbumOnePiece</b><p>Inicia sesión para incluir de forma voluntaria estadísticas anónimas de tus torneos. No se comparte ningún torneo individual.</p><button class="secondary btn" data-tab="account">Ir a Cuenta</button></div>';
  return '<div class="meta-consent"><b>Compartir resultados: '+(m.consent===true?"Sí":"No")+'</b>'+
    '<p>Solo resultados W/L de torneos finalizados: nunca nombres, posiciones, comentarios ni listas. Para retirar tus resultados basta con desactivar esta opción. Las estadísticas necesitan 3 cuentas y 6 partidas por grupo.</p>'+
    (m.consent===null?'<span class="small">Consultando tu consentimiento…</span>':
      '<button id="metaConsent" class="'+(m.consent?"secondary":"primary")+' btn"'+(m.consentSaving?" disabled":"")+'>'+(m.consent?"Dejar de participar":"Participar con mis resultados")+'</button>')+'</div>';
}
function view(){
  const community=m.scope==="community",d=active(),loading=community?m.communityLoading:m.loading,error=community?m.communityError:m.error;
  const formats=[["auto","Formato más reciente"],["all","Todos los formatos"],...(m.global?.formats||[]).map(x=>[x,x])];
  return '<div class="wrap meta-page"><div class="hero"><div><h1>⚔️ Meta</h1><p>Tier list, emparejamientos y W/R del One Piece Card Game.</p></div></div>'+
    '<div class="meta-tabs"><button data-meta-scope="global" class="'+(!community?"active":"")+'">🌍 Global</button><button data-meta-scope="community" class="'+(community?"active":"")+'">👥 Comunidad MiAlbumOnePiece</button></div>'+
    '<div class="meta-controls"><label>Período<select class="field" id="metaDays">'+[30,90,180,365].map(x=>'<option value="'+x+'"'+(m.days===x?" selected":"")+'>'+x+' días</option>').join("")+'</select></label>'+
    (!community?'<label>Formato<select class="field" id="metaFormat">'+formats.map(([id,label])=>'<option value="'+esc(id)+'"'+(m.format===id?" selected":"")+'>'+esc(label)+'</option>').join("")+'</select></label>':"")+
    '<button class="secondary btn" id="metaRefresh">↻ Actualizar</button></div>'+
    (community?consentView():'<p class="meta-source">Fuente de torneos: <a href="https://play.limitlesstcg.com" target="_blank" rel="noopener">Limitless</a>. Puedes consultar también el meta independiente del simulador en <a href="https://oplaytcg.com/es/meta-stats" target="_blank" rel="noopener">OPlayTCG</a>; no se mezclan las muestras.</p>')+
    (loading?'<div class="notice">Procesando resultados…</div>':"")+(error?'<div class="notice">'+esc(error)+'</div>':"")+
    (d?'<p class="small">Actualizado '+esc(new Date(d.updatedAt||Date.now()).toLocaleString("es-ES"))+
       (community?" · Estadísticas voluntarias y no representativas de todos los usuarios":" · Formato: "+esc(d.formatUsed||"—")+(d.formatUsed==="all"?" · Formatos combinados":"")+(d.partial?" · Consulta parcial":""))+'</p>'+
      statCards(d)+'<div class="meta-tabs">'+nav("tiers","Tier list")+nav("matrix","Matriz W/R")+nav("matchups","Matchups · 1.º / 2.º")+nav("leaders","Ranking")+'</div>'+
      (m.section==="tiers"?tiers(d):m.section==="matrix"?matrix(d):m.section==="matchups"?matchupTable(d):ranking(d))+
      '<p class="meta-source">Solo se computan resultados identificados, sin inventar datos. Los tiers son orientativos, no predicciones oficiales.</p>':
      (!loading?'<div class="notice">'+(community?"Sin datos comunitarios públicos. Es necesario aplicar la migración SQL y disponer de participantes voluntarios suficientes.":"No hay datos disponibles por el momento.")+'</div>':""))+'</div>';
}
async function loadGlobal(force=false){
  if(m.loading||m.global&&!force)return;
  const days=m.days,format=m.format;
  m.loading=true;m.error="";if(state.tab==="meta")renderShell();
  try{
    const query=new URLSearchParams({days:String(days),format});if(force)query.set("refresh","1");
    const r=await fetch("/api/meta?"+query,{headers:{accept:"application/json"}});
    const json=await r.json();if(!r.ok)throw Error(json.error||"No se pudo consultar Limitless.");
    if(days===m.days&&format===m.format){m.global=json;if(json.partial)m.error="Algunos torneos no pudieron consultarse. La muestra mostrada es parcial."}
  }catch(e){m.error=String(e.message||e)}
  finally{m.loading=false;if(state.tab==="meta")renderShell()}
}
async function loadCommunity(force=false){
  if(m.communityLoading||m.community&&!force)return;
  const days=m.days;
  m.communityLoading=true;m.communityError="";if(state.tab==="meta")renderShell();
  try{
    if(!state.sb)throw Error("Supabase no disponible.");
    const r=await state.sb.rpc("get_community_meta",{p_days:days});
    if(r.error)throw r.error;
    if(days===m.days)m.community=r.data||{leaders:[],matchups:[]};
  }catch(e){m.communityError=/get_community_meta|schema cache|404/i.test(String(e.message))?
    "Falta aplicar la migración SQL del meta comunitario.":String(e.message||e)}
  finally{m.communityLoading=false;if(state.tab==="meta")renderShell()}
}
async function loadConsent(){
  const id=state.user?.id||"";
  if(m.consentUser===id||m.consentLoading)return;
  m.consentUser=id;m.consent=null;
  if(!id||!state.sb)return;
  m.consentLoading=true;
  try{
    const r=await state.sb.from("meta_opt_ins").select("enabled").eq("user_id",id).maybeSingle();
    if(r.error)throw r.error;
    if(m.consentUser===id)m.consent=!!r.data?.enabled;
  }catch{if(m.consentUser===id)m.consent=false}
  finally{m.consentLoading=false;if(state.tab==="meta")renderShell()}
}
async function changeConsent(){
  const id=state.user?.id;if(!id||!state.sb||m.consentSaving)return;
  m.consentSaving=true;
  try{
    const enabled=m.consent!==true;
    const r=await state.sb.from("meta_opt_ins").upsert({user_id:id,enabled,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(r.error)throw r.error;
    if(state.user?.id===id){m.consent=enabled;m.community=null;await loadCommunity(true)}
  }catch{m.communityError="No se pudo modificar tu consentimiento. Comprueba la migración."}
  finally{m.consentSaving=false;if(state.tab==="meta")renderShell()}
}
function bind(){
  document.querySelectorAll("[data-meta-scope]").forEach(b=>b.onclick=()=>{m.scope=b.dataset.metaScope;m.leader="";renderShell()});
  document.querySelectorAll("[data-meta-section]").forEach(b=>b.onclick=()=>{m.section=b.dataset.metaSection;renderShell()});
  document.querySelectorAll("[data-meta-leader]").forEach(b=>b.onclick=()=>{m.leader=b.dataset.metaLeader;m.section="matchups";renderShell()});
  $("#metaDays")?.addEventListener("change",e=>{m.days=Number(e.target.value);m.global=null;m.community=null;renderShell()});
  $("#metaFormat")?.addEventListener("change",e=>{m.format=e.target.value;m.global=null;renderShell()});
  $("#metaLeaderSelect")?.addEventListener("change",e=>{m.leader=e.target.value;renderShell()});
  $("#metaExpand")?.addEventListener("click",()=>{m.expanded=!m.expanded;renderShell()});
  $("#metaRefresh")?.addEventListener("click",()=>m.scope==="global"?void loadGlobal(true):void loadCommunity(true));
  $("#metaConsent")?.addEventListener("click",changeConsent);
  if(m.scope==="global")void loadGlobal();else{void loadCommunity();void loadConsent()}
}
window.metaView=view;window.metaBind=bind;
})();