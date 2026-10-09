/* Seguimiento optativo de copias físicas. Nunca altera collection_items ni deck_cards. */
(function(){
"use strict";
const p={userId:null,ready:false,loading:null,enabled:false,allocations:{},revision:0,exists:false,busy:false,error:"",modal:null,selected:null,preview:false};
const integer=n=>Math.max(0,Math.floor(Number(n)||0));
const identity=id=>String(id||"");
const decks=()=>state.decks.filter(d=>!d.draftCompetitive);
const getDeck=id=>decks().find(d=>d.id===id);
const code=id=>deckPrintedCode(id);
const owned=()=>state.collectionReady?state.owned||{}:{};
const escape=s=>esc(s);
function account(){
 const id=state.user?.id||null;
 if(p.userId===id)return;
 if(p.modal)p.modal.remove();
 Object.assign(p,{userId:id,ready:false,loading:null,enabled:false,allocations:{},revision:0,exists:false,busy:false,error:"",modal:null,selected:null,preview:false});
}
function sanitize(raw){
 const result={};
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return result;
 for(const [deckId,prints] of Object.entries(raw)){
  if(!/^[a-f0-9-]{36}$/i.test(deckId)||!prints||typeof prints!=="object"||Array.isArray(prints))continue;
  const entries=Object.entries(prints).filter(([id,q])=>id.length<=150&&integer(q)>0).map(([id,q])=>[id,Math.min(9999,integer(q))]);
  if(entries.length)result[deckId]=Object.fromEntries(entries);
 }
 return result;
}
function clone(){return JSON.parse(JSON.stringify(p.allocations));}
function put(where,deckId,id,delta){
 if(!delta)return;
 const bin=where[deckId]||(where[deckId]={});
 const next=integer(bin[id])+delta;
 if(next>0)bin[id]=next;else delete bin[id];
 if(!Object.keys(bin).length)delete where[deckId];
}
function activeAlloc(raw){
 const ids=new Set(decks().map(d=>d.id)),res={};
 for(const [deckId,prints] of Object.entries(raw||{}))if(ids.has(deckId))res[deckId]=prints;
 return res;
}
function usedByPrinting(raw){
 const counts={};
 for(const prints of Object.values(activeAlloc(raw)))for(const [id,q] of Object.entries(prints))counts[id]=(counts[id]||0)+integer(q);
 return counts;
}
function requirements(deck){
 const result=new Map();
 function add(id,n){
  const amount=integer(n);
  if(!id||!amount)return;
  const key=code(id),old=result.get(key)||{code:key,need:0,preferred:[],title:card(id)?.name||key};
  old.need+=amount;
  if(!old.preferred.includes(id))old.preferred.push(id);
  result.set(key,old);
 }
 if(deck?.leader)add(deck.leader,1);
 for(const [id,n] of Object.entries(deck?.cards||{}))add(id,n);
 return result;
}
function stats(deck,raw=p.allocations){
 const needs=requirements(deck),prints=raw[deck.id]||{};
 let assigned=0,required=0,extra=0;
 const byCode={};
 for(const [id,q] of Object.entries(prints))byCode[code(id)]=(byCode[code(id)]||0)+integer(q);
 for(const [key,row] of needs){
  required+=row.need;assigned+=Math.min(row.need,byCode[key]||0);
  extra+=Math.max(0,(byCode[key]||0)-row.need);
 }
 for(const [key,n] of Object.entries(byCode))if(!needs.has(key))extra+=n;
 const status=required===0?"vacío":assigned===required&&!extra?"montado":assigned===0?"desmontado":"incompleto";
 return {required,assigned,extra,status};
}
function statusMark(deck,clickable=true){
 account();
 if(!p.ready||!p.enabled||!state.collectionReady||!deck||deck.draftCompetitive)return "";
 const s=stats(deck),tone=s.status==="montado"?"ok":s.status==="incompleto"?"partial":"empty";
 const symbol=s.status==="montado"?"✓":s.status==="incompleto"?"◐":"○";
 const label=symbol+' '+escape(s.status)+' · '+s.assigned+'/'+s.required;
 const title='Copias físicas asignadas: '+s.assigned+' de '+s.required;
 return clickable
  ?'<button type="button" class="physical-chip '+tone+'" data-physical-open="'+escape(deck.id)+'" aria-label="Gestionar copias de '+escape(deck.name)+': '+escape(s.status)+'" title="'+title+'">'+label+'</button>'
  :'<span class="physical-chip '+tone+'" title="'+title+'">'+label+'</span>';
}
function discrepancies(raw=p.allocations){
 const used=usedByPrinting(raw);
 return Object.entries(used).filter(([id,n])=>n>integer(owned()[id]))
  .map(([id,n])=>({id,missing:n-integer(owned()[id])}));
}
async function load(force=false){
 account();
 if(!p.userId||!state.sb||!state.collectionReady)return false;
 if(p.loading)return p.loading;
 if(p.ready&&!force)return true;
 const uid=p.userId,client=state.sb;
 p.loading=(async()=>{
  try{
   const res=await client.from("deck_physical_locations")
    .select("enabled,allocations,revision").eq("user_id",uid).maybeSingle();
   if(res.error)throw res.error;
   if(p.userId!==uid)return false;
   p.exists=!!res.data;
   p.enabled=res.data?.enabled===true;
   p.allocations=sanitize(res.data?.allocations);
   p.revision=Number(res.data?.revision)||0;
   p.error="";p.ready=true;
   if(state.tab==="decks")renderShell();
   return true;
  }catch(error){
   if(p.userId===uid){p.error="No se pudieron cargar las ubicaciones: "+(error.message||error);p.ready=false;}
   return false;
  }finally{if(p.userId===uid)p.loading=null}
 })();
 return p.loading;
}
async function save(raw,enabled=p.enabled){
 account();
 if(!p.ready||!p.userId||!state.sb||p.busy)return false;
 const uid=p.userId,revision=p.revision,client=state.sb;
 const allocations=sanitize(activeAlloc(raw));
 p.busy=true;
 try{
  let res;
  if(p.exists){
   res=await client.from("deck_physical_locations")
    .update({allocations,enabled,revision:revision+1,updated_at:new Date().toISOString()})
    .eq("user_id",uid).eq("revision",revision).select("revision").maybeSingle();
  }else{
   res=await client.from("deck_physical_locations")
    .insert({user_id:uid,allocations,enabled,revision:1}).select("revision").maybeSingle();
  }
  if(p.userId!==uid)return false;
  if(res.error){
   if(res.error.code==="23505"){p.ready=false;await load(true);notify("Las ubicaciones han cambiado en otro dispositivo. Revísalas antes de repetir.");return false;}
   throw res.error;
  }
  if(!res.data){
   p.ready=false;await load(true);
   notify("Las ubicaciones han cambiado en otro dispositivo. Revísalas antes de repetir.");
   return false;
  }
  p.allocations=allocations;p.enabled=enabled;p.exists=true;p.revision=Number(res.data.revision);
  p.error="";
  renderShell();
  return true;
 }catch(error){
  if(p.userId===uid){p.error="No se pudieron guardar las ubicaciones: "+(error.message||error);notify(p.error);}
  return false;
 }finally{if(p.userId===uid){p.busy=false;if(p.modal)draw()}}
}
function preferredIds(row){
 const choices=Object.keys(owned()).filter(id=>integer(owned()[id])>0&&code(id)===row.code);
 return choices.sort((a,b)=>{
  const ax=row.preferred.includes(a)?0:1,bx=row.preferred.includes(b)?0:1;
  return ax-bx||integer(owned()[b])-integer(owned()[a])||a.localeCompare(b,"es");
 });
}
function plan(deck){
 const next=activeAlloc(clone()),needs=requirements(deck),changes=[],missing=[];
 // A saved list may have been edited since the cards were placed in the box.
 // Return only assignments no longer required; never erase the list itself.
 const current=next[deck.id]||{};
 const existingCodes=new Set(Object.keys(current).map(code));
 for(const groupCode of existingCodes){
  const allowed=needs.get(groupCode)?.need||0;
  const ids=Object.keys(next[deck.id]||{}).filter(id=>code(id)===groupCode);
  const count=ids.reduce((sum,id)=>sum+integer(next[deck.id]?.[id]),0);
  let extra=Math.max(0,count-allowed);
  for(const id of ids.reverse()){
   if(!extra)break;
   const amount=Math.min(extra,integer(next[deck.id]?.[id]));
   put(next,deck.id,id,-amount);
   changes.push({id,from:deck.id,to:null,quantity:amount});
   extra-=amount;
  }
 }
 for(const row of needs.values()){
  let have=Object.entries(next[deck.id]||{}).reduce((s,[id,n])=>s+(code(id)===row.code?integer(n):0),0);
  let missingCount=Math.max(0,row.need-have);
  if(!missingCount)continue;
  // Free copies always take precedence, including cards newly added to the album.
  for(const id of preferredIds(row)){
   if(!missingCount)break;
   const free=Math.max(0,integer(owned()[id])-integer(usedByPrinting(next)[id]));
   const take=Math.min(free,missingCount);
   if(take){put(next,deck.id,id,take);changes.push({id,from:null,to:deck.id,quantity:take});missingCount-=take}
  }
  if(!missingCount)continue;
  // Choose incomplete donors first; avoid disturbing an intact box unnecessarily.
  const donors=decks().filter(d=>d.id!==deck.id&&next[d.id])
   .sort((a,b)=>{
    const aIncomplete=stats(a,next).status!=="montado"?0:1,bIncomplete=stats(b,next).status!=="montado"?0:1;
    return aIncomplete-bIncomplete||a.name.localeCompare(b.name,"es");
   });
  for(const donor of donors){
   for(const id of Object.keys(next[donor.id]||{})){
    if(!missingCount)break;
    if(code(id)!==row.code)continue;
    const take=Math.min(missingCount,integer(next[donor.id][id]));
    put(next,donor.id,id,-take);
    put(next,deck.id,id,take);
    changes.push({id,from:donor.id,to:deck.id,quantity:take});
    missingCount-=take;
   }
   if(!missingCount)break;
  }
  if(missingCount)missing.push({id:row.preferred[0],code:row.code,title:row.title,quantity:missingCount});
 }
 return {next,changes,missing,current:stats(deck),after:stats(deck,next)};
}
function cardTitle(id){
 const cd=card(id);
 const fallback=state.cards.find(c=>code(c.id)===code(id));
 return escape(cd?.name||fallback?.name||code(id))+' <small class="muted">('+escape(id)+')</small>';
}
function fromTitle(id){
 return id?escape(getDeck(id)?.name||"Mazo eliminado"):"Álbum · libres";
}
// La ilustración siempre corresponde a la impresión exacta; nunca se sustituye por otra variante.
function cardPhoto(id){
 const exact=card(id);
 return exact?cardImg(exact,"physical-card-photo"):
  '<div class="physical-card-photo physical-card-photo-empty" role="img" aria-label="Imagen no disponible">Sin imagen</div>';
}
function draw(){
 if(!p.modal)return;
 const modal=p.modal;
 const saved=decks(),selected=getDeck(p.selected);
 if(p.selected&&!selected){p.selected=null;p.preview=false}
 let html='<div class="physical-dialog"><div class="sectionhead"><h2>📍 Copias físicas</h2><button type="button" class="close" data-physical-close aria-label="Cerrar">×</button></div>';
 if(p.error)html+='<div class="notice physical-warning">'+escape(p.error)+'</div>';
 if(!p.enabled){
  html+='<p>Esta herramienta es opcional. Por defecto, todas tus copias están libres en el álbum y las listas de mazos funcionan como siempre.</p>'+
   '<p class="small muted">Al activarla, podrás marcar los mazos montados y transferir solo las cartas necesarias entre cajas. No se modificarán las cantidades de tu colección.</p>'+
   '<button type="button" class="primary btn" data-physical-enable '+(p.busy?'disabled':'')+'>Activar seguimiento</button>';
 }else if(selected){
  const s=stats(selected);
  html+='<button type="button" class="linkbtn physical-back" data-physical-back>← Todos mis mazos</button>'+
   '<h3>'+escape(selected.name)+'</h3><p>'+statusMark(selected,false)+'</p>'+
   '<p class="small muted">Asignadas '+s.assigned+' de '+s.required+' copias. Las demás permanecen donde están; la lista nunca se borra.</p>';
  const result=plan(selected);
  if(p.preview){
   html+='<h3>Movimientos para montar este mazo</h3>';
   if(result.changes.length){
    html+='<div class="physical-movements">'+result.changes.map(step=>
     '<div class="physical-movement">'+cardPhoto(step.id)+'<div class="physical-card-info"><b>'+step.quantity+' × '+cardTitle(step.id)+'</b>'+
     '<div class="small">'+(step.to?fromTitle(step.from)+' → '+escape(selected.name):escape(selected.name)+' → Álbum')+'</div></div></div>').join("")+'</div>';
   }else html+='<p class="notice">No necesitas mover ninguna copia.</p>';
   if(result.missing.length)html+='<div class="notice physical-warning"><b>No hay copias suficientes. Estas cartas seguirán pendientes:</b></div>'+
    '<div class="physical-movements">'+result.missing.map(x=>'<div class="physical-movement physical-missing">'+cardPhoto(x.id)+
    '<div class="physical-card-info"><b>Faltan '+x.quantity+' × '+escape(x.title)+'</b><div class="small muted">'+escape(x.code)+'</div></div></div>').join('')+'</div>';
   html+='<p class="small muted">Después: '+result.after.assigned+'/'+result.after.required+
    ' copias. Se priorizan siempre las libres del álbum y se mantiene la impresión real de cada copia.</p>'+
    '<div class="physical-buttons">'+
    (result.changes.length?'<button class="primary btn" type="button" data-physical-apply '+(p.busy?'disabled':'')+'>Confirmar movimientos</button>':'')+
    '<button class="secondary btn" type="button" data-physical-cancel>Volver</button></div>';
  }else{
   html+='<div class="physical-buttons"><button class="primary btn" type="button" data-physical-plan '+(p.busy?'disabled':'')+'>'+(s.assigned?'Completar / remontar':'Montar mazo')+'</button>'+
    (Object.keys(p.allocations[selected.id]||{}).length?'<button class="secondary btn" type="button" data-physical-unmount '+(p.busy?'disabled':'')+'>Desmontar por completo</button>':'')+'</div>';
   if(s.assigned<s.required)html+='<p class="small muted">Al montar, solo se buscarán las '+(s.required-s.assigned)+' copias que faltan. No se moverán las que ya tiene el mazo.</p>';
   if(s.extra)html+='<p class="notice physical-warning">La lista ha cambiado: hay '+s.extra+' copias asignadas de más. Al remontar, se devolverán al álbum.</p>';
  }
 }else{
  const total=Object.values(owned()).reduce((s,n)=>s+integer(n),0),used=Object.values(usedByPrinting(p.allocations)).reduce((s,n)=>s+n,0);
  html+='<p class="small">📚 En álbum / libres: <b>'+Math.max(0,total-used)+'</b> · En mazos: <b>'+used+'</b></p>';
  const errors=discrepancies();
  if(errors.length)html+='<div class="notice physical-warning">Hay '+errors.length+' impresiones con más copias asignadas que las registradas en tu colección. Corrige las ubicaciones para evitar movimientos imposibles. <button class="secondary btn" type="button" data-physical-repair '+(p.busy?'disabled':'')+'>Ajustar excesos</button></div>';
  if(!saved.length)html+='<p>Aún no tienes mazos guardados.</p>';
  else html+='<div class="physical-deck-list">'+saved.map(d=>{
   const s=stats(d);
   return '<div class="physical-deck-line"><div><b>'+escape(d.name)+'</b><div>'+statusMark(d,false)+'</div></div>'+
    '<button type="button" class="secondary btn" data-physical-deck="'+escape(d.id)+'">Gestionar</button></div>';
  }).join("")+'</div>';
  html+='<div class="physical-footer"><button type="button" class="linkbtn" data-physical-disable>Desactivar seguimiento (conservar ubicaciones)</button></div>';
 }
 html+='</div>';
 modal.innerHTML=html;
 modal.querySelector('[data-physical-close]')?.addEventListener('click',close);
 modal.querySelector('[data-physical-enable]')?.addEventListener('click',async()=>{if(await save(clone(),true))draw()});
 modal.querySelector('[data-physical-disable]')?.addEventListener('click',async()=>{if(confirm('¿Ocultar el seguimiento físico? Las ubicaciones quedarán guardadas para cuando lo reactives.')){if(await save(clone(),false)){p.selected=null;p.preview=false;draw()}}});
 modal.querySelectorAll('[data-physical-deck]').forEach(b=>b.onclick=()=>{p.selected=b.dataset.physicalDeck;p.preview=false;draw()});
 modal.querySelector('[data-physical-back]')?.addEventListener('click',()=>{p.selected=null;p.preview=false;draw()});
 modal.querySelector('[data-physical-plan]')?.addEventListener('click',()=>{p.preview=true;draw()});
 modal.querySelector('[data-physical-cancel]')?.addEventListener('click',()=>{p.preview=false;draw()});
 modal.querySelector('[data-physical-apply]')?.addEventListener('click',async()=>{
  const current=getDeck(p.selected);if(!current)return;
  if(discrepancies().length)return notify("Ajusta antes las copias que exceden tu colección.");
  const result=plan(current);
  if(await save(result.next)){p.preview=false;notify(result.missing.length?"Movimientos guardados; quedan copias pendientes.":"Mazo montado y ubicaciones guardadas.");draw()}
 });
 modal.querySelector('[data-physical-unmount]')?.addEventListener('click',async()=>{
  const current=getDeck(p.selected);if(!current)return;
  if(!confirm('¿Devolver al álbum todas las copias de «'+current.name+'»? Se conservará su lista.'))return;
  const next=clone();delete next[current.id];
  if(await save(next)){notify('Copias devueltas al álbum; la lista sigue guardada.');draw()}
 });
 modal.querySelector('[data-physical-repair]')?.addEventListener('click',async()=>{
  if(!confirm('Las copias asignadas que excedan lo registrado en tu colección dejarán de figurar en sus mazos. ¿Continuar?'))return;
  const next=clone(),errors=discrepancies();
  for(const item of errors){
   let remaining=item.missing;
   for(const d of [...decks()].reverse()){
    if(!remaining)break;
    const amount=Math.min(remaining,integer(next[d.id]?.[item.id]));
    if(amount){put(next,d.id,item.id,-amount);remaining-=amount}
   }
  }
  if(await save(next)){notify('Ubicaciones ajustadas a las cantidades del álbum.');draw()}
 });
}
function close(){
 if(p.modal){p.modal.remove();p.modal=null}
 p.selected=null;p.preview=false;
}
async function open(id){
 account();
 if(!state.user||!state.collectionReady)return notify('Inicia sesión y carga tu colección para gestionar copias.');
 if(!await load())return notify(p.error||'No se pudo cargar el seguimiento.');
 close();
 p.selected=getDeck(id)?id:null;
 p.modal=document.createElement('div');p.modal.className='modalback physical-modal';
 p.modal.addEventListener('click',e=>{if(e.target===p.modal)close()});
 document.body.appendChild(p.modal);draw();
}
function bind(){
 account();
 document.querySelectorAll('[data-physical-open]').forEach(button=>{
  button.addEventListener('click',()=>void open(button.dataset.physicalOpen));
 });
 if(state.user&&state.sb&&state.collectionReady&&!p.ready&&!p.loading)void load();
}
async function forgetDeleted(id){
 account();
 if(!p.ready||!p.allocations[id])return;
 const next=clone();delete next[id];
 await save(next);
}
async function clearDeleted(){
 account();
 if(!p.ready)return;
 if(Object.keys(p.allocations).length)await save({});
}
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&p.modal){close();e.stopPropagation()}});
window.DeckPhysical={bind,open,load,statusMark,forgetDeleted,clearDeleted,
 _testing:{sanitize,requirements,stats,plan,discrepancies,usedByPrinting}};
})();
