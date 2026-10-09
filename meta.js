/* Meta competitivo: Limitless y estadísticas agregadas automáticas de torneos de la comunidad. */
(function(){
"use strict";
const m={scope:"global",section:"tiers",days:90,format:"auto",leader:"",expanded:false,turnSort:"games",
 global:null,community:null,loading:false,communityLoading:false,error:"",communityError:"",
 lastGlobalAttempt:"",lastCommunityAttempt:"",globalRetryAfter:0,communityRetryAfter:0,
 independent:null,independentBusy:false,independentAt:0};
const css=".meta-page{max-width:1320px;padding-bottom:105px}.meta-tabs{display:flex;gap:7px;overflow-x:auto;padding:9px 0}.meta-tabs button{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:10px;padding:10px 12px;font-weight:800;white-space:nowrap}.meta-tabs button.active{border-color:var(--accent);color:var(--accent);background:#332d19}.meta-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:12px 0}.meta-controls label{display:grid;gap:5px;flex:1;min-width:115px;color:var(--muted);font-size:12px}.meta-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.meta-stat{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:11px}.meta-stat b{font-size:clamp(18px,3vw,25px);display:block}.meta-stat small{font-size:11px;color:var(--muted)}.meta-tier{display:flex;border:1px solid var(--line);background:var(--panel);border-radius:14px;overflow:hidden;margin-bottom:9px}.meta-tier-grade{width:51px;flex:none;display:grid;place-items:center;color:#16191e;font-size:26px;font-weight:950}.meta-tier-grade.s{background:#e9898e}.meta-tier-grade.a{background:#efbb79}.meta-tier-grade.b{background:#e9d68d}.meta-tier-grade.c{background:#a5c6a6}.meta-tier-grade.d{background:#8fb2cb}.meta-tier-grade.unknown{background:#8993a5}.meta-tier-items{display:flex;flex-wrap:wrap;gap:7px;min-width:0;padding:9px}.meta-leader-card{width:88px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;text-align:center;padding:5px}.meta-leader-card img{width:100%;aspect-ratio:.716;object-fit:cover;display:block;border-radius:5px}.meta-leader-card b{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;margin-top:5px}.meta-leader-card small{display:block;color:var(--muted);font-size:10px}.meta-scroller{width:100%;max-height:70vh;overflow:auto;border:1px solid var(--line);border-radius:12px}.meta-table{width:100%;min-width:650px;border-collapse:separate;border-spacing:0;font-size:12px}.meta-table th,.meta-table td{padding:9px 8px;text-align:center;white-space:nowrap;border-right:1px solid #334052;border-bottom:1px solid #334052}.meta-table th{position:sticky;top:0;z-index:2;background:#283246}.meta-table th:first-child{left:0;z-index:4}.meta-table td:first-child{position:sticky;left:0;z-index:1;background:#192333;text-align:left}.meta-table small{display:block;color:#a0adbf;font-size:10px}.meta-win{background:#15513d;color:#bcf7db}.meta-mid{background:#554921;color:#fff4c7}.meta-loss{background:#592933;color:#ffcad4}.meta-no{background:#252b37;color:#929cac}.meta-source{color:var(--muted);font-size:12px;line-height:1.5}.meta-source a{color:var(--accent)}@media(max-width:650px){.meta-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.meta-tier-grade{width:40px;font-size:21px}.meta-leader-card{width:73px}.meta-tier-items{padding:6px;gap:5px}}";
const s=document.createElement("style");s.textContent=css;document.head.appendChild(s);
const visual=document.createElement("style");visual.textContent=
".meta-page{max-width:1400px}.meta-sample-note{margin:10px 0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:12px;color:var(--muted)}.meta-sample-note b{color:var(--accent)}.meta-tabs{scrollbar-width:thin}.meta-source-switch{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.meta-source-switch button{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);color:var(--text);font-weight:800}.meta-source-switch button.selected{border-color:var(--accent);color:var(--accent)}.meta-source-switch button:disabled{opacity:.55}.meta-tier-visual .meta-tier-items{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:9px;padding:12px}.meta-tier-visual .meta-leader-visual{width:100%;min-width:0;padding:9px;display:grid;justify-items:center;align-content:start;gap:5px}.meta-leader-visual img{width:100%;max-width:100px;aspect-ratio:.716;object-fit:cover}.meta-leader-visual b{max-width:100%;white-space:normal;min-height:2.5em;line-height:1.2}.meta-leader-visual strong{font-size:17px;color:var(--accent)}.meta-wr-bar{width:100%;height:6px;background:#363a4c;border-radius:8px;overflow:hidden}.meta-wr-bar span{display:block;height:100%;background:#69d7a9}.meta-wr-legend{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}.meta-wr-legend span{padding:5px 8px;border-radius:7px;font-size:11px;font-weight:800}.meta-wr-great{background:#145735!important;color:#d8ffeb!important}.meta-wr-good{background:#286446!important;color:#d8ffeb!important}.meta-wr-even{background:#5c5024!important;color:#fff0c1!important}.meta-wr-bad{background:#6b3c32!important;color:#ffe7d5!important}.meta-wr-poor{background:#65263c!important;color:#ffcadc!important}.meta-matrix-scroll{max-height:80dvh}.meta-matrix-table{min-width:880px;table-layout:fixed}.meta-matrix-table th:first-child,.meta-matrix-table td:first-child{width:155px}.meta-matrix-table th:not(:first-child),.meta-matrix-table td:not(:first-child){width:85px;min-width:85px}.meta-matrix-table th{white-space:normal;padding:8px 3px}.meta-matrix-table th small{white-space:normal;max-height:34px;overflow:hidden}.meta-matrix-table td{padding:9px 3px}.meta-matrix-table td:first-child{text-align:left;white-space:normal}.meta-matrix-table td:first-child strong{display:block;font-size:11px}.meta-matrix-avatar img{width:34px;height:48px;border-radius:4px;object-fit:cover}.meta-matrix-table td:first-child .meta-matrix-avatar img{float:left;margin:0 8px 0 0;width:29px;height:40px}.meta-wr-cell b{display:block;font-size:12px}.meta-wr-cell small{display:block;opacity:.8;color:inherit;font-size:9px}.meta-wr-diagonal{background:var(--panel2)!important;color:var(--muted)}.meta-turn-intro{border:1px solid var(--line);border-radius:12px;padding:13px;background:var(--panel);margin:10px 0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}.meta-turn-intro strong{font-size:16px}.meta-turn-intro span{font-size:12px;color:var(--muted)}.meta-turn-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.meta-turn-controls label{display:grid;gap:5px;font-size:12px;color:var(--muted)}.meta-turn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(295px,1fr));gap:10px}.meta-turn-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;gap:10px;min-width:0}.meta-turn-leader{display:flex;gap:10px;align-items:center}.meta-turn-leader img{width:45px;height:63px;border-radius:6px;object-fit:cover}.meta-turn-leader div{min-width:0}.meta-turn-leader b{display:block}.meta-turn-leader small{display:block;color:var(--muted);font-size:11px}.meta-turn-bars{display:grid;gap:9px}.meta-turn-line{display:grid;grid-template-columns:62px minmax(0,1fr) 48px 58px;gap:5px;align-items:center;font-size:11px}.meta-turn-track{height:11px;background:var(--panel2);overflow:hidden;border-radius:9px}.meta-turn-track i{display:block;height:100%;border-radius:9px;background:#69aef1}.meta-turn-line:nth-child(2) i{background:#deab64}.meta-turn-line b{text-align:right;font-size:12px}.meta-turn-line small{color:var(--muted);text-align:right}.meta-turn-diff{text-align:center;font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:7px;margin:0}@media(max-width:650px){.meta-tier-visual .meta-tier-items{grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;padding:7px}.meta-turn-controls{grid-template-columns:1fr}.meta-turn-grid{grid-template-columns:1fr}.meta-tier-grade{width:42px}}";
document.head.appendChild(visual);
const $=x=>document.querySelector(x);
const GLOBAL_META_CACHE="mialbumonepiece_meta_public_";
function savedGlobalMeta(key){
  try{
    const entry=JSON.parse(localStorage.getItem(GLOBAL_META_CACHE+key)||"null");
    if(entry&&entry.data?.source==="Unified"&&Date.now()-Number(entry.savedAt||0)<7*86400000&&
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


function simulatorData(){
 const x=m.global;
 return x?.sources?.simulator?.available?
  {leaders:(x.leaders||[]).filter(l=>l.firstGames>0&&l.secondGames>0),
   games:x.simulatorGames,measuredAt:x.sources.simulator.date}:null;
}
function tiers(d){
 if(!d.leaders.length)return '<div class="notice">Sin datos suficientes para clasificar líderes.</div>';
 const groups={S:[],A:[],B:[],C:[],D:[],"—":[]};
 for(const x of d.leaders)(groups[x.tier]||groups["—"]).push(x);
 for(const list of Object.values(groups))list.sort((a,b)=>b.games-a.games);
 return '<p class="small">Clasificación única: W/R combinado de torneos y simulador, ponderado para que ninguna fuente tape a la otra. Toca un líder para analizarlo.</p>'+
  Object.entries(groups).filter(([,list])=>list.length).map(([k,list])=>
    '<section class="meta-tier meta-tier-visual"><div class="meta-tier-grade '+(k==="—"?"unknown":k.toLowerCase())+'">'+k+'</div>'+
    '<div class="meta-tier-items">'+list.slice(0,m.expanded?100:24).map(x=>
      '<button class="meta-leader-card meta-leader-visual" data-meta-leader="'+esc(x.id)+'">'+
      art(x.id)+'<b>'+esc(name(x.id))+'</b><small>'+esc(x.id)+'</small>'+
      '<strong>'+Number(x.rate).toLocaleString("es-ES",{maximumFractionDigits:1})+' %</strong>'+
      '<span class="meta-wr-bar"><span style="width:'+Math.max(0,Math.min(100,Number(x.rate))).toFixed(1)+'%"></span></span>'+
      '<small>'+integer(x.games)+' partidas · '+(x.sourcesCount===2?'2 fuentes':'1 fuente')+'</small></button>').join("")+
    '</div></section>').join("")+
  '<button class="secondary btn" id="metaExpand">'+(m.expanded?"Mostrar menos":"Ver todos los líderes")+'</button>';
}

const pairIndex=d=>new Map(d.matchups.map(x=>[x.leader+"|"+x.opponent,x]));

function coloredCell(x,a,b){
 if(a===b)return '<td class="meta-wr-diagonal">·</td>';
 if(!x||x.games<6)return '<td class="meta-no" title="Muestra insuficiente (<6)">—</td>';
 const v=Number.isFinite(x.rate)?x.rate:100*x.wins/x.games;
 const cls=v>=65?"meta-wr-great":v>=55?"meta-wr-good":v>45?"meta-wr-even":v>35?"meta-wr-bad":"meta-wr-poor";
 return '<td class="meta-wr-cell '+cls+'" title="'+esc(name(a))+' vs '+esc(name(b))+' · '+x.wins+' victorias, '+x.losses+' derrotas">'+
  '<b>'+v.toLocaleString("es-ES",{maximumFractionDigits:1})+' %</b><small>'+integer(x.games)+' partidas'+(x.source==='combined'?' · 2 fuentes':'')+'</small></td>';
}
function matrix(d){
 const leaders=d.leaders,index=pairIndex(d);
 if(!d.matchups.length)return '<div class="notice">Sin suficientes enfrentamientos para la matriz.</div>';
 const avatar=id=>'<span class="meta-matrix-avatar">'+art(id)+'</span>';
 const legend='<div class="meta-wr-legend"><span class="meta-wr-great">≥65%</span><span class="meta-wr-good">55–65%</span>'+
   '<span class="meta-wr-even">45–55%</span><span class="meta-wr-bad">35–45%</span><span class="meta-wr-poor">≤35%</span></div>';
 return '<p class="small">Matriz única de enfrentamientos reales de las dos fuentes. Filas: tu líder · columnas: rival; desliza para explorar todos. Mínimo 6 partidas por casilla.</p>'+legend+
  '<div class="meta-scroller meta-matrix-scroll"><table class="meta-table meta-matrix-table"><thead><tr>'+
   '<th>Tu líder ↓ / Rival →</th>'+leaders.map(x=>'<th>'+avatar(x.id)+'<small>'+esc(name(x.id))+'</small></th>').join("")+
   '</tr></thead><tbody>'+leaders.map(a=>'<tr><td>'+avatar(a.id)+'<strong>'+esc(name(a.id))+'</strong><small>'+esc(a.id)+'</small></td>'+
    leaders.map(b=>coloredCell(index.get(a.id+"|"+b.id),a.id,b.id)).join("")+'</tr>').join("")+
   '</tbody></table></div><button class="secondary btn" id="metaExpand" style="margin-top:12px">'+
   (m.expanded?"Mostrar 12 líderes":"Ampliar a "+Math.min(28,d.leaders.length)+" líderes")+'</button>';
}


function firstSecondView(d){
 if(m.scope==="global"){
  const sim=simulatorData();
  if(!sim)return '<div class="notice">Cargando las estadísticas de salir primero o segundo de OPlayTCG… '+
    'Limitless no publica este dato para sus torneos.</div>';
  const leaders=sim.leaders.filter(x=>Number.isFinite(x.firstRate)&&Number.isFinite(x.secondRate)&&
    x.firstGames>0&&x.secondGames>0);
  let filtered=m.leader?leaders.filter(x=>x.id===m.leader):[...leaders];
  if(m.turnSort==="first")filtered.sort((a,b)=>(b.firstRate-b.secondRate)-(a.firstRate-a.secondRate));
  else if(m.turnSort==="second")filtered.sort((a,b)=>(b.secondRate-b.firstRate)-(a.secondRate-a.firstRate));
  else filtered.sort((a,b)=>b.games-a.games);
  const tiles=filtered.slice(0,m.expanded?100:18).map(x=>{
    const diff=x.firstRate-x.secondRate;
    return '<article class="meta-turn-card"><div class="meta-turn-leader">'+art(x.id)+
      '<div><b>'+esc(name(x.id))+'</b><small>'+esc(x.id)+' · '+integer(x.simulator?.games||x.games)+' partidas de simulador</small>'+
      '<small>W/R combinado: '+Number(x.rate).toLocaleString("es-ES",{maximumFractionDigits:1})+' %</small></div></div>'+
      '<div class="meta-turn-bars">'+
       '<div class="meta-turn-line"><span>🥇 1.º</span><div class="meta-turn-track"><i style="width:'+x.firstRate+'%"></i></div>'+
       '<b>'+x.firstRate.toFixed(1)+'%</b><small>n='+integer(x.firstGames)+'</small></div>'+
       '<div class="meta-turn-line"><span>🥈 2.º</span><div class="meta-turn-track"><i style="width:'+x.secondRate+'%"></i></div>'+
       '<b>'+x.secondRate.toFixed(1)+'%</b><small>n='+integer(x.secondGames)+'</small></div></div>'+
      '<p class="meta-turn-diff">'+(Math.abs(diff)<1?"Equilibrado":diff>0?"↑ Ventaja saliendo primero":"↓ Ventaja saliendo segundo")+
      ' · '+Math.abs(diff).toFixed(1)+' puntos</p></article>';
  }).join("");
  return '<div class="meta-turn-intro"><strong>🥇 ¿Primero o segundo?</strong>'+
    '<span>🎮 OPlayTCG · '+integer(sim.games)+' partidas analizadas'+
    (sim.measuredAt?' · '+esc(sim.measuredAt):"")+'</span></div>'+
    '<div class="meta-turn-controls"><label>Filtrar líder<select class="field" id="metaTurnLeader">'+
    '<option value="">Todos los líderes</option>'+leaders.map(x=>
      '<option value="'+esc(x.id)+'"'+(m.leader===x.id?' selected':"")+'>'+esc(name(x.id))+' · '+esc(x.id)+'</option>').join("")+
    '</select></label><label>Ordenar por<select class="field" id="metaTurnSort">'+
    [['games','Más partidas'],['first','Mayor ventaja 1.º'],['second','Mayor ventaja 2.º']].map(([v,l])=>
      '<option value="'+v+'"'+(m.turnSort===v?' selected':"")+'>'+l+'</option>').join("")+
    '</select></label></div>'+
    '<div class="meta-turn-grid">'+tiles+'</div>'+
    (!filtered.length?'<div class="notice">No hay desglose de ese líder con muestra comprobada.</div>':"")+
    (!m.leader&&filtered.length>18?'<button class="secondary btn" id="metaExpand">'+
      (m.expanded?"Mostrar menos":"Ver todos los "+filtered.length+" líderes")+'</button>':"")+
    '<p class="small">Son partidas del simulador, no torneos. Cada barra incluye el número de partidas correspondiente; nunca extrapolamos al resto.</p>';
 }
 const current=d.leaders.some(x=>x.id===m.leader)?m.leader:d.leaders[0]?.id||"";
 const rows=d.matchups.filter(x=>x.leader===current&&(x.first||x.second)).sort((a,b)=>b.games-a.games);
 return '<p class="small">👥 Datos comunitarios agregados, solo si cumplen los umbrales de privacidad.</p>'+
  '<label>Líder<select class="field" id="metaLeaderSelect">'+d.leaders.map(x=>
    '<option value="'+esc(x.id)+'"'+(current===x.id?' selected':"")+'>'+esc(name(x.id))+'</option>').join("")+'</select></label>'+
  (rows.length?'<div class="meta-turn-grid">'+rows.map(x=>
    '<article class="meta-turn-card"><strong>'+esc(name(x.opponent))+'</strong>'+
    '<p>Primero: '+(x.first?rate(x.first.wins,x.first.losses):"—")+
    ' · n='+(x.first?integer(x.first.games):"—")+'</p>'+
    '<p>Segundo: '+(x.second?rate(x.second.wins,x.second.losses):"—")+
    ' · n='+(x.second?integer(x.second.games):"—")+'</p></article>').join("")+'</div>':
    '<div class="notice">Sin muestra suficiente para ese líder.</div>');
}
function ranking(d){
  return '<div class="meta-scroller"><table class="meta-table"><thead><tr><th>Líder</th><th>Resultados</th><th>Victorias</th><th>Derrotas</th><th>W/R</th><th>Tier</th></tr></thead><tbody>'+
    d.leaders.map(x=>'<tr><td><button class="linkbtn" data-meta-leader="'+esc(x.id)+'">'+esc(name(x.id))+'</button><small>'+esc(x.id)+'</small></td><td>'+integer(x.games)+'</td><td>'+integer(x.wins)+'</td><td>'+integer(x.losses)+'</td><td>'+rate(x.wins,x.losses)+'</td><td>'+esc(x.tier)+'</td></tr>').join("")+
    '</tbody></table></div>';
}
const nav=(value,label)=>'<button data-meta-section="'+value+'" class="'+(m.section===value?"active":"")+'">'+label+'</button>';
function view(){
 const community=m.scope==="community";
 const independent=simulatorData();
 const d=active()||(!community&&independent?{
   leaders:[],matchups:[],games:0,includedEvents:0,eligibleEvents:0,
   updatedAt:m.independent?.updatedAt||new Date().toISOString(),days:m.days
 }:null);
 const loading=community?m.communityLoading:m.loading,error=community?m.communityError:m.error;
 const formats=[["auto","Formato predominante"],["all","Todos los formatos"],...(m.global?.formats||[]).map(x=>[x,x])];
 const top='<div class="wrap meta-page"><div class="hero"><div><h1>⚔️ Meta</h1>'+
   '<p>Quién gana, contra quién y si importa salir primero.</p></div></div>'+
   '<div class="meta-tabs"><button data-meta-scope="global" class="'+(!community?"active":"")+'">🌍 Global</button>'+
   '<button data-meta-scope="community" class="'+(community?"active":"")+'">👥 Comunidad</button></div>'+
   '<div class="meta-controls"><label>Período<select class="field" id="metaDays">'+
    [30,90,180,365].map(x=>'<option value="'+x+'"'+(m.days===x?" selected":"")+'>'+x+' días</option>').join("")+
   '</select></label>'+
   (community?"":'<label>Formato<select class="field" id="metaFormat">'+formats.map(([id,label])=>
     '<option value="'+esc(id)+'"'+(m.format===id?" selected":"")+'>'+esc(label)+'</option>').join("")+'</select></label>')+
   '<button class="secondary btn" id="metaRefresh">↻ Actualizar</button></div>';
 const contents=(loading?'<p class="small">Consultando datos actuales…</p>':"")+
   (error?'<div class="notice">'+esc(error)+'</div>':"")+
   (d?'<p class="small">Actualizado '+esc(new Date(d.updatedAt||Date.now()).toLocaleString("es-ES"))+
       (!community?' · '+esc(d.formatUsed==="unknown"?"Formato no especificado":d.formatUsed||"formato sin identificar"):"")+
       (d.stale?' · copia anterior':"")+'</p>'+
      (community||m.global?statCards(d):'<p class="small">🎮 Datos de OPlay cargados. Limitless sigue consultando torneos…</p>')+
      (community||!m.global?"":'<div class="meta-sample-note"><b>'+integer(d.includedEvents)+' torneos analizados</b> de '+
       integer(d.eligibleEvents)+' elegibles'+
       ((d.partial||d.truncated)?' · Muestra parcial':' · Cobertura completa de la selección')+
       (d.rateLimited?' · Limitación temporal de Limitless':"")+
       (d.sourcesAvailable===2?' · 2 fuentes combinadas':' · Falta una fuente')+'</div>')+
      '<div class="meta-tabs">'+
      nav("tiers","🏆 Tier list")+nav("matrix","▦ Matriz W/R")+nav("firstsecond","🥇 1.º / 2.º")+'</div>'+
      (m.section==="tiers"?tiers(d):m.section==="matrix"?matrix(d):firstSecondView(d))+
      '<p class="meta-source">🏆 Torneos: <a href="https://play.limitlesstcg.com" target="_blank" rel="noopener">Limitless</a>'+
      ' · 🎮 Simulador: <a href="https://oplaytcg.com/es/meta-stats" target="_blank" rel="noopener">OPlayTCG</a>'+
      '. Las muestras se muestran por separado.</p>':
      (!loading?'<div class="notice">'+(community?"Sin suficiente muestra comunitaria todavía.":"Sin datos disponibles temporalmente.")+'</div>':""));
 return top+contents+'</div>';
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
    const r=await fetch("/api/meta-unified?"+query,{headers:{accept:"application/json"},
      signal:AbortSignal.timeout(59000)});
    const raw=await r.text();let json;
    try{json=JSON.parse(raw)}catch{throw Error("El Meta devolvió una respuesta no válida (HTTP "+r.status+").")}
    if(!r.ok)throw Error(json.error||"No se pudo consultar Limitless (HTTP "+r.status+").");
    if(!Array.isArray(json.leaders)||!Array.isArray(json.matchups))
      throw Error("La respuesta del Meta no contiene estadísticas válidas.");
    const lastGood=m.global?.sourcesAvailable===2?m.global:
      savedGlobalMeta(key)?.sourcesAvailable===2?savedGlobalMeta(key):null;
    const shown=json.sourcesAvailable<2&&lastGood?{...lastGood,stale:true}:json;
    if(json.sourcesAvailable===2||!lastGood)persistGlobalMeta(key,json);
    if(days===m.days&&format===m.format){
      m.global=shown;
      m.globalRetryAfter=Date.now()+(json.sourcesAvailable===2?15*60000:45000);
      m.error=json.sourcesAvailable<2?
        (lastGood?"Mostrando el último meta combinado completo. ":
        "El meta solo contiene los datos disponibles por ahora. ")+
        "Limitless o OPlayTCG está temporalmente limitado.":
        (json.sourceWarning||"");
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
 if(m.independentBusy||(!force&&m.independentAt&&Date.now()-m.independentAt<(m.independent?45*60000:45000)))return;
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
  document.querySelectorAll("[data-meta-leader]").forEach(b=>b.onclick=()=>{m.leader=b.dataset.metaLeader;m.section="firstsecond";renderShell()});
  $("#metaDays")?.addEventListener("change",e=>{m.days=Number(e.target.value);m.global=null;m.community=null;renderShell()});
  $("#metaFormat")?.addEventListener("change",e=>{m.format=e.target.value;m.global=null;renderShell()});
  $("#metaLeaderSelect")?.addEventListener("change",e=>{m.leader=e.target.value;renderShell()});
  $("#metaTurnLeader")?.addEventListener("change",e=>{m.leader=e.target.value;m.expanded=false;renderShell()});
  $("#metaTurnSort")?.addEventListener("change",e=>{m.turnSort=e.target.value;renderShell()});

  $("#metaExpand")?.addEventListener("click",()=>{m.expanded=!m.expanded;renderShell()});
  $("#metaRefresh")?.addEventListener("click",()=>{
  if(m.scope==="global"){void loadGlobal(true)}
  else void loadCommunity(true);
});
  if(m.scope==="global"){void loadGlobal()}else void loadCommunity()
}
window.metaView=view;window.metaBind=bind;
})();