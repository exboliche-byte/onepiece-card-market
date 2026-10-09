/* Cross-source interpretation; never pool disjoint tournament and simulator samples. */
(()=>{
"use strict";
const escText=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=x=>Number(x||0).toLocaleString("es-ES");
const pct=(w,l)=>w+l?(100*w/(w+l)).toFixed(1)+" %":"—";
const leaderName=id=>{
 const cards=(typeof state==="object"&&Array.isArray(state.cards))?state.cards:[];
 const x=cards.find(c=>c.id===id)||cards.find(c=>c.id?.split("_")[0]===id);
 return escText(x?.name||id);
};
const href=(url,label)=>'<a target="_blank" rel="noopener noreferrer" href="'+escText(url)+'">'+escText(label)+' ↗</a>';
function render(primary,external,loading){
 if(!primary)return '<div class="notice">Consultando resultados de torneos para el informe…</div>';
 const sources=external?.sources||[];
 const sim=sources.find(x=>x.id==="oplay"&&x.status==="ok"&&x.leaders?.length);
 const ref=sources.find(x=>x.id==="everything");
 const other=new Map((sim?.leaders||[]).map(l=>[l.id,l]));
 const pairs=(primary.leaders||[]).map(l=>({main:l,sim:other.get(l.id)}))
    .filter(x=>x.sim&&x.main.games>=20&&x.sim.games>=100)
    .sort((a,b)=>Math.min(b.main.games,b.sim.games)-Math.min(a.main.games,a.sim.games));
 const diff=x=>100*x.main.wins/(x.main.wins+x.main.losses)-
   100*x.sim.wins/(x.sim.wins+x.sim.losses);
 const agreements=pairs.filter(x=>Math.abs(diff(x))<5),disagree=pairs.filter(x=>Math.abs(diff(x))>=7)
   .sort((a,b)=>Math.abs(diff(b))-Math.abs(diff(a))).slice(0,5);
 const matchups=(primary.matchups||[]).filter(x=>x.games>=8);
 const best=matchups.filter(x=>x.wins/x.games>=.55).sort((a,b)=>b.wins/b.games-a.wins/a.games).slice(0,4);
 const worst=matchups.filter(x=>x.wins/x.games<=.45).sort((a,b)=>a.wins/a.games-b.wins/b.games).slice(0,4);
 const matchRow=x=>'<div class="meta-report-pair"><b>'+leaderName(x.leader)+' frente a '+leaderName(x.opponent)+'</b><span>'+pct(x.wins,x.losses)+' · n='+n(x.games)+'</span></div>';
 const source=(title,link,kind,ok,extra)=>'<div class="meta-report-source"><strong>'+escText(title)+'</strong>'+
  '<small>'+escText(kind)+'</small><small>'+escText(ok?extra:"Sin datos verificables en esta consulta")+'</small>'+href(link,"Consultar")+'</div>';
 const sample=(primary.partial||primary.truncated)?"Muestra de torneos incompleta o limitada.":"Muestra limitada a los eventos seleccionados, no a todos los torneos del mundo.";
 let html='<section class="meta-report"><h2>Informe contrastado del metajuego</h2>'+
 '<p>Comparación entre <b>torneos reales</b> y <b>partidas de simulador</b>, con procedencia y tamaño de muestra. No se suman ni se promedian resultados de plataformas diferentes.</p>'+
 '<div class="meta-report-kpis"><div><b>'+n(primary.games)+'</b><small>Partidas en torneos</small></div>'+
 '<div><b>'+n(primary.includedEvents)+' / '+n(primary.eligibleEvents)+'</b><small>Torneos incluidos / elegibles</small></div>'+
 '<div><b>'+(sim?n(sim.leaders.length):"—")+'</b><small>Líderes con muestra OPlay</small></div>'+
 '<div><b>'+n(pairs.length)+'</b><small>Líderes comparables</small></div></div>'+
 '<h3>1. Qué domina los torneos</h3>'+
 '<p>Los líderes con más enfrentamientos observados en la ventana seleccionada son '+
 (primary.leaders||[]).slice(0,5).map(l=>'<b>'+leaderName(l.id)+'</b> ('+n(l.games)+'; '+pct(l.wins,l.losses)+')').join(", ")+
 '. Una mayor presencia en esta muestra no demuestra un rendimiento superior.</p>'+
 '<p class="small">Ventana: '+n(primary.days)+' días · formato: '+escText(primary.formatUsed||"sin identificar")+
 '. '+sample+'</p>'+
 '<h3>2. Win rate contrastado por líder</h3>';
 if(!sim)html+='<div class="notice">No se ha podido verificar la tabla de OPlayTCG. Se mantienen los datos de torneos sin atribuirles estadísticas de simulador.</div>';
 else{
  html+='<p>En los '+n(pairs.length)+' líderes comparables, '+n(agreements.length)+
    ' difieren menos de cinco puntos entre ambos registros. Son poblaciones independientes y sus ventanas pueden no coincidir.</p>';
  if(pairs.length)html+='<div class="meta-scroller"><table class="meta-table"><thead><tr><th>Líder</th><th>Torneos</th><th>n torneos</th><th>OPlay</th><th>n OPlay</th><th>∆</th></tr></thead><tbody>'+
    pairs.slice(0,24).map(({main,sim})=>{
      const d=diff({main,sim});
      return '<tr><td>'+leaderName(main.id)+'<small>'+escText(main.id)+'</small></td>'+
        '<td>'+pct(main.wins,main.losses)+'</td><td>'+n(main.games)+'</td>'+
        '<td>'+pct(sim.wins,sim.losses)+'</td><td>'+n(sim.games)+'</td>'+
        '<td>'+((d>=0?"+":"")+d.toFixed(1))+' pp</td></tr>';
    }).join("")+'</tbody></table></div>';
 }
 html+='<h3>3. Dónde discrepan los datos</h3>'+
 (disagree.length?'<p>Se observa una diferencia de al menos siete puntos para '+
  disagree.map(x=>'<b>'+leaderName(x.main.id)+'</b> ('+diff(x).toFixed(1)+' pp)').join(", ")+
  '. Antes de interpretarla conviene comprobar formato, nivel competitivo y antigüedad de las muestras.</p>':
  '<p>No hay diferencias de siete puntos o más con muestra suficiente, o no hay dos fuentes comparables disponibles.</p>')+
 '<h3>4. Emparejamientos documentados</h3><p>Resultados de torneos, con ocho partidas como mínimo por enfrentamiento. No son predicciones.</p>'+
 '<h4>Favorables</h4><div class="meta-report-pairs">'+(best.map(matchRow).join("")||"Sin muestras suficientes")+'</div>'+
 '<h4>Desfavorables</h4><div class="meta-report-pairs">'+(worst.map(matchRow).join("")||"Sin muestras suficientes")+'</div>'+
 '<h3>5. La influencia del orden de salida</h3><p>Limitless no ofrece quién salió primero en estos encuentros. '+
 (sim?'OPlayTCG publica porcentajes del simulador y los presentamos por separado.':
 'Sin una fuente secundaria verificable, no se estima ese efecto.')+'</p>';
 if(sim){
  const split=sim.leaders.filter(l=>Number.isFinite(l.firstRate)&&Number.isFinite(l.secondRate));
  if(split.length)html+='<div class="meta-scroller"><table class="meta-table"><thead><tr><th>Líder</th><th>Primero (simulador)</th><th>Segundo (simulador)</th><th>n</th></tr></thead><tbody>'+
   split.slice(0,15).map(l=>'<tr><td>'+leaderName(l.id)+'</td><td>'+l.firstRate.toFixed(1)+' %</td><td>'+l.secondRate.toFixed(1)+' %</td><td>'+n(l.games)+'</td></tr>').join("")+'</tbody></table></div>';
 }
 html+='<h3>6. Fuentes y trazabilidad</h3><div class="meta-report-sources">'+
 source("Limitless","https://play.limitlesstcg.com/decks?game=OP","Resultados de torneos",true,n(primary.games)+" enfrentamientos")+
 source("OPlayTCG","https://oplaytcg.com/es/meta-stats","Partidas del simulador",!!sim,sim?n(sim.leaders.length)+" líderes extraídos":"")+
 source("Everything OPTCG","https://everythingoptcg.com/meta","Listas y contexto competitivo",ref?.status==="ok",
    "Contexto externo; estadísticas no mezcladas")+
 '</div><p class="small">Fuentes con metodología, ventana temporal y nivel de jugadores distintos. '+
 'La procedencia de cada porcentaje permanece visible. '+(loading?'Actualizando fuentes independientes…':"")+'</p></section>';
 return html;
}
const css=document.createElement("style");
css.textContent=".meta-report{margin-top:10px;line-height:1.55}.meta-report h3{margin:23px 0 9px;font-size:17px}.meta-report h4{margin:13px 0 6px;font-size:14px}.meta-report-kpis,.meta-report-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0}.meta-report-kpis>div,.meta-report-source,.meta-report-pair{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:12px;display:grid;gap:6px}.meta-report-kpis b{font-size:22px}.meta-report-kpis small,.meta-report-source small,.meta-report-pair span{color:var(--muted);font-size:12px}.meta-report-source a{font-size:12px;color:var(--accent)}.meta-report-pairs{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}";
document.head.appendChild(css);
window.renderMetaComparisonReport=render;
})();
