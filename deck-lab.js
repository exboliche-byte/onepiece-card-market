(function(){
"use strict";
/* Read-only mazo tools. Card editions remain exact in the saved decks. */
const lab={view:"",deckId:null,opponentId:"",source:"saved",external:[],externalLoaded:false,externalError:"",filter:"",pasted:null,pastedText:"",pile:[],life:[],hand:[],played:[],mulligan:false,turn:0,don:0,first:true,lifeCount:5,target:"",combo:[],minCopies:1};
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
function leaderLife(d){const c=card(d?.leader);const value=Number(c?.life??c?.lifePoints??c?.life_points);return Number.isInteger(value)&&value>=0&&value<=8?value:5}
function reset(){
 const cards=shuffle(entries(active()));
 lab.hand=cards.splice(0,Math.min(5,cards.length));
 lab.life=cards.splice(0,Math.min(lab.lifeCount,cards.length));
 lab.pile=cards;lab.played=[];lab.turn=0;lab.don=0;lab.mulligan=false;
}
function candidateDeck(){return state.decks.find(d=>d.id===state.deckId)||state.decks.find(d=>!d.draftCompetitive)||null}
function open(view){
 const d=candidateDeck();if(!d)return notify("Crea o guarda un mazo primero para comparar o simular");
 lab.deckId=d.id;lab.view=view;
 if(view==="simulate"){lab.first=true;lab.lifeCount=leaderLife(d);lab.target=counts(d).keys().next().value||"";lab.combo=[lab.target].filter(Boolean);lab.minCopies=1;reset()}
 else {lab.source="saved";lab.opponentId=state.decks.find(x=>x.id!==d.id&&!x.draftCompetitive)?.id||"";lab.externalError="";refreshSources();}
 render();
}
function normalizedExternal(r){
 if(!r||typeof r!=="object"||!r.cards||typeof r.cards!=="object")return null;
 const cards=Object.fromEntries(Object.entries(r.cards).filter(([id,q])=>/^[A-Za-z0-9_-]{3,140}$/.test(id)&&Number.isInteger(Number(q))&&Number(q)>0&&Number(q)<=50).slice(0,60));
 if(!Object.keys(cards).length)return null;
 return {id:String(r.id||r.sourceUrl||r.leaderId||""),leader:r.leaderId||r.leader||"",name:String(r.name||r.leaderName||r.leaderId||"Mazo competitivo").slice(0,130),cards,sourceUrl:r.sourceUrl||"",tournament:r.tournament||""};
}
function refreshSources(){
 const all=[...(state.deckDiscoverResults||[]),...(window.OnePieceTools?.competitiveLists?.()||[])];
 const seen=new Set();lab.external=all.map(normalizedExternal).filter(r=>{if(!r)return false;const k=r.id+"|"+r.name;if(seen.has(k))return false;seen.add(k);return true});
}
async function loadExternal(){
 lab.externalError="";render();
 try{
  const res=await fetch("/api/competitive-decks?leader=all&days=90&minPlayers=16&limit=120",{headers:{accept:"application/json"}});
  if(!res.ok)throw Error("El servidor no ha podido obtener las listas");
  const json=await res.json();
  const seen=new Set(lab.external.map(x=>x.id+"|"+x.name));
  for(const x of json.results||[]){const r=normalizedExternal(x);if(r&&!seen.has(r.id+"|"+r.name)){lab.external.push(r);seen.add(r.id+"|"+r.name)}}
  lab.externalLoaded=true;
 }catch(e){lab.externalError=String(e.message||e)}
 render();
}
function compareWithCompetitive(raw){
 const r=normalizedExternal(raw);if(!r)return notify("No se puede comparar esta lista");
 open("compare");if(lab.view!=="compare")return;
 lab.external=[r,...lab.external.filter(x=>x.id!==r.id)];lab.source="competitive";lab.opponentId=r.id;render();
}
function parsePasted(raw,d){
 const cards={},errors=[];let leader=d.leader;const lines=String(raw||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 for(const line of lines.slice(0,70)){
  const match=line.match(/^(?:(\d{1,2})\s*[xX×]?\s+)?([A-Za-z]{1,5}\d{0,2}-\d{3}(?:_p\d+)?|P-\d{3}(?:_p\d+)?)(?:\s+[xX×]?\s*(\d{1,2}))?(?:\s+.*)?$/i);
  if(!match){errors.push(line);continue}
  const quantity=Number(match[1]||match[3]||1),id=match[2],c=card(id);
  if(quantity<1||quantity>50||!c){errors.push(line);continue}
  if(c.category==="Leader"||c.rarity==="Leader"){leader=id;continue}
  cards[id]=(cards[id]||0)+quantity;
 }
 if(errors.length)return {error:"Líneas no reconocidas o impresiones ausentes: "+errors.slice(0,4).join("; ")};
 if(!Object.keys(cards).length)return {error:"Añade al menos una carta con su código."};
 return {deck:{id:"pasted",name:"Lista pegada",leader,cards}};
}

function thumb(id){const c=card(id);return c?cardImg(c,"thumb"):'<div class="thumb">?</div>'}
function title(id){return card(id)?.name||id||"Sin líder"}
function comboChance(total,quantities,draws){
 total=n(total);draws=Math.min(n(draws),total);
 if(!quantities.length||!total||!draws)return 0;
 let value=0;
 for(let mask=0;mask<(1<<quantities.length);mask++){
  let excluded=0,bits=0;
  for(let i=0;i<quantities.length;i++)if(mask&(1<<i)){excluded+=quantities[i];bits++}
  const ways=combination(Math.max(0,total-excluded),draws);
  value+=(bits%2?-1:1)*ways;
 }
 const denom=combination(total,draws);
 return denom?Math.max(0,Math.min(1,value/denom)):0;
}
function simulateHtml(d){
 const total=entries(d).length,all=counts(d),K=all.get(lab.target)||0;
 const options=[...all].sort((a,b)=>a[0].localeCompare(b[0],"es",{numeric:true}));
 const afterTwo=Math.min(total,5+(lab.first?1:2));
 const comboIds=[...new Set(lab.combo.filter(Boolean))].filter(id=>all.has(id)).slice(0,3);
 const chance=comboChance(total,comboIds.map(id=>all.get(id)),5),after=comboChance(total,comboIds.map(id=>all.get(id)),afterTwo);
 const pct=x=>(100*x).toFixed(1)+"%";
 const hasCombo=comboIds.length>0&&comboIds.every(id=>lab.hand.some(c=>code(c)===id));
 return '<h2 id="deckLabTitle">Laboratorio de manos · '+safe(d.name)+'</h2>'+
 '<p class="small">Mazo mezclado · mano inicial de 5 · mulligan completo una vez · vidas boca abajo separadas después del mulligan · DON!! por turno. No se interpretan efectos de cartas.</p>'+
 (total!==50?'<div class="notice">Mazo incompleto ('+total+'/50). Los cálculos corresponden a estas '+total+' cartas, no a un mazo legal.</div>':'')+
 '<div class="deck-lab-controls"><label>Sales<select class="field" id="labOrder"><option value="first"'+(lab.first?' selected':'')+'>Primero</option><option value="second"'+(!lab.first?' selected':'')+'>Segundo</option></select></label>'+
 '<label>Vidas del líder<input class="field" type="number" id="labLife" min="0" max="8" value="'+lab.lifeCount+'"></label>'+
 '<button class="secondary btn" id="labReset">Nueva mano</button>'+
 '<button class="secondary btn" id="labMulligan" '+(lab.mulligan||lab.turn?'disabled':'')+'>Mulligan (1)</button>'+
 '<button class="primary btn" id="labNext" '+(!lab.pile.length?'disabled':'')+'>'+(lab.turn?'Siguiente turno':'Comenzar turno 1')+'</button></div>'+
 '<div class="deck-lab-metrics"><div><b>'+lab.turn+'</b><small>Tu turno</small></div><div><b>'+lab.don+'/10</b><small>DON!! acumulados</small></div><div><b>'+lab.life.length+'</b><small>Cartas de vida, ocultas</small></div></div>'+
 '<p class="small">'+lab.hand.length+' en mano · '+lab.pile.length+' en mazo · '+lab.played.length+' jugadas/descartadas'+(lab.turn===1&&lab.first?' · primero sin robo inicial':'')+'</p>'+
 '<div class="deck-lab-hand">'+lab.hand.map((id,i)=>'<div class="deck-lab-card" title="'+safe(title(id))+'">'+thumb(id)+'<span>'+safe(code(id))+'</span><button class="secondary btn" type="button" data-lab-play="'+i+'" title="Retirar de la mano">Jugar / retirar</button></div>').join("")+'</div>'+
 '<div class="section deck-lab-odds"><h3>Probabilidades exactas</h3>'+
 '<label for="labTarget">Carta objetivo y copias mínimas</label><div class="deck-lab-controls"><select class="field" id="labTarget">'+options.map(([id,q])=>'<option value="'+safe(id)+'"'+(id===lab.target?' selected':'')+'>'+safe(id+' · '+q+' copias · '+title(id))+'</option>').join("")+'</select>'+
 '<select class="field" id="labMinCopies"><option value="1">≥ 1 copia</option><option value="2"'+(lab.minCopies===2?' selected':'')+'>≥ 2 copias</option></select></div>'+
 '<div class="deck-lab-metrics"><div><b>'+pct(probability(total,K,5,lab.minCopies))+'</b><small>Objetivo en mano inicial</small></div>'+
 '<div><b>'+pct(probability(total,K,afterTwo,lab.minCopies))+'</b><small>Objetivo tras 2 turnos*</small></div>'+
 '<div><b>'+pct(1-Math.pow(1-probability(total,K,5,lab.minCopies),2))+'</b><small>Con una oportunidad de mulligan**</small></div></div>'+
 '<h3>Mi buena mano: cartas que quiero ver juntas</h3>'+
 '<p class="small">Selecciona hasta tres cartas distintas. Se calcula la probabilidad de ver al menos una de cada una, sin búsquedas ni efectos.</p>'+
 '<div class="deck-lab-combo">'+[0,1,2].map(i=>'<label>Carta '+(i+1)+'<select class="field" data-lab-combo="'+i+'"><option value="">No seleccionar</option>'+
 options.map(([id,q])=>'<option value="'+safe(id)+'"'+(lab.combo[i]===id?' selected':'')+'>'+safe(id)+' · '+q+' copias</option>').join("")+'</select></label>').join("")+'</div>'+
 '<div class="deck-lab-metrics"><div><b>'+pct(chance)+'</b><small>Buena mano inicial</small></div><div><b>'+pct(after)+'</b><small>Buena mano tras 2 turnos*</small></div><div><b>'+pct(1-Math.pow(1-chance,2))+'</b><small>Buena mano con mulligan**</small></div></div>'+
 '<p class="small">'+(comboIds.length?(hasCombo?'✓ La mano actual cumple el combo.':'La mano actual no cumple todo el combo.'):'Selecciona al menos una carta.')+
 ' *El primero no roba en turno 1; el segundo sí. **Si decides hacer mulligan cuando la primera mano no cumple el objetivo. Son probabilidades incondicionales sobre las 50 cartas, no predicciones de esta mano ni de las vidas ocultas.</p></div>';
}
function cheapestPrints(){
 const prices=new Map();
 for(const c of state.cards||[]){
  if(!c?.id||typeof isJapaneseCatalogCard==="function"&&isJapaneseCatalogCard(c))continue;
  const id=code(c.id),p=priceOf(c);
  if(Number.isFinite(p)&&p>0&&(!prices.has(id)||prices.get(id).price>p))
   prices.set(id,{price:p,card:c});
 }
 return prices;
}
function neededToBuy(d,prices){
 const required=counts(d),purchase=[],leaderCode=code(d.leader);
 if(leaderCode)required.set(leaderCode,Math.max(1,required.get(leaderCode)||0));
 const inStock=new Map();
 for(const [id,q] of Object.entries(state.owned||{})){
  const k=code(id);inStock.set(k,(inStock.get(k)||0)+n(q));
 }
 let total=0,unknown=0,copies=0;
 for(const [id,wanted] of required){
  const missing=Math.max(0,wanted-(inStock.get(id)||0));
  if(!missing)continue;
  const info=prices.get(id);copies+=missing;
  if(info)total+=info.price*missing;else unknown+=missing;
  purchase.push({id,missing,price:info?.price??null,card:info?.card||null});
 }
 return {total,unknown,copies,purchase};
}
function selectedComparison(d){
 if(lab.source==="pasted")return lab.pasted;
 if(lab.source==="competitive")return lab.external.find(x=>x.id===lab.opponentId)||null;
 return state.decks.find(x=>x.id===lab.opponentId&&x.id!==d.id&&!x.draftCompetitive)||null;
}
function compareHtml(d){
 const saved=state.decks.filter(x=>x.id!==d.id&&!x.draftCompetitive);
 const options=lab.external.filter(x=>(x.name+" "+x.tournament+" "+x.leader).toLowerCase().includes(lab.filter.toLowerCase())).slice(0,120);
 const other=selectedComparison(d);
 let body="";
 if(other){
  const a=counts(d),b=counts(other),keys=[...new Set([...a.keys(),...b.keys()])];
  const shared=keys.reduce((t,id)=>t+Math.min(a.get(id)||0,b.get(id)||0),0);
  const differences=keys.filter(id=>(a.get(id)||0)!==(b.get(id)||0)).sort((x,y)=>x.localeCompare(y,"es",{numeric:true}));
  const removal=keys.reduce((n,id)=>n+Math.max(0,(a.get(id)||0)-(b.get(id)||0)),0);
  const addition=keys.reduce((n,id)=>n+Math.max(0,(b.get(id)||0)-(a.get(id)||0)),0);
  const priceLookup=cheapestPrints(),buy=neededToBuy(other,priceLookup);
  const rows=differences.map(id=>{
   const x=a.get(id)||0,y=b.get(id)||0,c=priceLookup.get(id)?.card||state.cards.find(z=>code(z.id)===id);
   return '<div class="deck-lab-diff">'+(c?thumb(c.id):'')+'<div class="grow"><b>'+safe(id)+'</b><small>'+safe(c?.name||id)+'</small></div><b>'+x+' → '+y+'</b><span class="'+(y>x?'lab-up':'lab-down')+'">'+(y>x?'+':'')+(y-x)+'</span></div>';
  }).join("");
  const purchases=buy.purchase.map(x=>'<div class="deck-lab-diff">'+(x.card?thumb(x.card.id):'')+'<div class="grow"><b>'+safe(x.card?.name||x.id)+'</b><small>'+safe(x.id)+' · '+x.missing+' copias · impresión más económica disponible</small></div><b>'+(x.price!==null?money(x.price*x.missing):'Sin precio')+'</b></div>').join("");
  body='<div class="deck-lab-metrics"><div><b>'+shared+'</b><small>Copias comunes</small></div><div><b>−'+removal+' / +'+addition+'</b><small>Copias que quitar / añadir</small></div><div><b>'+buy.copies+'</b><small>Copias que no tienes</small></div></div>'+
   '<div class="deck-lab-versus"><div><h3>'+safe(d.name)+'</h3><small>'+safe(title(d.leader))+'</small><b>'+entries(d).length+'/50</b></div>'+
   '<div><h3>'+safe(other.name)+'</h3><small>'+safe(title(other.leader))+'</small><b>'+entries(other).length+'/50</b></div></div>'+
   (code(d.leader)!==code(other.leader)?'<div class="notice">También tendrías que cambiar el líder: '+safe(code(d.leader))+' → '+safe(code(other.leader))+'.</div>':'')+
   '<h3>Transformación de la lista</h3><p class="small">Cantidades por carta jugable, sumando paralelas y reimpresiones; los mazos originales permanecen intactos.</p>'+
   (rows||'<p class="small">No hay diferencias de copias.</p>')+
   '<h3>Compras necesarias para montar el segundo mazo</h3>'+
   '<p class="small">Según todas las copias de tu colección (no solo las incluidas en el primer mazo). Coste de impresiones disponibles más baratas: <b>'+money(buy.total)+'</b>'+
   (buy.unknown?' · '+buy.unknown+' copias sin precio, coste incompleto':'')+'.</p>'+
   (purchases||'<p class="small">Ya tienes todas las copias en tu colección.</p>');
 }else body='<div class="notice">Selecciona una lista para compararla sin guardarla. Puedes usar tus mazos, resultados competitivos o pegar una lista.</div>';
 return '<h2 id="deckLabTitle">Comparador de mazos</h2><p class="small">Compara '+safe(d.name)+' contra cualquier lista sin modificar tu colección.</p>'+
 '<div class="deck-lab-controls"><label>Origen<select id="labSource" class="field"><option value="saved"'+(lab.source==="saved"?' selected':'')+'>Mis mazos</option><option value="competitive"'+(lab.source==="competitive"?' selected':'')+'>Mazos competitivos</option><option value="pasted"'+(lab.source==="pasted"?' selected':'')+'>Pegar lista</option></select></label>'+
 '<label>Mazo de partida<select id="labBase" class="field">'+state.decks.filter(x=>!x.draftCompetitive||x.id===d.id).map(x=>'<option value="'+safe(x.id)+'"'+(x.id===d.id?' selected':'')+'>'+safe(x.name)+'</option>').join("")+'</select></label></div>'+
 (lab.source==="saved"?'<label>Comparar con<select id="labOpponent" class="field">'+
 '<option value="">Elegir otro mazo</option>'+saved.map(x=>'<option value="'+safe(x.id)+'"'+(x.id===lab.opponentId?' selected':'')+'>'+safe(x.name)+'</option>').join("")+'</select></label>':
 lab.source==="competitive"?'<div class="deck-lab-controls"><input id="labFilter" class="field" type="search" placeholder="Buscar líder o torneo…" value="'+safe(lab.filter)+'">'+
 '<button class="secondary btn" id="labLoadExternal" '+(lab.externalLoaded?'title="Actualizar listas"':'')+'>Consultar listas competitivas</button></div>'+
 (lab.externalError?'<div class="notice">'+safe(lab.externalError)+'</div>':'')+
 '<label>Lista competitiva<select id="labOpponent" class="field"><option value="">Selecciona una lista</option>'+
 options.map(x=>'<option value="'+safe(x.id)+'"'+(x.id===lab.opponentId?' selected':'')+'>'+safe(x.name+' · '+x.tournament)+'</option>').join("")+'</select></label>':
 '<label>Importar lista temporal<textarea id="labPaste" class="field" rows="5" placeholder="4x OP05-060&#10;4 OP09-078&#10;1x ST10-001">'+safe(lab.pastedText)+'</textarea></label>'+
 '<button class="secondary btn" id="labParse">Comparar lista pegada</button>'+
 (lab.externalError?'<div class="notice">'+safe(lab.externalError)+'</div>':''))+
 body;
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
 layer.querySelector("#labLife")?.addEventListener("change",e=>{lab.lifeCount=Math.max(0,Math.min(8,n(e.target.value)));reset();render()});
 layer.querySelector("#labReset")?.addEventListener("click",()=>{reset();render()});
 layer.querySelector("#labMulligan")?.addEventListener("click",()=>{if(lab.mulligan||lab.turn)return;reset();lab.mulligan=true;render()});
 layer.querySelector("#labNext")?.addEventListener("click",()=>{if(!lab.pile.length)return;lab.turn++;lab.don=Math.min(10,lab.don+(lab.turn===1&&lab.first?1:2));if(!(lab.turn===1&&lab.first))lab.hand.push(lab.pile.shift());render()});
 layer.querySelectorAll("[data-lab-play]").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.labPlay);if(!Number.isInteger(i)||i<0||i>=lab.hand.length)return;lab.played.push(lab.hand.splice(i,1)[0]);render()}));
 layer.querySelector("#labTarget")?.addEventListener("change",e=>{lab.target=e.target.value;render()});
 layer.querySelector("#labMinCopies")?.addEventListener("change",e=>{lab.minCopies=Math.max(1,Math.min(2,n(e.target.value)));render()});
 layer.querySelectorAll("[data-lab-combo]").forEach(b=>b.addEventListener("change",e=>{lab.combo[Number(b.dataset.labCombo)]=e.target.value;render()}));
 layer.querySelector("#labSource")?.addEventListener("change",e=>{lab.source=e.target.value;lab.opponentId="";lab.externalError="";render()});
 layer.querySelector("#labBase")?.addEventListener("change",e=>{lab.deckId=e.target.value;lab.opponentId="";render()});
 layer.querySelector("#labFilter")?.addEventListener("input",e=>{lab.filter=e.target.value;const select=layer.querySelector("#labOpponent");if(select){const matches=lab.external.filter(x=>(x.name+" "+x.tournament+" "+x.leader).toLowerCase().includes(lab.filter.toLowerCase())).slice(0,120);select.innerHTML='<option value="">Selecciona una lista</option>'+matches.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name+' · '+x.tournament)+'</option>').join("");if(matches.some(x=>x.id===lab.opponentId))select.value=lab.opponentId;}});
 layer.querySelector("#labLoadExternal")?.addEventListener("click",()=>void loadExternal());
 layer.querySelector("#labOpponent")?.addEventListener("change",e=>{lab.opponentId=e.target.value;render()});
 layer.querySelector("#labParse")?.addEventListener("click",()=>{lab.pastedText=layer.querySelector("#labPaste")?.value||"";const result=parsePasted(lab.pastedText,d);lab.pasted=result.deck||null;lab.externalError=result.error||"";render()});
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&lab.view)close()});
window.OnePieceDeckLab={simulate:()=>open("simulate"),compare:()=>open("compare"),compareWithCompetitive,close,helpers:{counts,combination,probability,comboChance,neededToBuy,parsePasted,leaderLife,entries}};
})();