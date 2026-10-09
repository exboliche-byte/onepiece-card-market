/* Private Want lists: account-only storage, exact printing, live market prices. */
(function(){
"use strict";
const ws={lists:[],selected:"",owner:"",loaded:false,loading:false,busy:false,search:"",error:""};
const h=x=>esc(x),currency=x=>money(x);
function active(){return ws.lists.find(l=>l.id===ws.selected)||ws.lists[0]||null}
function printCard(key){return state.cards.find(x=>x.id===key)||null}
function listEntries(l){
 return Object.entries(l?.items||{}).map(([id,q])=>({id,q:Number(q)||0,c:printCard(id)}))
  .filter(x=>x.q>0).sort((a,b)=>(a.c?.name||a.id).localeCompare(b.c?.name||b.id,"es",{numeric:true}));
}
function needLogin(){if(state.user?.id&&state.sb&&state.collectionReady)return true;notify("Inicia sesión para gestionar tus wants.");return false}
async function load(force=false){
 const user=state.user?.id||"";
 if(!user){ws.owner="";ws.lists=[];ws.selected="";ws.loaded=false;return}
 if(ws.owner!==user){ws.owner=user;ws.lists=[];ws.selected="";ws.loaded=false;ws.error=""}
 if(ws.loading||(!force&&ws.loaded))return;
 ws.loading=true;
 try{
  const r=await state.sb.from("user_want_lists").select("id,name,items,created_at,updated_at")
    .eq("user_id",user).order("created_at",{ascending:true}).limit(150);
  if(r.error)throw r.error;
  if(state.user?.id!==user)return;
  ws.lists=r.data||[];
  if(!ws.lists.some(l=>l.id===ws.selected))ws.selected=ws.lists[0]?.id||"";
  ws.loaded=true;ws.error="";
 }catch(error){
  ws.error=String(error.message||error);console.warn("wants load",error);
 }finally{
  ws.loading=false;
  if(state.user?.id===user&&state.tab==="collection"&&state.wantsOpen)renderShell();
 }
}
async function createList(name){
 if(!needLogin())return null;
 name=String(name||"").trim().slice(0,80);
 if(!name){notify("Escribe un nombre para la lista.");return null}
 const user=state.user.id;
 try{
  const r=await state.sb.from("user_want_lists").insert({id:crypto.randomUUID(),user_id:user,name,items:{}})
    .select("id,name,items,created_at,updated_at").single();
  if(r.error)throw r.error;
  if(state.user?.id!==user)return null;
  ws.lists.push(r.data);ws.selected=r.data.id;ws.loaded=true;
  renderShell();notify("Lista creada en tu cuenta");
  return r.data;
 }catch(error){ws.error=String(error.message||error);notify("No se pudo crear la lista de wants");renderShell();return null}
}
async function changeItem(listId,cardId,quantity){
 if(!needLogin()||ws.busy)return false;
 const selectedList=ws.lists.find(x=>x.id===listId);
 if(!selectedList)return false;
 const c=printCard(cardId);
 const amount=Math.max(0,Math.min(99,Math.round(Number(quantity)||0)));
 if(!c&&amount>0){notify("La impresión exacta no está disponible en el catálogo");return false}
 const user=state.user.id;
 ws.busy=true;
 try{
  const response=await state.sb.rpc("wants_set_item",{p_list_id:listId,p_card_id:cardId,p_quantity:amount});
  if(response.error)throw response.error;
  if(state.user?.id!==user)return false;
  const items={...(selectedList.items||{})};
  if(amount>0)items[cardId]=amount;else delete items[cardId];
  selectedList.items=items;
  notify(amount?"Wants actualizadas":"Carta quitada de wants");
  if(state.tab==="collection"&&state.wantsOpen)renderShell();
  return true;
 }catch(error){console.warn("wants update",error);notify("No se pudieron guardar las wants: "+String(error.message||error).slice(0,85));return false}
 finally{ws.busy=false}
}
async function consume(cardId,amount){
 // Invoked only AFTER a confirmed collection write (or successful CSV import).
 // Database RPC applies the decrement atomically to ALL lists with this exact ID.
 if(!state.user?.id||!state.sb||!Number.isFinite(amount)||amount<=0)return;
 const owner=state.user.id;
 try{
  const r=await state.sb.rpc("wants_consume_item",{p_card_id:cardId,p_quantity:Math.min(99,Math.round(amount))});
  if(r.error)throw r.error;
  if(state.user?.id===owner&&ws.loaded)await load(true);
 }catch(error){
  console.warn("Automatic wants consumption",error);
  if(state.user?.id===owner)notify("Carta guardada, pero las wants no se actualizaron. Revisa Mis wants.");
 }
}
async function consumeBatch(changes){
 if(!state.user?.id||!state.sb||!changes||!Object.keys(changes).length)return;
 const owner=state.user.id;
 try{
  const r=await state.sb.rpc("wants_consume_bulk",{p_changes:changes});
  if(r.error)throw r.error;
  if(state.user?.id===owner&&ws.loaded)await load(true);
 }catch(error){
  console.warn("Wants after CSV import",error);
  if(state.user?.id===owner)notify("Colección importada; revisa Mis wants: no se pudo descontar todo.");
 }
}
function searchResults(){
 const query=norm(ws.search.trim());
 if(query.length<2)return '<p class="small">Escribe al menos dos caracteres para buscar cartas por nombre, ID o expansión.</p>';
 const cards=state.cards.filter(c=>norm(c.name||"").includes(query)||norm(c.id).includes(query)||
   norm(cardExpansionCode(c)||"").includes(query)).slice(0,16);
 if(!cards.length)return '<p class="small">No encontramos cartas con esa búsqueda.</p>';
 return '<div class="wants-search-grid">'+cards.map(c=>
  '<div class="wants-search-row">'+cardImg(c,"wants-search-art")+
  '<div><strong>'+h(c.name||c.id)+'</strong><small>'+h(c.id)+' · '+h(cardPrintLabel(c))+'</small>'+
  '<small>'+currency(priceOf(c))+'</small></div>'+
  '<button class="primary btn" type="button" data-wants-search-add="'+h(c.id)+'">Añadir</button></div>').join("")+'</div>';
}
function bindSearchAdd(){
 document.querySelectorAll("[data-wants-search-add]").forEach(b=>b.onclick=async()=>{
  const l=active();if(l)await changeItem(l.id,b.dataset.wantsSearchAdd,(Number(l.items?.[b.dataset.wantsSearchAdd])||0)+1);
 });
}
function view(){
 const l=active(),rows=listEntries(l);
 const priced=rows.filter(x=>x.c&&priceOf(x.c)!==null);
 const total=priced.reduce((sum,x)=>sum+x.q*priceOf(x.c),0);
 const missing=rows.filter(x=>!x.c||priceOf(x.c)===null).length;
 const copies=rows.reduce((sum,x)=>sum+x.q,0);
 const lists='<div class="wants-list-switch">'+ws.lists.map(x=>
  '<button type="button" data-wants-list="'+h(x.id)+'" class="'+(x.id===l?.id?"active":"")+'">'+
  h(x.name)+' <small>('+Object.keys(x.items||{}).length+')</small></button>').join("")+'</div>';
 return '<div class="wrap wants-page"><div class="hero"><div><h1>💛 Mis wants</h1>'+
   '<p>Listas personales de cartas que quiero, con precios actualizados por impresión.</p></div>'+
   '<button class="secondary btn" id="closeWants" type="button">← Mi colección</button></div>'+
   (ws.error?'<div class="notice">No se pudieron cargar las listas: '+h(ws.error)+
    ' <button class="secondary btn" id="retryWants" type="button">Reintentar</button></div>':"")+
   (ws.loading&&!ws.loaded?'<div class="notice">Cargando wants desde tu cuenta…</div>':"")+
   '<section class="wants-panel"><div class="wants-heading"><h3>Mis listas</h3>'+
   '<button class="primary btn" id="newWantList" type="button">+ Nueva lista</button></div>'+
   (lists||'<p class="small">Crea tu primera lista para guardar las cartas que quieres comprar.</p>')+'</section>'+
   (l?'<section class="wants-panel"><div class="wants-heading"><h3>'+h(l.name)+'</h3>'+
   '<div class="wants-list-actions"><button class="secondary btn" id="renameWantList" type="button">Renombrar</button>'+
   '<button class="danger btn" id="deleteWantList" type="button">Eliminar lista</button></div></div>'+
   '<div class="wants-totals"><div><b>'+copies+'</b><small>Copias pendientes</small></div>'+
   '<div><b>'+currency(total)+'</b><small>Total conocido</small></div>'+
   '<div><b>'+rows.length+'</b><small>Impresiones diferentes</small></div></div>'+
   (missing?'<p class="small">'+missing+' impresiones sin precio disponible: no se incluyen en el total.</p>':"")+
   '<label class="wants-search-label">Buscar y añadir cartas<input class="field" id="wantsSearch" '+
   'type="search" autocomplete="off" placeholder="Nombre, código o expansión" value="'+h(ws.search)+'"></label>'+
   '<div id="wantsSearchResults">'+searchResults()+'</div></section>'+
   '<section class="wants-panel"><h3>Cartas de esta lista</h3>'+
   (rows.length?'<div class="wants-cards">'+rows.map(x=>{
    const p=x.c?priceOf(x.c):null,href=x.c?cardmarketUrl(x.c):"";
    return '<article class="wants-card">'+(x.c?cardImg(x.c,"wants-card-art"):'<div class="wants-card-art">?</div>')+
     '<div class="wants-card-info"><strong>'+h(x.c?.name||x.id)+'</strong><small>'+h(x.id)+
     ' · '+h(x.c?cardPrintLabel(x.c):"Impresión no disponible")+'</small>'+
     '<span>'+currency(p)+' / copia · <b>'+currency(p===null?null:p*x.q)+'</b></span>'+
     (href?'<a href="'+h(href)+'" target="_blank" rel="noopener noreferrer">Ver en Cardmarket ↗</a>':"")+'</div>'+
     '<div class="wants-card-controls"><button class="secondary btn" data-wants-minus="'+h(x.id)+'">−</button>'+
     '<b>×'+x.q+'</b><button class="primary btn" data-wants-plus="'+h(x.id)+'">+</button>'+
     '<button class="secondary btn wants-remove" data-wants-remove="'+h(x.id)+'">Quitar</button></div></article>';
   }).join("")+'</div>':'<div class="notice">Lista vacía. Añade una carta desde aquí, el catálogo o tus mazos.</div>')+
   '</section>':"")+'</div>';
}
async function showAdd(cardId,count=1){
 if(!needLogin())return;
 const c=printCard(cardId);
 if(!c){notify("No se ha encontrado esa versión de la carta.");return}
 await load();
 if(!ws.lists.length){
  const created=await createList("Mis wants");if(!created)return;
 }
 const qty=Math.max(1,Math.min(99,Math.round(Number(count)||1)));
 if(ws.lists.length===1){
  const l=ws.lists[0];
  await changeItem(l.id,c.id,Math.min(99,(Number(l.items?.[c.id])||0)+qty));
  return;
 }
 document.querySelector(".wants-add-modal")?.remove();
 const el=document.createElement("div");el.className="modalback wants-add-modal";
 el.innerHTML='<div class="modal"><div class="sectionhead"><h2>Añadir a wants</h2><button class="close" type="button" id="wantModalClose">×</button></div>'+
  '<div class="wants-modal-card">'+cardImg(c,"wants-search-art")+'<div><b>'+h(c.name||c.id)+'</b><small>'+h(c.id)+'</small>'+
  '<small>'+currency(priceOf(c))+'</small></div></div>'+
  '<label>Lista<select class="field" id="wantModalList">'+ws.lists.map(l=>
   '<option value="'+h(l.id)+'"'+(l.id===ws.selected?" selected":"")+'>'+h(l.name)+'</option>').join("")+'</select></label>'+
  '<label>Copias a añadir<input class="field" id="wantModalQty" type="number" min="1" max="99" value="'+qty+'"></label>'+
  '<button class="primary btn" id="wantModalSave" type="button">Añadir a lista</button></div>';
 document.body.appendChild(el);
 const close=()=>el.remove();
 el.querySelector("#wantModalClose").onclick=close;el.onclick=e=>{if(e.target===el)close()};
 el.querySelector("#wantModalSave").onclick=async()=>{
  const id=el.querySelector("#wantModalList").value,l=ws.lists.find(x=>x.id===id);
  const n=Math.max(1,Math.min(99,Math.round(Number(el.querySelector("#wantModalQty").value)||1)));
  if(l&&await changeItem(l.id,c.id,Math.min(99,(Number(l.items?.[c.id])||0)+n)))close();
 };
}
function bind(){
 document.querySelector("#closeWants")?.addEventListener("click",()=>{state.wantsOpen=false;renderShell()});
 document.querySelector("#retryWants")?.addEventListener("click",()=>void load(true));
 document.querySelector("#newWantList")?.addEventListener("click",()=>{
  const name=prompt("Nombre de la nueva lista de wants","");
  if(name!==null)void createList(name);
 });
 document.querySelectorAll("[data-wants-list]").forEach(b=>b.onclick=()=>{ws.selected=b.dataset.wantsList;ws.search="";renderShell()});
 document.querySelector("#renameWantList")?.addEventListener("click",async()=>{
  const l=active();if(!l||!needLogin())return;
  const name=prompt("Nuevo nombre de la lista",l.name);
  if(!name||!name.trim()||name.trim()===l.name)return;
  const r=await state.sb.from("user_want_lists").update({name:name.trim().slice(0,80),updated_at:new Date().toISOString()})
   .eq("user_id",state.user.id).eq("id",l.id);
  if(r.error)notify("No se ha podido renombrar la lista");
  else{l.name=name.trim().slice(0,80);renderShell()}
 });
 document.querySelector("#deleteWantList")?.addEventListener("click",async()=>{
  const l=active();if(!l||!confirm("¿Eliminar la lista «"+l.name+"» y todas sus wants?"))return;
  const r=await state.sb.from("user_want_lists").delete().eq("user_id",state.user.id).eq("id",l.id);
  if(r.error)return notify("No se pudo eliminar la lista");
  ws.lists=ws.lists.filter(x=>x.id!==l.id);ws.selected=ws.lists[0]?.id||"";renderShell();
 });
 document.querySelector("#wantsSearch")?.addEventListener("input",ev=>{
  ws.search=ev.target.value;
  const el=document.querySelector("#wantsSearchResults");
  if(el)el.innerHTML=searchResults();
  bindSearchAdd();
 });
 bindSearchAdd();
 const l=active();
 for(const [attr,op] of [["wants-plus",1],["wants-minus",-1],["wants-remove",0]]){
  document.querySelectorAll("[data-"+attr+"]").forEach(b=>b.onclick=async()=>{
   const id=b.dataset[attr.replace(/-([a-z])/g,(_,x)=>x.toUpperCase())];
   if(!l||!id)return;
   const existing=Number(l.items?.[id])||0,next=op===0?0:Math.max(0,Math.min(99,existing+op));
   if(existing!==next)await changeItem(l.id,id,next);
  });
 }
 if(!ws.loaded&&!ws.loading&&!ws.error)void load();
}
window.MyWants={view,bind,load,add:showAdd,consume,consumeBatch};
const style=document.createElement("style");
style.textContent=".wants-page{max-width:1080px;padding-bottom:110px}.wants-panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px}.wants-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px}.wants-heading h3{margin:0}.wants-list-switch{display:flex;flex-wrap:wrap;gap:8px}.wants-list-switch button{border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--text);padding:10px 14px;font-weight:700}.wants-list-switch button.active{border-color:var(--accent);color:var(--accent)}.wants-list-actions{display:flex;gap:7px}.wants-totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.wants-totals>div{background:var(--panel2);border:1px solid var(--line);padding:11px;border-radius:11px}.wants-totals b{font-size:clamp(16px,3vw,25px);display:block}.wants-totals small,.wants-card-info small,.wants-search-row small{display:block;color:var(--muted);font-size:11px}.wants-search-label{display:grid;gap:6px;margin-top:13px}.wants-search-grid{max-height:340px;overflow:auto;margin-top:9px}.wants-search-row{display:flex;align-items:center;gap:10px;padding:7px;border-bottom:1px solid var(--line)}.wants-search-row>div{flex:1;min-width:0}.wants-search-art{height:66px;width:46px;object-fit:cover;border-radius:5px;flex:none}.wants-cards{display:grid;gap:8px}.wants-card{display:flex;gap:12px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:10px;min-width:0}.wants-card-art{width:65px;height:91px;border-radius:5px;object-fit:cover;flex:none}.wants-card-info{flex:1;min-width:0}.wants-card-info strong,.wants-card-info span,.wants-card-info a{display:block;margin:3px 0}.wants-card-info a{font-size:12px;color:var(--accent)}.wants-card-controls{display:grid;grid-template-columns:repeat(3,auto);gap:5px;align-items:center;text-align:center}.wants-card-controls .wants-remove{grid-column:1/-1}.wants-add-modal .modal{max-width:430px;display:grid;gap:13px}.wants-add-modal label{display:grid;gap:6px}.wants-modal-card{display:flex;gap:11px;align-items:center}.wants-modal-card small{display:block;color:var(--muted)}@media(max-width:590px){.wants-totals{grid-template-columns:repeat(2,minmax(0,1fr))}.wants-card{flex-wrap:wrap}.wants-card-art{width:52px;height:73px}.wants-card-controls{margin-left:auto}}";
document.head.appendChild(style);
})();
