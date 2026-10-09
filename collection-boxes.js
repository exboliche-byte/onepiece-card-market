/* Private boxes: overlapping groups of exact card printings already in collection. */
(function(){
"use strict";
const bs={owner:"",boxes:[],members:[],selected:"",loaded:false,loading:false,busy:false,
 search:"",filter:"",error:""};
const escapeText=x=>esc(x);
function reset(owner=""){
 bs.owner=owner;bs.boxes=[];bs.members=[];bs.selected="";bs.loaded=false;bs.loading=false;
 bs.busy=false;bs.search="";bs.filter="";bs.error="";
}
function current(){return bs.boxes.find(b=>b.id===bs.selected)||null}
function printed(id){return state.cards.find(c=>c.id===id)||null}
function owned(id){return Math.max(0,Number(state.owned?.[id]||0))}
function entries(box){
 if(!box)return [];
 return bs.members.filter(m=>m.box_id===box.id&&owned(m.card_id)>0)
  .map(m=>({id:m.card_id,quantity:owned(m.card_id),card:printed(m.card_id)}))
  .sort((a,b)=>String(a.card?.name||a.id).localeCompare(String(b.card?.name||b.id),"es",{numeric:true}));
}
function visibleBoxEntries(box){const query=norm(bs.filter.trim());return entries(box).filter(x=>!query||
 norm([x.id,x.card?.name,x.card?.set].join(" ")).includes(query))}
function countBox(box){return entries(box).length}
function uniqueTotal(){return new Set(bs.members.filter(m=>owned(m.card_id)>0).map(m=>m.card_id)).size}
function mayWrite(){if(state.user?.id&&state.sb&&state.collectionReady)return true;notify("Inicia sesión y espera a que se cargue tu colección.");return false}
async function load(force=false){
 const owner=state.user?.id||"";
 if(owner!==bs.owner)reset(owner);
 if(!owner||!state.sb||!state.collectionReady||bs.loading||(!force&&bs.loaded))return;
 bs.loading=true;bs.error="";
 try{
  const [boxes,items]=await Promise.all([
   state.sb.from("user_collection_boxes").select("id,name,created_at,updated_at").eq("user_id",owner)
    .order("created_at",{ascending:true}).limit(150),
   (async()=>{
     const result=[];
     for(let offset=0;offset<20000;offset+=500){
      const page=await state.sb.from("user_collection_box_cards").select("box_id,card_id")
       .eq("user_id",owner).order("box_id",{ascending:true}).order("card_id",{ascending:true})
       .range(offset,offset+499);
      if(page.error)throw page.error;
      result.push(...(page.data||[]));
      if((page.data||[]).length<500)break;
     }
     return result;
   })()
  ]);
  if(boxes.error)throw boxes.error;
  if(state.user?.id!==owner)return;
  bs.boxes=boxes.data||[];bs.members=items;bs.loaded=true;bs.error="";
  if(!bs.boxes.some(b=>b.id===bs.selected))bs.selected="";
 }catch(error){
  console.warn("collection boxes load",error);bs.error=String(error.message||error);
 }finally{
  bs.loading=false;
  if(state.user?.id===owner&&state.tab==="collection"&&state.boxesOpen)renderShell();
 }
}
function overview(){
 const boxes=bs.boxes.map(box=>{
  const rows=entries(box),pics=rows.slice(0,4).filter(x=>x.card);
  return '<button type="button" class="collection-box-tile" data-box-open="'+escapeText(box.id)+'">'+
    '<div class="collection-box-cover">'+(pics.length?pics.map(x=>cardImg(x.card,"collection-box-cover-art")).join(""):
      '<span class="collection-box-empty">📦</span>')+'</div>'+
    '<div class="collection-box-tile-info"><b>'+escapeText(box.name)+'</b>'+
      '<span>'+rows.length+' cartas · '+rows.reduce((n,x)=>n+x.quantity,0)+' copias</span></div>'+
    '<span aria-hidden="true">›</span></button>';
 }).join("");
 return '<section class="section collection-box-overview"><div class="collection-box-heading">'+
    '<h2>Mis cajas</h2><button class="primary btn" id="createCollectionBox">+ Nueva caja</button></div>'+
    '<p class="small">Agrupa las cartas de tu colección en álbumes propios. Una misma carta puede estar en varias cajas sin duplicar copias.</p>'+
    '<div class="collection-box-tiles">'+(boxes||'<div class="notice">Todavía no tienes cajas. Crea una para empezar a organizar tus cartas.</div>')+'</div>'+
    '<p class="small">'+bs.boxes.length+' cajas · '+uniqueTotal()+' cartas diferentes organizadas</p></section>';
}
function findAvailable(){
 const query=norm(bs.search.trim());
 if(query.length<2)return '<p class="small">Busca por nombre, código o expansión entre las cartas que ya tienes.</p>';
 const inBox=new Set(bs.members.filter(m=>m.box_id===bs.selected).map(m=>m.card_id));
 const matches=state.cards.filter(c=>owned(c.id)>0&&!inBox.has(c.id)&&
   norm([c.id,c.name,cardExpansionCode(c)].join(" ")).includes(query)).slice(0,30);
 if(!matches.length)return '<p class="small">No hay otras cartas de tu colección con esa búsqueda.</p>';
 return '<div class="collection-box-add-results">'+matches.map(c=>
  '<div class="collection-box-add-row">'+cardImg(c,"collection-box-mini-art")+
   '<div><b>'+escapeText(c.name||c.id)+'</b><small>'+escapeText(c.id)+
   ' · ×'+owned(c.id)+' · '+money(priceOf(c))+'</small></div>'+
   '<button class="primary btn" data-box-add="'+escapeText(c.id)+'">Añadir</button></div>').join("")+'</div>';
}
function detail(box){
 const rows=visibleBoxEntries(box),all=entries(box);
 const priced=all.filter(x=>x.card&&priceOf(x.card)!==null);
 const total=priced.reduce((sum,x)=>sum+x.quantity*priceOf(x.card),0);
 return '<section class="section collection-box-detail">'+
  '<div class="collection-box-heading"><div><h2>'+escapeText(box.name)+'</h2>'+
  '<p class="small">'+all.length+' cartas · '+all.reduce((sum,x)=>sum+x.quantity,0)+' copias · Valor conocido: '+money(total)+
  '</p></div><div class="collection-box-actions"><button class="secondary btn" id="renameCollectionBox">Renombrar</button>'+
  '<button class="danger btn" id="deleteCollectionBox">Eliminar</button></div></div>'+
  '<div class="collection-box-add-panel"><h3>Añadir cartas desde mi colección</h3>'+
  '<input id="boxCardSearch" class="field" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar cartas que ya tienes..." value="'+escapeText(bs.search)+'">'+
  '<div id="boxSearchResults">'+findAvailable()+'</div></div>'+
  '<div class="collection-box-heading"><h3>Cartas de la caja</h3><input id="boxContentsFilter" class="field" type="search" autocomplete="off" placeholder="Filtrar esta caja" value="'+escapeText(bs.filter)+'"></div>'+
  '<div id="boxContentsResults">'+contents(box)+'</div></section>';
}
function contents(box){
 const rows=visibleBoxEntries(box);
 if(!rows.length)return '<div class="notice">'+(entries(box).length?
  'No hay coincidencias con este filtro.':'Esta caja aún no contiene cartas que tengas en tu colección.')+'</div>';
 return '<div class="collection-box-contents">'+rows.map(x=>{
  const price=x.card?priceOf(x.card):null;
  return '<article class="collection-box-member">'+(x.card?cardImg(x.card,"collection-box-member-art"):'<div class="collection-box-member-art">?</div>')+
   '<div class="collection-box-member-details"><strong>'+escapeText(x.card?.name||x.id)+'</strong>'+
   '<small>'+escapeText(x.id)+' · '+escapeText(x.card?cardPrintLabel(x.card):"")+'</small>'+
   '<small>×'+x.quantity+' en tu colección · '+money(price)+' / copia</small></div>'+
   '<button type="button" class="secondary btn" data-box-remove="'+escapeText(x.id)+'" title="Quitar de esta caja">Quitar</button></article>';
 }).join("")+'</div>';
}
function view(){
 if(!state.user?.id||bs.owner!==state.user.id){
  return '<div class="wrap"><div class="notice">Cargando las cajas de tu cuenta…</div></div>';
 }
 const box=current();
 return '<div class="wrap collection-box-page"><div class="hero"><div><h1>📦 Mis cajas</h1>'+
  '<p>Organiza las cartas que tienes sin cambiar las cantidades de tu colección.</p></div>'+
  '<button type="button" class="secondary btn" id="collectionBoxesBack">'+(box?'← Todas las cajas':'← Mi colección')+'</button></div>'+
  (bs.error?'<div class="notice">No se pudieron cargar las cajas: '+escapeText(bs.error)+
   ' <button class="secondary btn" id="retryCollectionBoxes">Reintentar</button></div>':"")+
  (bs.loading&&!bs.loaded?'<div class="notice">Sincronizando tus cajas…</div>':"")+
  (box?detail(box):overview())+'</div>';
}
async function create(){
 if(!mayWrite())return;
 const name=prompt("Nombre de la caja, por ejemplo Luffy o Thriller Bark","");
 if(name===null)return;
 const title=name.trim().slice(0,80);if(!title)return notify("Escribe un nombre para la caja.");
 const owner=state.user.id,id=crypto.randomUUID();
 try{
  const result=await state.sb.from("user_collection_boxes")
   .insert({id,user_id:owner,name:title})
   .select("id,name,created_at,updated_at").single();
  if(result.error)throw result.error;
  if(state.user?.id!==owner)return;
  bs.boxes.push(result.data);bs.selected=result.data.id;bs.search="";bs.filter="";renderShell();
  notify("Caja creada");
 }catch(error){console.warn("create box",error);notify("No se pudo guardar la caja.");}
}
async function toggleItem(cardId,add){
 if(!mayWrite()||bs.busy||!current())return;
 const box=current(),owner=state.user.id;
 if(add&&owned(cardId)<1)return notify("Solo puedes añadir cartas que tengas en tu colección.");
 if(add&&bs.members.some(m=>m.box_id===box.id&&m.card_id===cardId))return;
 bs.busy=true;
 try{
  const table=state.sb.from("user_collection_box_cards");
  const result=add?
   await table.insert({user_id:owner,box_id:box.id,card_id:cardId}):
   await table.delete().eq("user_id",owner).eq("box_id",box.id).eq("card_id",cardId);
  if(result.error)throw result.error;
  if(state.user?.id!==owner)return;
  if(add)bs.members.push({box_id:box.id,card_id:cardId});
  else bs.members=bs.members.filter(m=>m.box_id!==box.id||m.card_id!==cardId);
  renderShell();
  notify(add?"Carta añadida a esta caja":"Carta retirada de esta caja");
 }catch(error){console.warn("edit box items",error);notify("No se pudo actualizar la caja.");}
 finally{bs.busy=false}
}
async function rename(){
 const box=current();if(!box||!mayWrite())return;
 const name=prompt("Nuevo nombre de la caja",box.name);
 if(name===null||!name.trim()||name.trim()===box.name)return;
 const owner=state.user.id,title=name.trim().slice(0,80);
 const result=await state.sb.from("user_collection_boxes").update({name:title,updated_at:new Date().toISOString()})
  .eq("user_id",owner).eq("id",box.id);
 if(result.error)return notify("No se pudo renombrar la caja.");
 if(state.user?.id===owner){box.name=title;renderShell();}
}
async function removeBox(){
 const box=current();if(!box||!mayWrite()||!confirm('¿Eliminar la caja "'+box.name+'"? Las cartas de tu colección NO se borrarán.'))return;
 const owner=state.user.id,id=box.id;
 const result=await state.sb.from("user_collection_boxes").delete().eq("user_id",owner).eq("id",id);
 if(result.error)return notify("No se pudo eliminar la caja.");
 if(state.user?.id!==owner)return;
 bs.boxes=bs.boxes.filter(x=>x.id!==id);
 bs.members=bs.members.filter(x=>x.box_id!==id);
 bs.selected="";renderShell();notify("Caja eliminada; tu colección sigue intacta");
}
function bindRows(){
 document.querySelectorAll("[data-box-add]").forEach(b=>b.onclick=()=>void toggleItem(b.dataset.boxAdd,true));
 document.querySelectorAll("[data-box-remove]").forEach(b=>b.onclick=()=>void toggleItem(b.dataset.boxRemove,false));
}
function bind(){
 const owner=state.user?.id||"";
 if(owner!==bs.owner)reset(owner);
 document.querySelector("#collectionBoxesBack")?.addEventListener("click",()=>{
  if(bs.selected){bs.selected="";bs.search="";bs.filter="";}
  else state.boxesOpen=false;
  renderShell();
 });
 document.querySelector("#retryCollectionBoxes")?.addEventListener("click",()=>void load(true));
 document.querySelector("#createCollectionBox")?.addEventListener("click",()=>void create());
 document.querySelectorAll("[data-box-open]").forEach(b=>b.onclick=()=>{
  bs.selected=b.dataset.boxOpen;bs.search="";bs.filter="";renderShell();
 });
 document.querySelector("#renameCollectionBox")?.addEventListener("click",()=>void rename());
 document.querySelector("#deleteCollectionBox")?.addEventListener("click",()=>void removeBox());
 document.querySelector("#boxCardSearch")?.addEventListener("input",e=>{
  bs.search=e.target.value;const host=document.querySelector("#boxSearchResults");
  if(host){host.innerHTML=findAvailable();bindRows();}
 });
 document.querySelector("#boxContentsFilter")?.addEventListener("input",e=>{
  bs.filter=e.target.value;const host=document.querySelector("#boxContentsResults");
  if(host&&current()){host.innerHTML=contents(current());bindRows();}
 });
 bindRows();
 if(!bs.loaded&&!bs.loading&&!bs.error)void load();
}
window.CollectionBoxes={view,bind,load,entries};
const css=document.createElement("style");
css.textContent=".collection-box-page{max-width:1100px;padding-bottom:100px}.collection-box-overview,.collection-box-detail{padding:16px}.collection-box-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px}.collection-box-heading h2,.collection-box-heading h3{margin:0}.collection-box-heading input{max-width:290px}.collection-box-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin:14px 0}.collection-box-tile{width:100%;border:1px solid var(--line);border-radius:14px;padding:11px;display:flex;align-items:center;gap:12px;background:var(--panel2);color:var(--text);text-align:left}.collection-box-tile:hover{border-color:var(--accent)}.collection-box-cover{display:flex;overflow:hidden;width:86px;height:98px;flex:none;align-items:center}.collection-box-cover-art{height:85px;width:45px;object-fit:cover;border-radius:4px;margin-right:-25px;border:1px solid var(--line)}.collection-box-empty{font-size:34px}.collection-box-tile-info{flex:1;min-width:0}.collection-box-tile-info b{display:block;word-break:break-word}.collection-box-tile-info span{font-size:11px;color:var(--muted)}.collection-box-actions{display:flex;gap:7px}.collection-box-add-panel{background:var(--panel2);padding:13px;border:1px solid var(--line);border-radius:12px;margin-bottom:18px}.collection-box-add-panel h3{margin:0 0 10px}.collection-box-add-results{max-height:360px;overflow:auto;margin-top:10px}.collection-box-add-row{display:flex;align-items:center;gap:11px;padding:8px 0;border-bottom:1px solid var(--line)}.collection-box-add-row>div{flex:1;min-width:0}.collection-box-add-row b,.collection-box-add-row small{display:block}.collection-box-add-row small{font-size:11px;color:var(--muted)}.collection-box-mini-art{height:64px;width:44px;object-fit:cover;border-radius:5px;flex:none}.collection-box-contents{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:9px;margin-top:10px}.collection-box-member{display:flex;gap:9px;align-items:center;padding:10px;background:var(--panel2);border:1px solid var(--line);border-radius:10px}.collection-box-member-art{height:77px;width:54px;flex:none;object-fit:cover;border-radius:5px}.collection-box-member-details{flex:1;min-width:0}.collection-box-member-details strong,.collection-box-member-details small{display:block}.collection-box-member-details small{font-size:11px;color:var(--muted)}@media(max-width:590px){.collection-box-overview,.collection-box-detail{padding:10px}.collection-box-tiles{grid-template-columns:1fr}.collection-box-heading input{max-width:100%;width:100%}}";
document.head.appendChild(css);
})();
