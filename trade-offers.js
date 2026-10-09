/* Peer-to-peer trade offers: inventory moves exclusively in PostgreSQL after mutual consent. */
(function(){
"use strict";
const box={owner:null,offers:[],loading:false,saving:false,error:"",recipient:"",lastLoad:0};
const html=s=>esc(s);
function resetIfAccountChanged(){
 const id=state.user?.id||null;
 if(id!==box.owner){box.owner=id;box.offers=[];box.error="";box.lastLoad=0;box.loading=false}
}
function cardRows(rows){
 return (rows||[]).map(x=>{
  const c=card(x.id),unit=c?priceOf(c):null;
  return '<div class="trade-offer-row">'+(c?cardImg(c,"thumb"):"")+'<div class="grow"><b>'+html(c?.name||x.id)+'</b>'+
  '<div class="small">'+html(x.id)+' · '+Number(x.q||0)+' copias'+(unit?' · '+money(Number(x.q)*unit):" · sin precio")+'</div></div></div>';
 }).join("");
}
function statusLabel(v){
 return ({pending:"Esperando aceptación",completed:"Completado",rejected:"Rechazado",cancelled:"Cancelado"})[v]||v;
}
function view(){
 resetIfAccountChanged();
 if(!state.user)return '<div class="notice">Inicia sesión para enviar y recibir intercambios.</div>';
 let rows="";
 for(const v of box.offers){
  const mine=v.maker_id===state.user.id,other=mine?v.taker_label:v.maker_label;
  rows+='<article class="section trade-offer"><div class="sectionhead"><div><b>'+html(other||"Usuario")+'</b>'+
    '<div class="small">'+(mine?"Propuesta enviada":"Propuesta recibida")+' · '+html(statusLabel(v.status))+
    ' · '+new Date(v.created_at).toLocaleDateString("es-ES")+'</div></div>'+
    (v.status==="completed"?'<strong style="color:var(--ok)">✓ Realizado</strong>':'')+'</div>'+
    '<p class="small">El creador ofreció:</p>'+cardRows(v.offered)+
    '<p class="small">El destinatario ofrece:</p>'+cardRows(v.requested)+
    (v.status==="pending"?
      '<div class="trade-offer-actions">'+(mine?
       '<span class="small">✓ Ya aceptaste al enviar. Falta la otra persona.</span>'+
       '<button class="danger btn" data-trade-act="cancel" data-id="'+html(v.id)+'">Cancelar</button>':
       '<button class="primary btn" data-trade-act="accept" data-id="'+html(v.id)+'">Aceptar e intercambiar</button>'+
       '<button class="danger btn" data-trade-act="reject" data-id="'+html(v.id)+'">Rechazar</button>')+'</div>':'')+
    '</article>';
 }
 return '<section class="section"><h2>Proponer un intercambio</h2>'+
  '<p class="small">Busca a la otra persona por su <b>nombre de usuario</b> (el de su cuenta). El creador acepta al enviar la propuesta. La otra persona debe aceptarla también. Hasta entonces, ninguna carta cambia de dueño.</p>'+
  '<input id="tradePeer" class="field" maxlength="60" autocomplete="off" placeholder="Nombre de usuario de la otra persona" value="'+html(box.recipient)+'">'+
  '<div class="trade-offer-actions"><button class="primary btn" id="tradeSendOffer"'+(box.saving?" disabled":"")+'>'+
   (box.saving?"Enviando…":"Enviar y aceptar propuesta")+'</button></div>'+
  '<p class="small">Solo se transfieren copias reales de la versión seleccionada, nunca equivalentes o sustituciones automáticas. Ambos deben conservar las copias necesarias hasta el momento de aceptar.</p></section>'+
  '<div class="sectionhead"><h2>Mis propuestas</h2><button class="secondary btn" id="tradeRefresh">'+(box.loading?"Cargando…":"Actualizar")+'</button></div>'+
  (box.error?'<div class="notice">'+html(box.error)+'</div>':"")+
  (box.loading?'<div class="notice">Consultando propuestas en Supabase…</div>':
   rows||'<div class="notice">No tienes propuestas todavía.</div>');
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
async function send(){
 resetIfAccountChanged();if(!box.owner||!state.sb)return notify("Inicia sesión");
 const username=String(document.querySelector("#tradePeer")?.value||"").trim();
 if(!username)return notify("Introduce el nombre de usuario de la otra persona");
 await window.OnePieceTools?.flushCloud?.();
 const items=window.OnePieceTools?.tradeItems?.();
 if(!items?.[0]?.length||!items?.[1]?.length)return notify("Añade cartas a ambos lados y espera a que se guarde el borrador en Supabase");
 for(const x of items[0]){
  if(qty(x.id)<Number(x.q||0))return notify("No tienes suficientes copias de "+x.id);
 }
 const detail=items.map(a=>a.map(x=>x.q+" × "+x.id).join(", "));
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
 document.querySelector("#tradePeer")?.addEventListener("input",e=>{box.recipient=e.target.value});
 document.querySelector("#tradeSendOffer")?.addEventListener("click",()=>void send());
 document.querySelector("#tradeRefresh")?.addEventListener("click",()=>void load(true));
 document.querySelectorAll("[data-trade-act]").forEach(b=>b.onclick=()=>void act(b.dataset.id,b.dataset.tradeAct));
 if(box.owner&&state.sb&&!box.loading&&Date.now()-box.lastLoad>10000)void load();
}
const css=document.createElement("style");
css.textContent=".trade-offer-row{display:flex;gap:9px;padding:7px 0;align-items:center;border-bottom:1px solid var(--line)}.trade-offer-row .thumb{width:40px;height:56px;flex:none}.trade-offer-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.trade-offer .small{line-height:1.5}.trade-offer p.small{margin:12px 0 3px}";
document.head.appendChild(css);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.tab==="trades")void load(true)});
window.TradeOffers={view,bind,load};
})();