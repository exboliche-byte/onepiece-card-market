/* Peer-to-peer trade offers: inventory moves exclusively in PostgreSQL after mutual consent. */
(function(){
"use strict";
const box={owner:null,offers:[],loading:false,saving:false,error:"",recipient:"",suggestions:[],suggestTimer:null,suggestToken:0,lastLoad:0};
const html=s=>esc(s);
function resetIfAccountChanged(){
 const id=state.user?.id||null;
 if(id!==box.owner){
  if(box.suggestTimer)clearTimeout(box.suggestTimer);
  box.suggestToken++;box.owner=id;box.offers=[];box.error="";box.recipient="";
  box.suggestions=[];box.lastLoad=0;box.loading=false;
 }
}
function cardRows(rows){
 return (rows||[]).map(x=>{
  const c=card(x.id)||state.cards?.find(c=>String(c.id).toLowerCase()===String(x.id).toLowerCase()),unit=c?priceOf(c):null;
  // Show the exact printing even if this card is not yet present in the loaded catalogue.
  const image=cardImg(c||{id:x.id,name:x.id},"trade-card-art");
  return '<div class="trade-offer-row">'+image+'<div class="grow"><b>'+html(c?.name||x.id)+'</b>'+
  '<div class="small">'+html(x.id)+' · '+Number(x.q||0)+' copias'+(unit?' · '+money(Number(x.q)*unit):" · sin precio")+'</div></div></div>';
 }).join("");
}
function statusLabel(v){
 return ({pending:"Esperando aceptación",completed:"Completado",rejected:"Rechazado",cancelled:"Cancelado"})[v]||v;
}
function view(mode="all"){
 resetIfAccountChanged();
 if(!state.user)return '<div class="notice">Inicia sesión para enviar y recibir intercambios.</div>';
 let rows="";
 for(const v of box.offers){
  const mine=v.maker_id===state.user.id,other=mine?v.taker_label:v.maker_label;
  const required=Array.isArray(v.requested)?v.requested:[],missing=(!mine&&v.status==="pending")?
    required.filter(x=>qty(x.id)<Number(x.q||0)):[];
  const ready=!!state.collectionReady&&!missing.length;
  rows+='<article class="section trade-offer"><div class="sectionhead"><div><b>'+html(other||"Usuario")+'</b>'+
    '<div class="small">'+(mine?"Propuesta enviada":"Propuesta recibida")+' · '+html(statusLabel(v.status))+
    ' · '+new Date(v.created_at).toLocaleDateString("es-ES")+'</div></div>'+
    (v.status==="completed"?'<strong style="color:var(--ok)">✓ Realizado</strong>':'')+'</div>'+
    '<p class="small">El creador entrega:</p>'+(v.offered?.length?cardRows(v.offered):'<div class="small">Nada (petición de cartas)</div>')+
    '<p class="small">El destinatario entrega:</p>'+(v.requested?.length?cardRows(v.requested):'<div class="small">Nada (regalo de cartas)</div>')+
    (v.status==="pending"?
      '<div class="trade-offer-actions">'+(mine?
       '<span class="small">✓ Ya aceptaste al enviar. Falta la otra persona.</span>'+
       '<button class="danger btn" data-trade-act="cancel" data-id="'+html(v.id)+'">Cancelar</button>':
       (missing.length?'<p class="trade-insufficient">No tienes suficientes cartas: '+missing.map(x=>
         html(x.id)+' ('+qty(x.id)+'/'+Number(x.q||0)+')').join(", ")+'. No puedes aceptar.</p>':"")+
       (!state.collectionReady?'<p class="trade-insufficient">Cargando tu colección; no puedes aceptar todavía.</p>':"")+
       '<button class="primary btn" data-trade-act="accept" data-id="'+html(v.id)+'"'+(!ready?' disabled title="Necesitas todas las copias de las versiones exactas"':"")+'>Aceptar propuesta</button>'+
       '<button class="danger btn" data-trade-act="reject" data-id="'+html(v.id)+'">Rechazar</button>')+'</div>':'')+
    '</article>';
 }
 const composer='<section class="section"><h2>Proponer un intercambio</h2>'+
  '<p class="small">Busca a la otra persona por su <b>nombre de usuario</b>. Puedes regalar si solo entregas cartas, o pedir si solo las recibes. Ambos participantes deben aceptar. Las cantidades de tu colección se comprobarán antes de transferir nada.</p>'+
  '<div class="trade-user-search"><input id="tradePeer" class="field" maxlength="60" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="tradePeerSuggestions" aria-expanded="'+(box.suggestions.length?"true":"false")+'" placeholder="Escribe el usuario (@...)" value="'+html(box.recipient)+'">'+
  '<div id="tradePeerSuggestions" class="trade-user-suggestions" role="listbox"></div></div>'+
  '<div class="trade-offer-actions"><button class="primary btn" id="tradeSendOffer"'+(box.saving?" disabled":"")+'>'+
   (box.saving?"Enviando…":"Enviar propuesta")+'</button></div>'+
  '<p class="small">Solo se transfieren copias reales de la versión seleccionada, nunca equivalentes o sustituciones automáticas. Ambos deben conservar las copias necesarias hasta el momento de aceptar.</p></section>'+
 const proposals='<div class="sectionhead"><h2>Mis propuestas</h2><button class="secondary btn" id="tradeRefresh">'+(box.loading?"Cargando…":"Actualizar")+'</button></div>'+
  (box.error?'<div class="notice">'+html(box.error)+'</div>':"")+
  (box.loading?'<div class="notice">Consultando propuestas en Supabase…</div>':
   rows||'<div class="notice">No tienes propuestas todavía.</div>');
 return mode==="compose"?composer:mode==="list"?proposals:composer+proposals;
}
async function load(force=false){
 resetIfAccountChanged();
 const uid=box.owner;
 if(!uid||!state.sb||box.loading||(!force&&Date.now()-box.lastLoad<10000))return;
 box.loading=true;box.error="";
 try{
  const r=await state.sb.from("trade_offers")
    .select("id,maker_id,taker_id,maker_label,taker_label,offered,requested,maker_accepted,taker_accepted,status,created_at,completed_at")
    .order("created_at",{ascending:false}).limit(100);
  if(r.error)throw r.error;
  if(box.owner!==uid)return;
  const older=new Set(box.offers.filter(x=>x.status==="pending").map(x=>x.id));
  box.offers=Array.isArray(r.data)?r.data:[];
  box.lastLoad=Date.now();
  const changed=box.offers.some(x=>x.status==="completed"&&older.has(x.id));
  if(changed)void loadCollectionFromCloud(uid).then(()=>{if(state.tab==="trades")renderShell()});
 }catch(err){
  if(box.owner===uid)box.error="No se pudieron consultar los intercambios: "+(err.message||err);
 }finally{
  if(box.owner===uid){box.loading=false;if(state.tab==="trades")renderShell()}
 }
}
function drawSuggestions(){
 const host=document.querySelector("#tradePeerSuggestions");if(!host)return;
 const q=box.recipient.trim();
 host.innerHTML=box.suggestions.map(u=>
 '<button type="button" class="trade-user-option" role="option" data-trade-username="'+html(u.username)+'">'+
 '<b>@'+html(u.username)+'</b>'+(u.display_name&&u.display_name!==u.username?'<small>'+html(u.display_name)+'</small>':"")+
 '</button>').join("");
 document.querySelector("#tradePeer")?.setAttribute("aria-expanded",String(box.suggestions.length>0));
 host.querySelectorAll("[data-trade-username]").forEach(b=>b.onclick=()=>{
  box.recipient=b.dataset.tradeUsername;box.suggestions=[];
  const input=document.querySelector("#tradePeer");if(input){input.value=box.recipient;input.focus()}
  drawSuggestions();
 });
}
function suggest(value){
 box.recipient=value;box.suggestions=[];drawSuggestions();
 if(box.suggestTimer)clearTimeout(box.suggestTimer);
 const token=++box.suggestToken,owner=box.owner,q=String(value||"").trim();
 if(!q||!owner||!state.sb)return;
 box.suggestTimer=setTimeout(async()=>{
  try{
   const r=await state.sb.rpc("trade_search_users",{p_query:q});
   if(r.error)throw r.error;
   if(owner!==box.owner||token!==box.suggestToken||document.querySelector("#tradePeer")?.value.trim()!==q)return;
   box.suggestions=Array.isArray(r.data)?r.data.slice(0,8).filter(x=>x.username):[];
   drawSuggestions();
  }catch(err){if(owner===box.owner&&token===box.suggestToken){
   box.suggestions=[];drawSuggestions();
   console.warn("Sugerencias de usuarios no disponibles",err);
  }}
 },180);
}
async function checkOwnedFresh(items){
 if(!state.user?.id||!state.sb)return {ok:false,why:"Inicia sesión."};
 const required=Array.isArray(items)?items:[];
 if(!required.length)return {ok:true}; // Receiving a gift requires no outgoing cards.
 const ids=required.map(x=>String(x.id||""));
 const r=await state.sb.from("collection_items").select("card_id,quantity")
  .eq("user_id",state.user.id).in("card_id",ids);
 if(r.error)throw r.error;
 const owned=new Map((r.data||[]).map(x=>[x.card_id,Number(x.quantity)||0]));
 const lacks=required.filter(x=>(owned.get(x.id)||0)<Number(x.q||0));
 return lacks.length?
  {ok:false,why:"No tienes suficientes copias para aceptar: "+lacks.map(x=>
    x.id+" ("+(owned.get(x.id)||0)+"/"+x.q+")").join(", ")}:{ok:true};
}
async function send(){
 resetIfAccountChanged();if(!box.owner||!state.sb)return notify("Inicia sesión");
 const username=String(document.querySelector("#tradePeer")?.value||"").trim();
 if(!username)return notify("Introduce el nombre de usuario de la otra persona");
 await window.OnePieceTools?.flushCloud?.();
 const items=window.OnePieceTools?.tradeItems?.();
 if(!items||(!items[0]?.length&&!items[1]?.length))return notify("Añade al menos una carta para regalar, pedir o intercambiar; espera a que se guarde el borrador.");
 for(const x of items[0]){
  if(qty(x.id)<Number(x.q||0))return notify("No tienes suficientes copias de "+x.id);
 }
 const detail=items.map(a=>a.length?a.map(x=>x.q+" × "+x.id).join(", "):"Nada");
 if(!confirm("¿Proponer este intercambio a @"+username+" y aceptar tu parte?\n\nEntregas: "+detail[0]+"\nRecibes: "+detail[1]+"\n\nLas cartas solo se moverán si la otra persona acepta."))return;
 box.saving=true;box.recipient=username;renderShell();
 try{
  const r=await state.sb.rpc("trade_offer_create",{
   p_partner_username:username,p_offered:items[0],p_requested:items[1]
  });
  if(r.error)throw r.error;
  box.lastLoad=0;await load(true);
  notify("Propuesta enviada. Esperando a que la otra persona acepte");
 }catch(err){box.error="No se pudo enviar la propuesta: "+(err.message||err);notify("No se pudo enviar la propuesta")}
 finally{box.saving=false;if(state.tab==="trades")renderShell()}
}
async function act(id,action){
 if(!box.owner||!state.sb||box.saving)return;
 if(action==="accept"){
  const offer=box.offers.find(x=>x.id===id);
  if(!offer||offer.taker_id!==box.owner||offer.status!=="pending")return notify("No puedes aceptar esta propuesta");
  if(!state.collectionReady)return notify("Espera a que termine de cargar tu colección");
  try{
   const available=await checkOwnedFresh(offer.requested);
   if(!available.ok){box.error=available.why;renderShell();return notify("No puedes aceptar: te faltan cartas")}
  }catch(err){box.error="No se pudo comprobar la colección en Supabase: "+(err.message||err);renderShell();return notify("No se puede aceptar sin verificar la colección")}
 }
 const verb=action==="accept"?"Aceptar":action==="reject"?"Rechazar":"Cancelar";
 if(!confirm(verb+" este intercambio?"+(action==="accept"?"\nLas cartas de ambos usuarios se transferirán automáticamente si los dos tienen copias suficientes.":"")))return;
 box.saving=true;box.error="";
 try{
  const r=await state.sb.rpc("trade_offer_decide",{p_offer_id:id,p_action:action});
  if(r.error)throw r.error;
  box.lastLoad=0;await load(true);
  if(action==="accept")await loadCollectionFromCloud(box.owner);
  notify(action==="accept"?"Intercambio completado en ambas colecciones":"Propuesta "+(action==="cancel"?"cancelada":"rechazada"));
 }catch(err){
  box.error="No se completó el intercambio; no se ha aplicado ninguna transferencia: "+(err.message||err);
  notify("No se ha realizado el intercambio");
 }finally{box.saving=false;if(state.tab==="trades")renderShell()}
}
function bind(){
 document.querySelector("#tradePeer")?.addEventListener("input",e=>suggest(e.target.value));
 document.querySelector("#tradePeer")?.addEventListener("keydown",e=>{
  if(e.key==="Escape"){box.suggestions=[];drawSuggestions()}
  if(e.key==="Enter"&&box.suggestions.length){
   e.preventDefault();box.recipient=box.suggestions[0].username;box.suggestions=[];
   e.target.value=box.recipient;drawSuggestions();
  }
 });
 drawSuggestions();
 document.querySelector("#tradeSendOffer")?.addEventListener("click",()=>void send());
 document.querySelector("#tradeRefresh")?.addEventListener("click",()=>void load(true));
 document.querySelectorAll("[data-trade-act]").forEach(b=>b.onclick=()=>void act(b.dataset.id,b.dataset.tradeAct));
 if(box.owner&&state.sb&&!box.loading&&Date.now()-box.lastLoad>10000)void load();
}
const css=document.createElement("style");
css.textContent=".trade-offer-row{display:flex;gap:9px;padding:7px 0;align-items:center;border-bottom:1px solid var(--line)}.trade-card-art{width:55px!important;height:77px!important;object-fit:cover;flex:none;border-radius:6px;background:var(--panel2)}.trade-offer-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.trade-offer .small{line-height:1.5}.trade-offer p.small{margin:12px 0 3px}";
css.textContent+=".trade-user-search{position:relative}.trade-user-suggestions{position:relative;z-index:2;border-radius:10px;overflow:hidden}.trade-user-option{width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);text-align:left;padding:10px;display:flex;gap:10px;align-items:center;cursor:pointer}.trade-user-option:hover{border-color:var(--accent)}.trade-user-option small{color:var(--muted)}.trade-insufficient{flex-basis:100%;font-size:12px;color:#ff9999;margin:6px 0}.trade-offer-row .grow{min-width:0}";
document.head.appendChild(css);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.tab==="trades")void load(true)});
window.TradeOffers={view,bind,load};
})();