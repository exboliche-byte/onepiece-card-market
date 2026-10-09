(function(){
"use strict";
/* Read-only mazo tools. Card editions remain exact in the saved decks. */
const lab={view:"",deckId:null,opponentId:"",pile:[],hand:[],mulligan:false,turn:0,first:true,target:""};
const n=x=>Math.max(0,Math.floor(Number(x)||0)),code=id=>deckPrintedCode(id),safe=s=>esc(s);
function entries(d){const a=[];for(const [id,q] of Object.entries(d?.cards||{}))for(let j=0;j<Math.min(n(q),50);j++)a.push(id);return a}
function counts(d){const m=new Map();for(const [id,q] of Object.entries(d?.cards||{}))if(n(q))m.set(code(id),(m.get(code(id))||0)+n(q));return m}
function combination(n,k){if(k<0||k>n)return 0;k=Math.min(k,n-k);let x=1;for(let i=1;i<=k;i++)x=x*(n-k+i)/i;return x}
function probability(N,K,draws,minimum=1){
 N=n(N);K=Math.min(n(K),N);draws=Math.min(n(draws),N);
 if(!N||minimum>K||minimum>draws)return 0;
 const den=combination(N,draws);let x=0;
 for(let i=minimum;i<=Math.min(K,draws);i++)x+=combination(K,i)*combination(N-K,draws-i);
 return Math.max(0,Math.min(1,x/den));
}
function shuffle(list){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function active(){return state.decks.find(d=>d.id===lab.deckId)||null}
function close(){document.querySelector("#deckLabOverlay")?.remove();lab.view="";lab.deckId=null}
function reset(){lab.pile=shuffle(entries(active()));lab.hand=lab.pile.splice(0,Math.min(5,lab.pile.length));lab.turn=0;lab.mulligan=false}
function open(view){
 const d=state.decks.find(x=>x.id===state.deckId);if(!d)return notify("Abre primero un mazo");
 lab.deckId=d.id;lab.view=view;
 if(view==="simulate"){lab.first=true;lab.target=counts(d).keys().next().value||"";reset()}
 else lab.opponentId=state.decks.find(x=>x.id!==d.id&&!x.draftCompetitive)?.id||"";
 render();
}
function thumb(id){const c=card(id);return c?cardImg(c,"thumb"):'<div class="thumb">?</div>'}
function title(id){return card(id)?.name||id||"Sin líder"}
function simulateHtml(d){
 const total=entries(d).length,all=counts(d),K=all.get(lab.target)||0;
 const options=[...all].sort((a,b)=>a[0].localeCompare(b[0],"es",{numeric:true}));
 const afterTwo=Math.min(total,5+(lab.first?1:2));
 return '<h2 id="deckLabTitle">Simular manos · '+safe(d.name)+'</h2>'+
 '<p class="small">Mano inicial de 5 cartas, un mulligan completo y robos por turno. El líder y DON!! quedan fuera del mazo.</p>'+
 (total!==50?'<div class="notice">Mazo incompleto ('+total+'/50): se simulan solo las cartas que contiene actualmente.</div>':'')+
 '<div class="deck-lab-controls"><label>Sales<select class="field" id="labOrder"><option value="first"'+(lab.first?' selected':'')+'>Primero</option><option value="second"'+(!lab.first?' selected':'')+'>Segundo</option></select></label>'+
 '<button class="secondary btn" id="labReset">Nueva mano</button>'+
 '<button class="secondary btn" id="labMulligan" '+(lab.mulligan||lab.turn?'disabled':'')+'>Mulligan (1)</button>'+
 '<button class="primary btn" id="labNext" '+(!lab.pile.length?'disabled':'')+'>'+(lab.turn?'Siguiente turno':'Comenzar turno 1')+'</button></div>'+
 '<p class="small">Turno '+lab.turn+' · '+lab.hand.length+' cartas en mano · '+lab.pile.length+' restantes'+(lab.turn===1&&lab.first?' · sin robo inicial':'')+'</p>'+
 '<div class="deck-lab-hand">'+lab.hand.map(id=>'<div class="deck-lab-card" title="'+safe(title(id))+'">'+thumb(id)+'<span>'+safe(code(id))+'</span></div>').join("")+'</div>'+
 '<div class="section deck-lab-odds"><h3>Probabilidades exactas · sin reemplazo</h3>'+
 '<label for="labTarget">Carta objetivo</label><select class="field" id="labTarget">'+options.map(([id,q])=>'<option value="'+safe(id)+'"'+(id===lab.target?' selected':'')+'>'+safe(id+' · '+q+' copias · '+title(id))+'</option>').join("")+'</select>'+
 '<div class="deck-lab-metrics"><div><b>'+(100*probability(total,K,5)).toFixed(1)+'%</b><small>≥1 en la mano inicial</small></div>'+
 '<div><b>'+(100*probability(total,K,afterTwo)).toFixed(1)+'%</b><small>≥1 tras 2 turnos*</small></div>'+
 '<div><b>'+(100*probability(total,K,5,2)).toFixed(1)+'%</b><small>≥2 en la mano inicial</small></div></div>'+
 '<p class="small">*Sin mulligan ni búsquedas: '+(lab.first?'el primero no roba en turno 1':'el segundo roba en turno 1')+'. Ahora tienes '+lab.hand.filter(id=>code(id)===lab.target).length+' de esta carta en mano. Son probabilidades matemáticas, no predicciones.</p></div>';
}
function compareHtml(d){
 const others=state.decks.filter(x=>x.id!==d.id&&!x.draftCompetitive);
 if(!others.length)return '<h2 id="deckLabTitle">Comparar mazos</h2><div class="notice">Guarda al menos otro mazo para comparar. No se modifica ninguno.</div>';
 const other=others.find(x=>x.id===lab.opponentId)||others[0];lab.opponentId=other.id;
 const a=counts(d),b=counts(other),keys=[...new Set([...a.keys(),...b.keys()])];
 const shared=keys.reduce((t,id)=>t+Math.min(a.get(id)||0,b.get(id)||0),0);
 const differences=keys.filter(id=>(a.get(id)||0)!==(b.get(id)||0)).sort((x,y)=>x.localeCompare(y,"es",{numeric:true}));
 const rows=differences.map(id=>{
   const x=a.get(id)||0,y=b.get(id)||0,c=card(id)||state.cards.find(z=>code(z.id)===id);
   return '<div class="deck-lab-diff">'+(c?thumb(c.id):'')+'<div class="grow"><b>'+safe(id)+'</b><small>'+safe(c?.name||id)+'</small></div><b>'+x+' / '+y+'</b><span class="'+(y>x?'lab-up':'lab-down')+'">'+(y>x?'+':'')+(y-x)+'</span></div>';
 }).join("");
 return '<h2 id="deckLabTitle">Comparar mazos</h2><label for="labOpponent">Comparar <b>'+safe(d.name)+'</b> con</label>'+
 '<select id="labOpponent" class="field">'+others.map(x=>'<option value="'+safe(x.id)+'"'+(x.id===lab.opponentId?' selected':'')+'>'+safe(x.name)+'</option>').join("")+'</select>'+
 '<div class="deck-lab-metrics"><div><b>'+shared+'</b><small>Copias en común</small></div><div><b>'+differences.length+'</b><small>Cartas con cantidades distintas</small></div><div><b>'+keys.filter(id=>a.has(id)&&b.has(id)).length+'</b><small>Cartas distintas compartidas</small></div></div>'+
 '<div class="deck-lab-versus"><div><h3>'+safe(d.name)+'</h3><small>'+safe(title(d.leader))+' · '+entries(d).length+'/50</small><b>'+money(deckTotalValue(d))+'</b><small>Valor orientativo</small></div>'+
 '<div><h3>'+safe(other.name)+'</h3><small>'+safe(title(other.leader))+' · '+entries(other).length+'/50</small><b>'+money(deckTotalValue(other))+'</b><small>Valor orientativo</small></div></div>'+
 (code(d.leader)!==code(other.leader)?'<div class="notice">Líderes diferentes: '+safe(code(d.leader)||"—")+' y '+safe(code(other.leader)||"—")+'.</div>':'')+
 '<h3>Diferencias de la lista</h3><p class="small">Se agrupan las paralelas y reimpresiones por número jugable, pero no se modifica su identidad guardada. Cantidades: mazo original / comparado y diferencia del segundo.</p>'+
 (rows||'<div class="notice">Las cantidades por carta jugable son idénticas.</div>');
}
function render(){
 const d=active();if(!d){close();return}
 let layer=document.querySelector("#deckLabOverlay");
 if(!layer){layer=document.createElement("div");layer.id="deckLabOverlay";layer.className="deck-lab-overlay";document.body.appendChild(layer)}
 layer.innerHTML='<section class="deck-lab-dialog" role="dialog" aria-modal="true" aria-labelledby="deckLabTitle" tabindex="-1">'+
 '<div class="deck-lab-top"><span class="small">Herramientas de mazo · Solo lectura</span><button class="secondary btn" id="labClose" aria-label="Cerrar">✕</button></div>'+
 (lab.view==="simulate"?simulateHtml(d):compareHtml(d))+'</section>';
 layer.onclick=e=>{if(e.target===layer||e.target.closest("#labClose"))close()};
 layer.querySelector("#labOrder")?.addEventListener("change",e=>{lab.first=e.target.value==="first";reset();render()});
 layer.querySelector("#labReset")?.addEventListener("click",()=>{reset();render()});
 layer.querySelector("#labMulligan")?.addEventListener("click",()=>{if(lab.mulligan||lab.turn)return;lab.pile=shuffle(entries(d));lab.hand=lab.pile.splice(0,Math.min(5,lab.pile.length));lab.mulligan=true;render()});
 layer.querySelector("#labNext")?.addEventListener("click",()=>{if(!lab.pile.length)return;lab.turn++;if(!(lab.turn===1&&lab.first))lab.hand.push(lab.pile.shift());render()});
 layer.querySelector("#labTarget")?.addEventListener("change",e=>{lab.target=e.target.value;render()});
 layer.querySelector("#labOpponent")?.addEventListener("change",e=>{lab.opponentId=e.target.value;render()});
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&lab.view)close()});
window.OnePieceDeckLab={simulate:()=>open("simulate"),compare:()=>open("compare"),close,helpers:{counts,combination,probability,entries}};
})();