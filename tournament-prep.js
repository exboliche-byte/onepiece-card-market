/* Tournament preparation: public Limitless, privacy-filtered community and private personal results. */
(function(){
"use strict";
const st={leader:"",days:90,format:"auto",scope:"global",global:null,community:null,keyGlobal:"",keyCommunity:"",
  loadingGlobal:false,loadingCommunity:false,errorGlobal:"",errorCommunity:"",pick:false,search:"",leaderSearch:"",sort:"frequency",minimum:0,showRecent:false};
const e=v=>esc(String(v??""));
const id=v=>String(deckPrintedCode(v||"")||"").toUpperCase();
const n=v=>Number(v||0);
const num=v=>n(v).toLocaleString("es-ES");
const wr=(w,l)=>n(w)+n(l)?(100*n(w)/(n(w)+n(l))).toLocaleString("es-ES",{maximumFractionDigits:1})+" %":"—";
const blank=()=>({wins:0,losses:0,first:{wins:0,losses:0},second:{wins:0,losses:0},diceW:{wins:0,losses:0},diceL:{wins:0,losses:0}});
function summarizePersonal(leader,days,tournaments,decks,now=Date.now()){
 const total=blank(),pairs=new Map(),recent=[];let events=0;
 for(const t of tournaments||[]){
  const stamp=Date.parse(String(t.date||"").slice(0,10)+"T23:59:59");
  if(Number.isFinite(stamp)&&(stamp<now-days*86400000||stamp>now+86400000))continue;
  if(id(t.leaderId||t.deckSnapshot?.leader||decks?.find(d=>d.id===t.deckId)?.leader)!==id(leader))continue;
  events++;
  for(const r of t.rounds||[]){
   if(!["W","L"].includes(r.result)||["bye","noshow"].includes(r.kind))continue;
   const field=r.result==="W"?"wins":"losses",opp=id(r.opponentId);
   const tally=x=>{x[field]++;if(r.start==="1")x.first[field]++;if(r.start==="2")x.second[field]++;if(r.dice==="W")x.diceW[field]++;if(r.dice==="L")x.diceL[field]++};
   tally(total);
   if(opp){if(!pairs.has(opp))pairs.set(opp,blank());tally(pairs.get(opp))}
   recent.push({opp,result:r.result,start:r.start,dice:r.dice,notes:String(r.note||"").slice(0,250),date:String(t.date||""),tournament:String(t.title||"Un torneo")});
  }
 }
 recent.sort((a,b)=>b.date.localeCompare(a.date));
 return {total,pairs,events,recent};
}
function leaderOptions(){return competitiveLeaderOptions()||[]}
function selected(){
 const options=leaderOptions(),wanted=id(st.leader);
 if(options.some(x=>id(x.id)===wanted))return wanted;
 return id(state.decks?.find(x=>x.leader)?.leader||options[0]?.id);
}
function cardFor(x){return resolveDeckImportCard(x)||leaderOptions().find(v=>id(v.id)===id(x))?.card}
const name=x=>cardFor(x)?.name||x;
const picture=(x,cls)=>{const c=cardFor(x);return c?cardImg(c,cls):'<span class="'+cls+'">'+e(x)+'</span>'};
const active=()=>st.scope==="global"?st.global:st.community;
const fetchPending=()=>st.scope==="global"?st.loadingGlobal:st.loadingCommunity;
const currentError=()=>st.scope==="global"?st.errorGlobal:st.errorCommunity;
function matchRows(d,leader,personal){
 const m=new Map();
 for(const x of d?.matchups||[]){
  if(id(x.leader)!==leader||!id(x.opponent))continue;
  const key=id(x.opponent),prior=m.get(key);
  if(!prior||n(x.games)>n(prior.global?.games))m.set(key,{key,global:x,local:personal.pairs.get(key)||blank()});
 }
 for(const [key,local] of personal.pairs)if(!m.has(key))m.set(key,{key,global:null,local});
 const rows=[...m.values()].map(x=>{
  const games=n(x.global?.games),wins=n(x.global?.wins),localGames=n(x.local.wins)+n(x.local.losses);
  return {...x,games,percent:games?(Number.isFinite(x.global?.rate)?x.global.rate/100:wins/games):null,localGames,localPercent:localGames?n(x.local.wins)/localGames:null};
 });
 rows.sort((a,b)=>st.sort==="hard"? (a.percent??2)-(b.percent??2)||b.games-a.games:
   st.sort==="easy"?(b.percent??-1)-(a.percent??-1)||b.games-a.games:
   st.sort==="personal"?b.localGames-a.localGames||b.games-a.games:
   b.games-a.games||b.localGames-a.localGames);
 return rows;
}
function metric(label,value){return '<div class="prep-metric"><b>'+e(value)+'</b><small>'+e(label)+'</small></div>'}
function record(label,x){return '<div class="prep-record"><b>'+e(label)+'</b><strong>'+wr(x.wins,x.losses)+'</strong><small>'+num(x.wins)+' V · '+num(x.losses)+' D · n='+num(n(x.wins)+n(x.losses))+'</small></div>'}
function coverage(d){
 if(st.scope==="community")return '<div class="prep-coverage">Comunidad MiAlbumOnePiece: <b>'+num(d.recordedGames)+' resultados</b> · '+num(d.eligibleTournaments)+
  ' torneos finalizados · '+num(d.contributingUsers)+' participantes. Los cruces con muestra insuficiente se ocultan por privacidad. Nunca se mezclan con Limitless.</div>';
 const incomplete=d.partial||d.truncated||d.rateLimited;
 return '<div class="prep-coverage"><b>Meta combinado · Limitless + OPlayTCG</b> · '+num(d.games)+' partidas de ambas fuentes · '+num(d.simulatorGames)+' en simulador · '+num(d.includedEvents)+' torneos incluidos de '+
  num(d.eligibleEvents)+' encontrados en el período · '+num(d.pagesScanned||1)+' páginas exploradas · Formato '+e(d.formatUsed||"—")+
  (incomplete?'<p>⚠ <b>Muestra parcial.</b> '+(d.rateLimited?'Limitless ha limitado las peticiones de torneos. ':'')+
   (d.truncated?'Hay más torneos que los procesados. ':'')+'Los porcentajes solo representan los datos incluidos.</p>':
   '<p>Se han procesado todos los torneos encontrados en esta consulta.</p>')+
   (d.formatUsed==="all"?'<p>Se han mezclado varios formatos; es preferible elegir el del torneo al que asistirás.</p>':"")+
   '<p>El W/R se calcula ponderando torneos y simulador; los emparejamientos son enfrentamientos reales observados en las fuentes.</p></div>';
}
function important(rows){
 const frequent=rows.filter(x=>x.games>=6).sort((a,b)=>b.games-a.games)[0];
 const hard=rows.filter(x=>x.games>=10).sort((a,b)=>a.percent-b.percent)[0];
 const personal=rows.filter(x=>x.localGames>=3).sort((a,b)=>a.localPercent-b.localPercent)[0];
 const show=(label,r,detail)=>'<div class="prep-tip"><small>'+label+'</small>'+(r?picture(r.key,"prep-tip-art")+'<b>'+e(name(r.key))+'</b><span>'+e(detail(r))+'</span>':'<span>Sin muestra suficiente</span>')+'</div>';
 return '<section class="prep-panel"><h3>Preparación: rivales a vigilar</h3><div class="prep-tips">'+
  show("Más frecuente",frequent,r=>num(r.games)+" partidas públicas")+
  show("Peor cruce público",hard,r=>wr(r.global.wins,r.global.losses)+" · n="+num(r.games))+
  show("Mi cruce más difícil",personal,r=>wr(r.local.wins,r.local.losses)+" · n="+num(r.localGames))+
  '</div><p class="small">Los destacados exigen un mínimo de 6, 10 y 3 resultados, respectivamente. No son predicciones.</p></section>';
}
function matchRow(r){
 const g=r.global,l=r.local;
 const nFirst=n(l.first.wins)+n(l.first.losses),nSecond=n(l.second.wins)+n(l.second.losses);
 const sourceOrder=st.scope==="global"?
    (g?.first||g?.second?
      "OPlay · 1.º "+(g.first?wr(g.first.wins,g.first.losses)+" (n="+num(g.first.games)+")":"—")+
      " · 2.º "+(g.second?wr(g.second.wins,g.second.losses)+" (n="+num(g.second.games)+")":"—"):
      "Sin datos verificables de orden de salida frente a este rival"):
   "Comunidad: 1.º "+(g?.first?wr(g.first.wins,g.first.losses)+" (n="+num(g.first.games)+")":"—")+
   " · 2.º "+(g?.second?wr(g.second.wins,g.second.losses)+" (n="+num(g.second.games)+")":"—");
 return '<article class="prep-match">'+picture(r.key,"prep-rival-image")+
 '<div class="prep-rival-name"><b>'+e(name(r.key))+'</b><small>'+e(r.key)+'</small><small>'+
 (r.games>=20?"Muestra amplia":r.games>=6?"Muestra moderada":r.games?"Muestra pequeña":"Solo mis rondas")+'</small></div>'+
 '<div class="prep-numbers"><div><small>Meta combinado · '+num(r.games)+' partidas</small><b>'+
 (r.percent!==null?(r.percent*100).toLocaleString("es-ES",{maximumFractionDigits:1})+" %":"—")+'</b>'+
 (r.games?'<div class="prep-bar"><i style="width:'+Math.round(r.percent*100)+'%"></i></div>':"")+'</div>'+
 '<div><small>Personal · '+num(r.localGames)+' rondas</small><b>'+wr(l.wins,l.losses)+'</b><small>1.º '+wr(l.first.wins,l.first.losses)+' (n='+num(nFirst)+')'+
 ' · 2.º '+wr(l.second.wins,l.second.losses)+' (n='+num(nSecond)+')</small></div>'+
 '<div class="prep-order"><small>'+e(sourceOrder)+'</small></div></div></article>';
}
function view(){
 const leader=selected(),d=active(),personal=summarizePersonal(leader,st.days,state.tournaments,state.decks),rows=matchRows(d,leader,personal);
 const opts=leaderOptions(),leaderStat=d?.leaders?.find(x=>id(x.id)===leader),pending=fetchPending(),error=currentError();
 const filters=[["auto","Formato predominante"],["all","Todos los formatos"],...(st.global?.formats||[]).map(x=>[x,x])];
 const eligible=rows.filter(x=>x.games>=st.minimum&&(!st.search||String(name(x.key)+" "+x.key).toLowerCase().includes(st.search.toLowerCase())));
 return '<div class="prep-root"><section class="prep-panel"><div class="prep-selected">'+picture(leader,"prep-leader-main")+
  '<div><b>'+e(name(leader))+'</b><small>'+e(leader)+'</small></div>'+
  '<button class="secondary btn" id="prepPickToggle" type="button">'+(st.pick?"Cerrar":"Elegir líder")+'</button></div>'+
  (st.pick?'<div class="prep-picker"><input class="field" id="prepLeaderSearch" type="search" placeholder="Buscar líder" value="'+e(st.leaderSearch)+'">'+
   '<div class="prep-leaders">'+opts.map(x=>'<button type="button" class="prep-leader'+(id(x.id)===leader?" active":"")+
   '" data-prep-leader="'+e(x.id)+'" data-prep-name="'+e(String(x.name+" "+x.id).toLowerCase())+'"'+
   (st.leaderSearch&&!String(x.name+" "+x.id).toLowerCase().includes(st.leaderSearch.toLowerCase())?" hidden":"")+'>'+
   (x.card?cardImg(x.card,"prep-leader-thumb"):picture(x.id,"prep-leader-thumb"))+
   '<b>'+e(x.name)+'</b><small>'+e(x.id)+'</small></button>').join("")+'</div></div>':"")+
  '<div class="prep-config"><label>Período<select class="field" id="prepDays">'+[30,90,180,365].map(x=>'<option value="'+x+'"'+(st.days===x?" selected":"")+'>'+x+' días</option>').join("")+
  '</select></label><label>Formato<select class="field" id="prepFormat"'+(st.scope==="community"?" disabled":"")+'>'+
   filters.map(([k,label])=>'<option value="'+e(k)+'"'+(st.format===k?" selected":"")+'>'+e(label)+'</option>').join("")+
  '</select></label><button class="primary btn" id="prepRefresh"'+(pending?" disabled":"")+'>'+(pending?"Recopilando…":"↻ Actualizar datos")+'</button></div>'+
  '<div class="prep-sources"><button type="button" class="'+(st.scope==="global"?"selected":"")+'" data-prep-scope="global">🌍 Meta combinado</button>'+
  '<button type="button" class="'+(st.scope==="community"?"selected":"")+'" data-prep-scope="community">👥 Comunidad</button></div>'+
  '<p class="small">Meta y Preparar torneo usan el mismo metajuego combinado. Período y formato filtran los torneos; OPlay utiliza la muestra temporal publicada por su simulador. Tu historial personal se mantiene independiente.</p></section>'+
  (pending?'<div class="notice">Cargando resultados reales de torneos…</div>':"")+
  (error?'<div class="notice">⚠ '+e(error)+'</div>':"")+
  (d?'<div class="prep-stats">'+metric("Partidas públicas de este líder",leaderStat?num(leaderStat.games):"—")+
    metric("W/R combinado del líder",leaderStat?num(leaderStat.rate)+" %":"—")+
    metric("Tier global",st.scope==="global"&&leaderStat?leaderStat.tier||"—":"—")+
    metric("Presencia en meta global",st.scope==="global"&&leaderStat?num(leaderStat.share)+" %":"—")+
    metric("Mis torneos en el período",num(personal.events))+
    metric("Mi win rate",wr(personal.total.wins,personal.total.losses))+'</div>'+coverage(d)+important(rows):
    '<div class="notice">'+(pending?"Analizando…":"Todavía no hay datos disponibles de la fuente elegida.")+'</div>')+
  '<section class="prep-panel"><h3>Mis estadísticas con este líder</h3>'+
   '<p class="small">Todos mis resultados registrados para el período, sin BYEs ni no-shows. Los valores de dado y orden solo cuentan si los indiqué.</p>'+
   '<div class="prep-personal">'+record("Todas las rondas",personal.total)+record("Saliendo primero",personal.total.first)+
    record("Saliendo segundo",personal.total.second)+record("Dado ganado",personal.total.diceW)+record("Dado perdido",personal.total.diceL)+'</div></section>'+
  '<section class="prep-panel"><h3>Todos los enfrentamientos disponibles</h3><p class="small">'+num(eligible.length)+' de '+num(rows.length)+' rivales, sin límite artificial de 35 filas.</p>'+
   '<div class="prep-filter"><input class="field" id="prepRivalSearch" type="search" placeholder="Buscar rival por nombre o código" value="'+e(st.search)+'">'+
    '<select class="field" id="prepOrder">'+[["frequency","Más frecuentes"],["hard","Peor win rate"],["easy","Mejor win rate"],["personal","Más jugados por mí"]].map(([k,v])=>
    '<option value="'+k+'"'+(st.sort===k?" selected":"")+'>'+v+'</option>').join("")+'</select>'+
    '<select class="field" id="prepMinimum">'+[[0,"Todas las muestras"],[6,"Mínimo 6 partidas"],[20,"Mínimo 20 partidas"]].map(([k,v])=>
    '<option value="'+k+'"'+(st.minimum===k?" selected":"")+'>'+v+'</option>').join("")+'</select></div>'+
   '<p class="small">El W/R de los rivales combina ambas fuentes cuando existen cruces reales; el orden de salida procede de OPlayTCG.</p>'+
   (eligible.length?'<div class="prep-match-list">'+eligible.map(matchRow).join("")+'</div>':'<div class="notice">Sin rivales para estos filtros.</div>')+'</section>'+
  '<section class="prep-panel"><div class="prep-title"><h3>Mis últimas partidas</h3><button class="secondary btn" id="prepRecentToggle">'+(st.showRecent?"Ocultar":"Mostrar")+'</button></div>'+
  (st.showRecent?(personal.recent.length?personal.recent.slice(0,12).map(r=>
   '<div class="prep-recent"><b>'+e(r.result==="W"?"Victoria":"Derrota")+'</b><div>'+e(r.opp?name(r.opp):"Rival sin registrar")+
   '<small>'+e(r.tournament)+' · '+e(r.date)+' · '+(r.start==="1"?"Primero":r.start==="2"?"Segundo":"Salida desconocida")+
   ' · '+(r.dice==="W"?"Dado ganado":r.dice==="L"?"Dado perdido":"Dado desconocido")+'</small>'+
   (r.notes?'<small>Nota: '+e(r.notes)+'</small>':"")+'</div></div>').join(""):'<p class="small">Todavía no hay partidas registradas.</p>'):"")+
  '<p class="small">Se muestran las 12 últimas; las estadísticas incluyen todas las rondas del período.</p></section>'+
  '<p class="small">Los porcentajes no predicen resultados futuros. Si hay torneos sin datos suficientes, se muestran como ausentes, no como derrotas ni victorias.</p></div>';
}
async function globalData(force=false){
 const days=st.days,format=st.format,key=days+":"+format;
 if(st.loadingGlobal||(!force&&st.keyGlobal===key))return;
 st.keyGlobal=key;st.loadingGlobal=true;st.errorGlobal="";if(state.tab==="tournaments")renderShell();
 try{
  const params=new URLSearchParams({days:String(days),format});
  if(force)params.set("refresh","1");
  const r=await fetch("/api/meta-unified?"+params,{headers:{accept:"application/json"}}),raw=await r.text();
  let d;try{d=JSON.parse(raw)}catch{throw Error("El servidor no devolvió JSON válido (HTTP "+r.status+").")}
  if(!r.ok)throw Error(d.error||"No se pudo consultar el meta combinado (HTTP "+r.status+").");
  if(days===st.days&&format===st.format)st.global=d;
 }catch(err){if(days===st.days&&format===st.format){st.errorGlobal=String(err.message||err)}}
 finally{st.loadingGlobal=false;if(state.tab==="tournaments")renderShell()}
}
async function communityData(force=false){
 const days=st.days,key=String(days);
 if(st.loadingCommunity||(!force&&st.keyCommunity===key))return;
 st.keyCommunity=key;st.loadingCommunity=true;st.errorCommunity="";if(state.tab==="tournaments")renderShell();
 try{
  if(!state.sb)throw Error("Supabase no está disponible.");
  const r=await state.sb.rpc("get_community_meta",{p_days:days});
  if(r.error)throw r.error;
  if(days===st.days)st.community=r.data||{leaders:[],matchups:[]};
 }catch(err){if(days===st.days){st.errorCommunity=String(err.message||err)}}
 finally{st.loadingCommunity=false;if(state.tab==="tournaments")renderShell()}
}
function bind(){
 const on=(s,event,f)=>document.querySelector(s)?.addEventListener(event,f);
 on("#prepPickToggle","click",()=>{st.pick=!st.pick;renderShell()});
 on("#prepLeaderSearch","input",event=>{st.leaderSearch=event.target.value;document.querySelectorAll("[data-prep-leader]").forEach(x=>{x.hidden=!String(x.dataset.prepName).includes(st.leaderSearch.toLowerCase())})});
 document.querySelectorAll("[data-prep-leader]").forEach(x=>x.onclick=()=>{st.leader=id(x.dataset.prepLeader);st.pick=false;st.leaderSearch="";renderShell()});
 on("#prepDays","change",event=>{st.days=Number(event.target.value)||90;st.global=null;st.community=null;st.keyGlobal="";st.keyCommunity="";renderShell()});
 on("#prepFormat","change",event=>{st.format=event.target.value;st.global=null;st.keyGlobal="";renderShell()});
 document.querySelectorAll("[data-prep-scope]").forEach(x=>x.onclick=()=>{st.scope=x.dataset.prepScope;renderShell()});
 on("#prepRefresh","click",()=>st.scope==="global"?void globalData(true):void communityData(true));
 on("#prepOrder","change",event=>{st.sort=event.target.value;renderShell()});
 on("#prepMinimum","change",event=>{st.minimum=Number(event.target.value)||0;renderShell()});
 on("#prepRivalSearch","input",event=>{st.search=event.target.value;renderShell()});
 on("#prepRecentToggle","click",()=>{st.showRecent=!st.showRecent;renderShell()});
 if(st.scope==="global")void globalData();else void communityData();
 if(st.scope==="global"&&state.sb&&!st.keyCommunity)void communityData();
}
const style=document.createElement("style");
style.textContent=".prep-root{max-width:1320px;margin:auto;display:grid;gap:14px;padding-bottom:75px}.prep-panel{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:14px;min-width:0}.prep-panel h3{margin:0 0 10px}.prep-selected{display:flex;gap:12px;align-items:center}.prep-selected>div{flex:1}.prep-selected b,.prep-selected small{display:block}.prep-selected small{color:var(--muted)}.prep-leader-main{width:65px;height:91px;object-fit:cover;flex:none;border-radius:7px}.prep-config{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:13px 0}.prep-config label{display:grid;gap:5px;flex:1;min-width:130px;font-size:12px;color:var(--muted)}.prep-sources{display:flex;flex-wrap:wrap;gap:8px}.prep-sources button{border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:9px 14px;color:var(--text);font-weight:800;cursor:pointer}.prep-sources .selected{color:var(--accent);border-color:var(--accent)}.prep-picker{margin-top:12px}.prep-leaders{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;max-height:420px;overflow:auto;margin-top:10px}.prep-leader{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:9px;padding:5px;text-align:left;cursor:pointer}.prep-leader[hidden]{display:none}.prep-leader.active{border-color:var(--accent)}.prep-leader-thumb{width:100%;aspect-ratio:.716;object-fit:cover}.prep-leader b,.prep-leader small{display:block;font-size:10px;overflow-wrap:anywhere}.prep-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.prep-metric,.prep-record,.prep-tip{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:11px;min-width:0}.prep-metric b{font-size:clamp(18px,2.7vw,26px);display:block}.prep-metric small,.prep-record small,.prep-tip small{font-size:11px;color:var(--muted)}.prep-coverage{border:1px solid var(--line);border-radius:11px;padding:12px;font-size:12px;color:var(--muted);line-height:1.6}.prep-coverage a{color:var(--accent)}.prep-coverage p{margin:5px 0}.prep-tips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.prep-tip{background:var(--panel2)}.prep-tip small,.prep-tip b,.prep-tip span{display:block}.prep-tip-art{width:39px;height:54px;object-fit:cover;float:left;margin-right:7px;border-radius:4px}.prep-tip b{font-size:12px}.prep-tip span{font-size:11px}.prep-personal{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}.prep-record{background:var(--panel2)}.prep-record b,.prep-record strong,.prep-record small{display:block}.prep-record strong{font-size:21px;margin:6px 0}.prep-filter{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin:9px 0}.prep-match-list{display:grid;gap:8px;max-height:850px;overflow:auto}.prep-match{display:flex;gap:10px;align-items:center;padding:9px;border:1px solid var(--line);background:var(--panel2);border-radius:12px;min-width:0}.prep-rival-image{width:45px;height:63px;flex:none;object-fit:cover;border-radius:4px}.prep-rival-name{flex:1;min-width:120px}.prep-rival-name b,.prep-rival-name small{display:block}.prep-rival-name b{font-size:13px}.prep-rival-name small{font-size:10px;color:var(--muted)}.prep-numbers{display:grid;grid-template-columns:95px 130px 150px;gap:9px;align-items:center}.prep-numbers small{display:block;font-size:10px;color:var(--muted)}.prep-numbers b{font-size:17px}.prep-bar{height:4px;background:var(--line);border-radius:8px;overflow:hidden}.prep-bar i{display:block;background:var(--accent);height:100%}.prep-title{display:flex;align-items:center;justify-content:space-between}.prep-recent{display:flex;gap:10px;border-bottom:1px solid var(--line);padding:9px 0}.prep-recent b{min-width:75px}.prep-recent small{display:block;font-size:11px;color:var(--muted)}@media(max-width:820px){.prep-match{flex-wrap:wrap}.prep-numbers{grid-template-columns:1fr 1fr;width:100%}.prep-order{grid-column:span 2}.prep-tips{grid-template-columns:1fr 1fr}}@media(max-width:520px){.prep-stats{grid-template-columns:1fr 1fr}.prep-filter{grid-template-columns:1fr}.prep-selected{flex-wrap:wrap}.prep-tips{grid-template-columns:1fr}.prep-config label{min-width:110px}}";
document.head.appendChild(style);
window.TournamentPrep={view,bind,summarizePersonal};
})();